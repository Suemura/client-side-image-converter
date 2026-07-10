import { describe, expect, it } from "vitest";
import {
  applyAdjustmentToPixel,
  clampAdjustments,
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustments,
} from "../adjustments";
import {
  AUTO_LEVELS_CLIP_RATIO,
  channelMeansFromHistogram,
  computeAutoLevels,
  computeAutoWhiteBalance,
  histogramPercentileRange,
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
