import { describe, expect, it } from "vitest";
import { resolveExportIndices, resolveResizeDimensions } from "../studioCore";

describe("resolveResizeDimensions", () => {
  it("幅・高さとも未指定なら null", () => {
    expect(resolveResizeDimensions(400, 300, { keepAspect: true })).toBeNull();
  });

  it("不正値（0 / 負 / NaN）は未指定扱い", () => {
    expect(
      resolveResizeDimensions(400, 300, {
        width: 0,
        height: Number.NaN,
        keepAspect: true,
      }),
    ).toBeNull();
    expect(
      resolveResizeDimensions(400, 300, { width: -100, keepAspect: false }),
    ).toBeNull();
  });

  it("keepAspect + 幅のみ指定は高さをアスペクト比から算出", () => {
    expect(
      resolveResizeDimensions(400, 300, { width: 200, keepAspect: true }),
    ).toEqual({ width: 200, height: 150 });
  });

  it("keepAspect + 高さのみ指定は幅をアスペクト比から算出", () => {
    expect(
      resolveResizeDimensions(400, 300, { height: 150, keepAspect: true }),
    ).toEqual({ width: 200, height: 150 });
  });

  it("keepAspect + 両方指定は内接（contain）", () => {
    expect(
      resolveResizeDimensions(400, 300, {
        width: 200,
        height: 200,
        keepAspect: true,
      }),
    ).toEqual({ width: 200, height: 150 });
  });

  it("keepAspect でない場合は指定値そのまま・未指定側は元寸法", () => {
    expect(
      resolveResizeDimensions(400, 300, {
        width: 200,
        height: 100,
        keepAspect: false,
      }),
    ).toEqual({ width: 200, height: 100 });
    expect(
      resolveResizeDimensions(400, 300, { width: 200, keepAspect: false }),
    ).toEqual({ width: 200, height: 300 });
  });

  it("元寸法と同じ結果は null（リサイズ不要）", () => {
    expect(
      resolveResizeDimensions(400, 300, { width: 400, keepAspect: true }),
    ).toBeNull();
  });

  it("極端な縮小でも 1px 未満にならない", () => {
    expect(
      resolveResizeDimensions(4000, 2, { width: 10, keepAspect: true }),
    ).toEqual({ width: 10, height: 1 });
  });

  it("元寸法が不正なら null", () => {
    expect(
      resolveResizeDimensions(0, 300, { width: 100, keepAspect: true }),
    ).toBeNull();
  });
});

describe("resolveExportIndices", () => {
  it("all は全インデックス", () => {
    expect(resolveExportIndices("all", 1, 3)).toEqual([0, 1, 2]);
  });

  it("current は選択中のみ", () => {
    expect(resolveExportIndices("current", 1, 3)).toEqual([1]);
  });

  it("画像なし・範囲外は空", () => {
    expect(resolveExportIndices("all", 0, 0)).toEqual([]);
    expect(resolveExportIndices("current", 5, 3)).toEqual([]);
    expect(resolveExportIndices("current", -1, 3)).toEqual([]);
  });
});
