import { describe, expect, it } from "vitest";
import {
  applyMaskToAlpha,
  isRemovableSize,
  MAX_REMOVE_BG_INPUT_DIMENSION,
  normalizeMaskMinMax,
  REMOVE_BG_INPUT_SIZE,
  REMOVE_BG_NORM_MEAN,
  REMOVE_BG_NORM_STD,
  resizeMaskBilinear,
  resizeRgbaBilinear,
  rgbaToNormalizedTensor,
} from "../removeBgCore";

/** 単色 RGBA バッファを生成する */
const solidRgba = (
  pixelCount: number,
  [r, g, b, a]: [number, number, number, number],
): Uint8ClampedArray => {
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return rgba;
};

describe("isRemovableSize", () => {
  it("上限以内のサイズを許可する", () => {
    expect(isRemovableSize(1, 1)).toBe(true);
    expect(
      isRemovableSize(MAX_REMOVE_BG_INPUT_DIMENSION, REMOVE_BG_INPUT_SIZE),
    ).toBe(true);
  });

  it("上限超過・非正のサイズを拒否する", () => {
    expect(isRemovableSize(MAX_REMOVE_BG_INPUT_DIMENSION + 1, 100)).toBe(false);
    expect(isRemovableSize(0, 100)).toBe(false);
    expect(isRemovableSize(100, -1)).toBe(false);
  });
});

describe("resizeRgbaBilinear", () => {
  it("単色画像はリサイズ後も同色になる", () => {
    const src = solidRgba(4 * 4, [10, 20, 30, 255]);
    const dst = resizeRgbaBilinear(src, 4, 4, 8, 8);
    expect(dst.length).toBe(8 * 8 * 4);
    for (let i = 0; i < 8 * 8; i++) {
      expect(dst[i * 4]).toBe(10);
      expect(dst[i * 4 + 1]).toBe(20);
      expect(dst[i * 4 + 2]).toBe(30);
      expect(dst[i * 4 + 3]).toBe(255);
    }
  });

  it("非正方入力を正方形へ引き伸ばせる（アスペクト比非保持）", () => {
    // 左半分 黒 / 右半分 白 の 4x2 画像 → 2x2 に縮小しても左右の関係が保たれる
    const src = new Uint8ClampedArray(4 * 2 * 4);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const v = x < 2 ? 0 : 255;
        const i = (y * 4 + x) * 4;
        src[i] = v;
        src[i + 1] = v;
        src[i + 2] = v;
        src[i + 3] = 255;
      }
    }
    const dst = resizeRgbaBilinear(src, 4, 2, 2, 2);
    // 左列は暗く、右列は明るい
    expect(dst[0]).toBeLessThan(64);
    expect(dst[4]).toBeGreaterThan(191);
  });

  it("2 倍拡大で中間画素が補間される", () => {
    // 1x2（黒 → 白）を 1x4 へ拡大すると単調非減少になる
    const src = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const dst = resizeRgbaBilinear(src, 2, 1, 4, 1);
    const values = [dst[0], dst[4], dst[8], dst[12]];
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    expect(values[0]).toBe(0);
    expect(values[3]).toBe(255);
  });
});

describe("rgbaToNormalizedTensor", () => {
  it("NCHW 形式で ImageNet 正規化した値を返す", () => {
    const rgba = solidRgba(2 * 2, [255, 128, 0, 255]);
    const tensor = rgbaToNormalizedTensor(rgba, 2, 2);
    expect(tensor.length).toBe(2 * 2 * 3);
    const expectR = (1 - REMOVE_BG_NORM_MEAN[0]) / REMOVE_BG_NORM_STD[0];
    const expectG =
      (128 / 255 - REMOVE_BG_NORM_MEAN[1]) / REMOVE_BG_NORM_STD[1];
    const expectB = (0 - REMOVE_BG_NORM_MEAN[2]) / REMOVE_BG_NORM_STD[2];
    for (let i = 0; i < 4; i++) {
      expect(tensor[i]).toBeCloseTo(expectR, 5);
      expect(tensor[4 + i]).toBeCloseTo(expectG, 5);
      expect(tensor[8 + i]).toBeCloseTo(expectB, 5);
    }
  });

  it("アルファを無視する", () => {
    const opaque = rgbaToNormalizedTensor(
      solidRgba(1, [100, 100, 100, 255]),
      1,
      1,
    );
    const transparent = rgbaToNormalizedTensor(
      solidRgba(1, [100, 100, 100, 0]),
      1,
      1,
    );
    expect(transparent).toEqual(opaque);
  });
});

