import { describe, expect, it } from "vitest";
import { normalizeJxlQuality } from "../jxlEncoder";

// encodeCanvasToJxlBlob は Canvas / WASM 依存のため単体テスト対象外（E2E で検証する）

describe("normalizeJxlQuality", () => {
  it("範囲内の整数はそのまま返す", () => {
    expect(normalizeJxlQuality(50)).toBe(50);
    expect(normalizeJxlQuality(1)).toBe(1);
    expect(normalizeJxlQuality(100)).toBe(100);
  });

  it("範囲外の値は 1-100 にクランプする", () => {
    expect(normalizeJxlQuality(0)).toBe(1);
    expect(normalizeJxlQuality(-10)).toBe(1);
    expect(normalizeJxlQuality(101)).toBe(100);
    expect(normalizeJxlQuality(1000)).toBe(100);
  });

  it("小数は整数に丸める", () => {
    expect(normalizeJxlQuality(89.4)).toBe(89);
    expect(normalizeJxlQuality(89.5)).toBe(90);
  });

  it("非有限値はデフォルト品質を返す", () => {
    expect(normalizeJxlQuality(Number.NaN)).toBe(90);
    expect(normalizeJxlQuality(Number.POSITIVE_INFINITY)).toBe(90);
    expect(normalizeJxlQuality(Number.NEGATIVE_INFINITY)).toBe(90);
  });
});
