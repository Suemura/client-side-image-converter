import { describe, expect, it } from "vitest";
import {
  applyAdjustmentToPixel,
  clampAdjustments,
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustments,
} from "../adjustments";
import {
  AUTO_LEVELS_CLIP_RATIO,
  averageRgb,
  channelMeansFromHistogram,
  clampSampleWindow,
  computeAutoLevels,
  computeAutoWhiteBalance,
  computeWhiteBalanceForNeutralPoint,
  displayPointToSourcePixel,
  histogramPercentileRange,
  WB_SAMPLE_RADIUS,
} from "../autoAdjust";
import { computeHistogram, HISTOGRAM_BINS } from "../histogram";

/** RGB ピクセル列（各 0-255）から RGBA バイト列を組み立てて実ヒストグラムを作る */
const histogramOf = (pixels: Array<[number, number, number]>) => {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  return computeHistogram(data);
};

/** 同一ピクセルを count 個並べる */
const fill = (
  rgb: [number, number, number],
  count: number,
): Array<[number, number, number]> => Array(count).fill(rgb);

/** 自動補正の結果（Partial）をパイプラインへ通すクロスチェック用ヘルパー */
const applyResult = (
  rgb: [number, number, number],
  overrides: Partial<typeof DEFAULT_ADJUSTMENTS>,
): [number, number, number] => {
  const state = clampAdjustments({ ...DEFAULT_ADJUSTMENTS, ...overrides });
  return applyAdjustmentToPixel(
    rgb[0],
    rgb[1],
    rgb[2],
    normalizeAdjustments(state),
  );
};

describe("histogramPercentileRange", () => {
  it("既知の 2 値分布で黒点・白点のビン位置を返す", () => {
    const bins = new Uint32Array(HISTOGRAM_BINS);
    bins[64] = 100;
    bins[192] = 100;
    const range = histogramPercentileRange(bins, AUTO_LEVELS_CLIP_RATIO);
    expect(range).not.toBeNull();
    expect(range?.low).toBeCloseTo(64 / 255, 10);
    expect(range?.high).toBeCloseTo(192 / 255, 10);
  });

  it("クリップ率以下の外れ値ビンを黒点・白点から除外する", () => {
    const bins = new Uint32Array(HISTOGRAM_BINS);
    bins[0] = 2;
    bins[128] = 1000;
    bins[255] = 2;
    // total = 1004, clipCount ≈ 5.02 → 両端の 2 カウントはクリップされる
    const range = histogramPercentileRange(bins, AUTO_LEVELS_CLIP_RATIO);
    expect(range?.low).toBeCloseTo(128 / 255, 10);
    expect(range?.high).toBeCloseTo(128 / 255, 10);
  });

  it("クリップ率 0 では最初と最後の非ゼロビンをそのまま返す", () => {
    const bins = new Uint32Array(HISTOGRAM_BINS);
    bins[0] = 2;
    bins[128] = 1000;
    bins[255] = 2;
    const range = histogramPercentileRange(bins, 0);
    expect(range?.low).toBe(0);
    expect(range?.high).toBe(1);
  });

  it("全ビン 0 のとき null を返す", () => {
    expect(
      histogramPercentileRange(
        new Uint32Array(HISTOGRAM_BINS),
        AUTO_LEVELS_CLIP_RATIO,
      ),
    ).toBeNull();
  });
});

describe("computeAutoLevels", () => {
  it("フルレンジ画像（黒点 0・白点 1）は無補正を返す", () => {
    const histogram = histogramOf([
      ...fill([0, 0, 0], 100),
      ...fill([255, 255, 255], 100),
    ]);
    expect(computeAutoLevels(histogram)).toEqual({ blacks: 0, whites: 0 });
  });

  it("低コントラスト画像で blacks が負・whites が正になる", () => {
    // グレー 51 (0.2) / 204 (0.8)。マスク重み 0.324 の逆算で ±62 になる
    const histogram = histogramOf([
      ...fill([51, 51, 51], 100),
      ...fill([204, 204, 204], 100),
    ]);
    const result = computeAutoLevels(histogram);
    expect(result).toEqual({ blacks: -62, whites: 62 });
  });

  it("クロスチェック: 逆算値をパイプラインへ通すと黒点画素 ≈ 0・白点画素 ≈ 1 に写る", () => {
    const histogram = histogramOf([
      ...fill([51, 51, 51], 100),
      ...fill([204, 204, 204], 100),
    ]);
    const result = computeAutoLevels(histogram);
    expect(result).not.toBeNull();
    if (!result) return;
    const black = applyResult([51 / 255, 51 / 255, 51 / 255], result);
    const white = applyResult([204 / 255, 204 / 255, 204 / 255], result);
    // UI 丸め（±0.5 UI 単位 × マスク重み ≤ 0.5）による誤差を許容
    for (const v of black) {
      expect(v).toBeLessThan(0.01);
    }
    for (const v of white) {
      expect(v).toBeGreaterThan(0.99);
    }
  });

  it("単一値画像は無補正を返す", () => {
    const histogram = histogramOf(fill([128, 128, 128], 100));
    expect(computeAutoLevels(histogram)).toEqual({ blacks: 0, whites: 0 });
  });

  it("マスク重みがほぼ 0 の端（黒点が 0.5 超）ではクランプで飽和する", () => {
    // グレー 160 (0.627) は blacksToneWeight = 0 の領域 → -100 へ飽和
    const histogram = histogramOf([
      ...fill([160, 160, 160], 100),
      ...fill([240, 240, 240], 100),
    ]);
    const result = computeAutoLevels(histogram);
    expect(result?.blacks).toBe(-100);
    expect(result?.whites).toBeGreaterThan(0);
  });

  it("空のヒストグラムは null を返す", () => {
    expect(computeAutoLevels(histogramOf([]))).toBeNull();
  });
});