describe("normalizeMaskMinMax", () => {
  it("min-max で 0..1 に正規化する", () => {
    const mask = new Float32Array([2, 4, 6, 10]);
    const normalized = normalizeMaskMinMax(mask);
    expect(normalized[0]).toBeCloseTo(0, 6);
    expect(normalized[1]).toBeCloseTo(0.25, 6);
    expect(normalized[2]).toBeCloseTo(0.5, 6);
    expect(normalized[3]).toBeCloseTo(1, 6);
  });

  it("全画素同値のときは全画素 0 を返す（ゼロ除算しない）", () => {
    const normalized = normalizeMaskMinMax(new Float32Array([3, 3, 3]));
    expect([...normalized]).toEqual([0, 0, 0]);
  });

  it("入力バッファを変更しない", () => {
    const mask = new Float32Array([1, 5]);
    normalizeMaskMinMax(mask);
    expect([...mask]).toEqual([1, 5]);
  });
});

describe("resizeMaskBilinear", () => {
  it("一様マスクはリサイズ後も一様", () => {
    const mask = new Float32Array(4 * 4).fill(0.5);
    const dst = resizeMaskBilinear(mask, 4, 4, 7, 3);
    expect(dst.length).toBe(7 * 3);
    for (const v of dst) {
      expect(v).toBeCloseTo(0.5, 6);
    }
  });

  it("グラデーションを補間して拡大する（単調性・端点保持）", () => {
    const mask = new Float32Array([0, 1]);
    const dst = resizeMaskBilinear(mask, 2, 1, 6, 1);
    expect(dst[0]).toBeCloseTo(0, 6);
    expect(dst[5]).toBeCloseTo(1, 6);
    for (let i = 1; i < dst.length; i++) {
      expect(dst[i]).toBeGreaterThanOrEqual(dst[i - 1]);
    }
  });
});

describe("applyMaskToAlpha", () => {
  it("マスク値をアルファへ反映し RGB は保持する", () => {
    const rgba = solidRgba(3, [10, 20, 30, 255]);
    const mask = new Float32Array([0, 0.5, 1]);
    const result = applyMaskToAlpha(rgba, mask);
    expect(result[3]).toBe(0);
    expect(result[7]).toBe(Math.round(255 * 0.5));
    expect(result[11]).toBe(255);
    for (let i = 0; i < 3; i++) {
      expect(result[i * 4]).toBe(10);
      expect(result[i * 4 + 1]).toBe(20);
      expect(result[i * 4 + 2]).toBe(30);
    }
  });

  it("元画像の透過を尊重する（元アルファ × マスク）", () => {
    const rgba = solidRgba(1, [0, 0, 0, 128]);
    const result = applyMaskToAlpha(rgba, new Float32Array([1]));
    expect(result[3]).toBe(128);
  });

  it("0..1 を外れたマスク値をクランプする", () => {
    const rgba = solidRgba(2, [0, 0, 0, 255]);
    const result = applyMaskToAlpha(rgba, new Float32Array([-0.5, 1.5]));
    expect(result[3]).toBe(0);
    expect(result[7]).toBe(255);
  });

  it("入力バッファを変更しない", () => {
    const rgba = solidRgba(1, [1, 2, 3, 255]);
    applyMaskToAlpha(rgba, new Float32Array([0]));
    expect(rgba[3]).toBe(255);
  });
});
