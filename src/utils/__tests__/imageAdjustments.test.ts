import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_RANGE,
  buildCanvasFilter,
  IDENTITY_ADJUSTMENTS,
  type ImageAdjustments,
  isIdentityAdjustments,
} from "../imageAdjustments";

/** 基準（無調整）から一部だけ上書きしたい場合のヘルパー */
const withAdjustments = (
  overrides: Partial<ImageAdjustments>,
): ImageAdjustments => ({ ...IDENTITY_ADJUSTMENTS, ...overrides });

describe("IDENTITY_ADJUSTMENTS", () => {
  it("スライダーは 1（中立）・フィルタは false", () => {
    expect(IDENTITY_ADJUSTMENTS).toEqual({
      brightness: 1,
      contrast: 1,
      saturate: 1,
      grayscale: false,
      sepia: false,
    });
  });
});

describe("ADJUSTMENT_RANGE", () => {
  it("0〜2 の範囲を 0.01 刻みで持つ", () => {
    expect(ADJUSTMENT_RANGE).toEqual({ min: 0, max: 2, step: 0.01 });
  });
});

describe("buildCanvasFilter", () => {
  it("無調整は 'none' を返す（ctx.filter に常に有効な値）", () => {
    expect(buildCanvasFilter(IDENTITY_ADJUSTMENTS)).toBe("none");
  });

  it("明るさのみ調整", () => {
    expect(buildCanvasFilter(withAdjustments({ brightness: 1.1 }))).toBe(
      "brightness(1.1)",
    );
  });

  it("コントラストのみ調整", () => {
    expect(buildCanvasFilter(withAdjustments({ contrast: 0.9 }))).toBe(
      "contrast(0.9)",
    );
  });

  it("彩度のみ調整", () => {
    expect(buildCanvasFilter(withAdjustments({ saturate: 1.5 }))).toBe(
      "saturate(1.5)",
    );
  });

  it("グレースケールは grayscale(1) を追加", () => {
    expect(buildCanvasFilter(withAdjustments({ grayscale: true }))).toBe(
      "grayscale(1)",
    );
  });

  it("セピアは sepia(1) を追加", () => {
    expect(buildCanvasFilter(withAdjustments({ sepia: true }))).toBe(
      "sepia(1)",
    );
  });

  it("複数調整は空白区切りで brightness→contrast→saturate→grayscale→sepia の順に連結", () => {
    expect(
      buildCanvasFilter({
        brightness: 1.1,
        contrast: 0.9,
        saturate: 1.2,
        grayscale: true,
        sepia: true,
      }),
    ).toBe("brightness(1.1) contrast(0.9) saturate(1.2) grayscale(1) sepia(1)");
  });

  it("中立のスライダー値（1）は出力に含めない", () => {
    expect(
      buildCanvasFilter(withAdjustments({ brightness: 1, saturate: 1.3 })),
    ).toBe("saturate(1.3)");
  });

  it("小数は 2 桁へ丸め末尾の余分な 0 を付けない", () => {
    // 2/3 = 0.6666... のような長い小数は 2 桁へ丸める
    expect(buildCanvasFilter(withAdjustments({ saturate: 2 / 3 }))).toBe(
      "saturate(0.67)",
    );
    // 2 桁以内の値はそのまま（末尾の 0 は付けない）
    expect(buildCanvasFilter(withAdjustments({ contrast: 1.5 }))).toBe(
      "contrast(1.5)",
    );
  });

  it("0（最小値）も中立でないため出力される", () => {
    expect(buildCanvasFilter(withAdjustments({ brightness: 0 }))).toBe(
      "brightness(0)",
    );
  });
});

describe("isIdentityAdjustments", () => {
  it("無調整は true", () => {
    expect(isIdentityAdjustments(IDENTITY_ADJUSTMENTS)).toBe(true);
  });

  it("いずれか調整があれば false", () => {
    expect(isIdentityAdjustments(withAdjustments({ brightness: 1.2 }))).toBe(
      false,
    );
    expect(isIdentityAdjustments(withAdjustments({ grayscale: true }))).toBe(
      false,
    );
  });
});