describe("channelMeansFromHistogram", () => {
  it("チャンネル平均を [0,1] 正規化で返す", () => {
    const means = channelMeansFromHistogram(
      histogramOf([
        [100, 150, 200],
        [200, 150, 100],
      ]),
    );
    expect(means?.r).toBeCloseTo(150 / 255, 10);
    expect(means?.g).toBeCloseTo(150 / 255, 10);
    expect(means?.b).toBeCloseTo(150 / 255, 10);
  });

  it("ピクセル数 0 のとき null を返す", () => {
    expect(channelMeansFromHistogram(histogramOf([]))).toBeNull();
  });
});

describe("computeAutoWhiteBalance", () => {
  it("ニュートラルグレーは無補正を返す", () => {
    const histogram = histogramOf(fill([128, 128, 128], 100));
    expect(computeAutoWhiteBalance(histogram)).toEqual({
      temperature: 0,
      tint: 0,
    });
  });

  it("青かぶりで temperature が正（暖色方向）になる", () => {
    // avgB - avgR = 56/255 → temperature = 100·(56/255)/0.4 ≈ 55
    const histogram = histogramOf(fill([100, 128, 156], 100));
    const result = computeAutoWhiteBalance(histogram);
    expect(result?.temperature).toBe(55);
    expect(result?.tint).toBe(0);
  });

  it("緑かぶりで tint が負（マゼンタ方向）になる", () => {
    const histogram = histogramOf(fill([110, 150, 110], 100));
    const result = computeAutoWhiteBalance(histogram);
    expect(result?.temperature).toBe(0);
    expect(result?.tint).toBeLessThan(0);
  });

  it("クロスチェック: 逆算値をパイプラインへ通すと平均色のチャンネルがほぼ等化される", () => {
    const cast: [number, number, number] = [100, 128, 156];
    const histogram = histogramOf(fill(cast, 100));
    const result = computeAutoWhiteBalance(histogram);
    expect(result).not.toBeNull();
    if (!result) return;
    const [r, g, b] = applyResult(
      [cast[0] / 255, cast[1] / 255, cast[2] / 255],
      result,
    );
    // UI 丸め（±0.5 UI 単位 × シフト係数 0.2）による誤差を許容
    expect(Math.abs(r - b)).toBeLessThan(0.01);
    expect(Math.abs(g - (r + b) / 2)).toBeLessThan(0.01);
  });

  it("空のヒストグラムは null を返す", () => {
    expect(computeAutoWhiteBalance(histogramOf([]))).toBeNull();
  });
});

describe("computeWhiteBalanceForNeutralPoint", () => {
  const toRgb = ([r, g, b]: [number, number, number]) => ({
    r: r / 255,
    g: g / 255,
    b: b / 255,
  });

  it("無彩色グレーは無補正を返す", () => {
    expect(computeWhiteBalanceForNeutralPoint(toRgb([128, 128, 128]))).toEqual({
      temperature: 0,
      tint: 0,
    });
  });

  it("青被りの点で temperature が正（暖色方向）になる", () => {
    // b - r = 56/255 → temperature = 100·(56/255)/0.4 ≈ 55
    expect(computeWhiteBalanceForNeutralPoint(toRgb([100, 128, 156]))).toEqual({
      temperature: 55,
      tint: 0,
    });
  });

  it("極端な色は ±100 にクランプされる", () => {
    // b - r = -1 → temperature = -250 → -100 へ飽和
    const result = computeWhiteBalanceForNeutralPoint({ r: 1, g: 0.5, b: 0 });
    expect(result.temperature).toBe(-100);
    expect(result.tint).toBe(0);
  });

  it("クロスチェック: 逆算値をパイプラインへ通すと対象点がほぼ中性になる", () => {
    const cast: [number, number, number] = [100, 128, 156];
    const result = computeWhiteBalanceForNeutralPoint(toRgb(cast));
    const [r, g, b] = applyResult(
      [cast[0] / 255, cast[1] / 255, cast[2] / 255],
      result,
    );
    expect(Math.abs(r - b)).toBeLessThan(0.01);
    expect(Math.abs(g - (r + b) / 2)).toBeLessThan(0.01);
  });

  it("等価性: 均一色画像への gray-world は同色へのスポイトと一致する（リファクタ回帰ガード）", () => {
    const cast: [number, number, number] = [100, 128, 156];
    expect(computeAutoWhiteBalance(histogramOf(fill(cast, 100)))).toEqual(
      computeWhiteBalanceForNeutralPoint(toRgb(cast)),
    );
  });
});

