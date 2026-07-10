import { describe, expect, it } from "vitest";
import {
  buildHistogramPath,
  computeHistogram,
  HISTOGRAM_BINS,
  HISTOGRAM_MAX_SAMPLE_PIXELS,
  histogramMaxCount,
  resolveHistogramSampleSize,
} from "../histogram";

/** RGBA ピクセル列からバイト列を作るテストヘルパー */
const rgba = (
  ...pixels: [number, number, number, number][]
): Uint8ClampedArray => new Uint8ClampedArray(pixels.flat());

describe("computeHistogram", () => {
  it("R/G/B の各チャンネルを正しいビンへカウントする", () => {
    const histogram = computeHistogram(
      rgba([0, 128, 255, 255], [0, 128, 255, 255]),
    );
    expect(histogram.r[0]).toBe(2);
    expect(histogram.g[128]).toBe(2);
    expect(histogram.b[255]).toBe(2);
    expect(histogram.pixelCount).toBe(2);
    // 他のビンは 0 のまま
    expect(histogram.r.reduce((sum, v) => sum + v, 0)).toBe(2);
    expect(histogram.g.reduce((sum, v) => sum + v, 0)).toBe(2);
    expect(histogram.b.reduce((sum, v) => sum + v, 0)).toBe(2);
  });

  it("輝度は Rec.709 の重みでビンを決める（純赤 → bin 54）", () => {
    // 255 * 0.2126 = 54.213 → round → 54
    const histogram = computeHistogram(rgba([255, 0, 0, 255]));
    expect(histogram.luminance[54]).toBe(1);
  });

  it("輝度の混色（0,128,255 → bin 110）", () => {
    // 0*0.2126 + 128*0.7152 + 255*0.0722 = 109.9566 → round → 110
    const histogram = computeHistogram(rgba([0, 128, 255, 255]));
    expect(histogram.luminance[110]).toBe(1);
  });

  it("グレーの輝度は同値のビンに入る（重み合計 1.0）", () => {
    const histogram = computeHistogram(rgba([128, 128, 128, 255]));
    expect(histogram.luminance[128]).toBe(1);
    expect(histogram.luminance[255]).toBe(0);
  });

  it("alpha = 0 の完全透明ピクセルはカウントしない", () => {
    const histogram = computeHistogram(
      rgba([10, 20, 30, 0], [200, 200, 200, 255]),
    );
    expect(histogram.pixelCount).toBe(1);
    expect(histogram.r[10]).toBe(0);
    expect(histogram.r[200]).toBe(1);
  });

  it("末尾の不完全なピクセル（4 バイト未満）は無視する", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 9, 9]);
    const histogram = computeHistogram(data);
    expect(histogram.pixelCount).toBe(1);
    expect(histogram.r[255]).toBe(1);
    expect(histogram.r[9]).toBe(0);
  });

  it("空入力は全ビン 0・pixelCount 0", () => {
    const histogram = computeHistogram(new Uint8ClampedArray(0));
    expect(histogram.pixelCount).toBe(0);
    expect(histogram.r.length).toBe(HISTOGRAM_BINS);
    expect(histogramMaxCount(histogram.r, histogram.luminance)).toBe(0);
  });
});

describe("resolveHistogramSampleSize", () => {
  it("上限以下の画像はそのままの寸法を返す（拡大しない）", () => {
    expect(resolveHistogramSampleSize(100, 100)).toEqual({
      width: 100,
      height: 100,
    });
    expect(resolveHistogramSampleSize(256, 256)).toEqual({
      width: 256,
      height: 256,
    });
  });

  it("上限を超える画像はアスペクト比を維持して縮小する", () => {
    expect(resolveHistogramSampleSize(1024, 1024)).toEqual({
      width: 256,
      height: 256,
    });
    const { width, height } = resolveHistogramSampleSize(2048, 1024);
    expect(width / height).toBeCloseTo(2, 1);
    expect(width * height).toBeLessThanOrEqual(HISTOGRAM_MAX_SAMPLE_PIXELS);
  });

  it("縮小後の各辺は最小 1 になる", () => {
    const { width, height } = resolveHistogramSampleSize(1, 1_000_000, 65536);
    expect(width).toBe(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("不正な寸法は { width: 0, height: 0 } を返す", () => {
    expect(resolveHistogramSampleSize(0, 100)).toEqual({
      width: 0,
      height: 0,
    });
    expect(resolveHistogramSampleSize(100, -1)).toEqual({
      width: 0,
      height: 0,
    });
    expect(resolveHistogramSampleSize(Number.NaN, 100)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("histogramMaxCount", () => {
  it("複数チャンネルを横断した最大カウントを返す", () => {
    const a = new Uint32Array(4);
    const b = new Uint32Array(4);
    a[1] = 5;
    b[3] = 9;
    expect(histogramMaxCount(a, b)).toBe(9);
    expect(histogramMaxCount(a)).toBe(5);
  });

  it("全ビン 0 のとき 0 を返す", () => {
    expect(histogramMaxCount(new Uint32Array(4), new Uint32Array(4))).toBe(0);
  });
});

describe("buildHistogramPath", () => {
  const options = { width: 256, height: 100, maxCount: 10 };

  it("全ビン 0（maxCount 0）は下辺のみの閉じたパスを返す", () => {
    const path = buildHistogramPath(new Uint32Array(HISTOGRAM_BINS), {
      ...options,
      maxCount: 0,
    });
    expect(path).toBe("M0 100 L256 100 Z");
  });

  it("単一スパイクは該当ビンだけ上辺（y=0）、他は下辺（y=height）になる", () => {
    const bins = new Uint32Array(HISTOGRAM_BINS);
    bins[128] = 10;
    const path = buildHistogramPath(bins, options);
    expect(path.startsWith("M0 100 ")).toBe(true);
    expect(path.endsWith(" L256 100 Z")).toBe(true);
    // ビン 128 の x = 128/255*256 = 128.5、カウント最大なので y = 0
    expect(path).toContain("L128.5 0");
    // 隣接ビンは下辺のまま
    expect(path).toContain(`L${Math.round((127 / 255) * 256 * 100) / 100} 100`);
  });

  it("y は共通の maxCount で線形スケールされる（半分のカウント → 中央）", () => {
    const bins = new Uint32Array(HISTOGRAM_BINS);
    bins[0] = 5;
    const path = buildHistogramPath(bins, options);
    // 5/10 = 0.5 → y = 100 - 50 = 50
    expect(path).toContain("L0 50");
  });

  it("ビン数分の座標点を含む", () => {
    const bins = new Uint32Array(HISTOGRAM_BINS);
    bins[0] = 1;
    const path = buildHistogramPath(bins, { ...options, maxCount: 1 });
    const points = path.match(/L[\d.]+ [\d.]+/g);
    // 各ビン 256 点 + 閉じるための右下 1 点
    expect(points).toHaveLength(HISTOGRAM_BINS + 1);
  });
});