describe("clampSampleWindow", () => {
  it("内部点では radius=2 の 5×5 窓を返す", () => {
    expect(clampSampleWindow(10, 10, WB_SAMPLE_RADIUS, 16, 16)).toEqual({
      x: 8,
      y: 8,
      width: 5,
      height: 5,
    });
  });

  it("角では窓が縮む（(0,0) → 3×3）", () => {
    expect(clampSampleWindow(0, 0, WB_SAMPLE_RADIUS, 16, 16)).toEqual({
      x: 0,
      y: 0,
      width: 3,
      height: 3,
    });
  });

  it("右下端でも境界内に収まる", () => {
    expect(clampSampleWindow(15, 15, WB_SAMPLE_RADIUS, 16, 16)).toEqual({
      x: 13,
      y: 13,
      width: 3,
      height: 3,
    });
  });

  it("小数の中心は floor される", () => {
    expect(clampSampleWindow(10.7, 10.2, WB_SAMPLE_RADIUS, 16, 16)).toEqual(
      clampSampleWindow(10, 10, WB_SAMPLE_RADIUS, 16, 16),
    );
  });

  it("画像外の中心・不正寸法は null を返す", () => {
    expect(clampSampleWindow(-1, 5, WB_SAMPLE_RADIUS, 16, 16)).toBeNull();
    expect(clampSampleWindow(16, 5, WB_SAMPLE_RADIUS, 16, 16)).toBeNull();
    expect(clampSampleWindow(5, 5, WB_SAMPLE_RADIUS, 0, 16)).toBeNull();
    expect(
      clampSampleWindow(5, Number.NaN, WB_SAMPLE_RADIUS, 16, 16),
    ).toBeNull();
  });
});

describe("averageRgb", () => {
  const rgbaOf = (
    pixels: Array<[number, number, number, number]>,
  ): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach(([r, g, b, a], i) => {
      data.set([r, g, b, a], i * 4);
    });
    return data;
  };

  it("混合ピクセルの平均色を [0,1] 正規化で返す", () => {
    const avg = averageRgb(
      rgbaOf([
        [100, 150, 200, 255],
        [200, 150, 100, 255],
      ]),
    );
    expect(avg?.r).toBeCloseTo(150 / 255, 10);
    expect(avg?.g).toBeCloseTo(150 / 255, 10);
    expect(avg?.b).toBeCloseTo(150 / 255, 10);
  });

  it("alpha = 0 の完全透明ピクセルは平均から除外する", () => {
    const avg = averageRgb(
      rgbaOf([
        [100, 100, 100, 255],
        [255, 255, 255, 0],
      ]),
    );
    expect(avg?.r).toBeCloseTo(100 / 255, 10);
  });

  it("全透明・空データは null を返す", () => {
    expect(averageRgb(rgbaOf([[255, 255, 255, 0]]))).toBeNull();
    expect(averageRgb(new Uint8ClampedArray(0))).toBeNull();
  });
});

describe("displayPointToSourcePixel", () => {
  it("縮小表示のクリック位置をソース自然座標へ写像する", () => {
    // 16×16 のソースを 8×8 で表示 → (4, 2) は (8, 4)
    expect(displayPointToSourcePixel(4, 2, 8, 8, 16, 16)).toEqual({
      x: 8,
      y: 4,
    });
  });

  it("右端・下端のクリックは寸法-1 にクランプされる", () => {
    expect(displayPointToSourcePixel(8, 8, 8, 8, 16, 16)).toEqual({
      x: 15,
      y: 15,
    });
  });

  it("負のオフセットは 0 にクランプされる", () => {
    expect(displayPointToSourcePixel(-1, -1, 8, 8, 16, 16)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("表示・ソース寸法が不正なときは null を返す", () => {
    expect(displayPointToSourcePixel(4, 2, 0, 8, 16, 16)).toBeNull();
    expect(displayPointToSourcePixel(4, 2, 8, 8, 0, 16)).toBeNull();
    expect(displayPointToSourcePixel(Number.NaN, 2, 8, 8, 16, 16)).toBeNull();
  });
});
