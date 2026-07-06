import { describe, expect, it } from "vitest";
import { normalizeAvifQuality } from "../avifEncoder";

// encodeCanvasToAvifBlob は Canvas / WASM 依存のため単体テスト対象外（E2E で検証する）

describe("normalizeAvifQuality", () => {
  it("範囲内の整数はそのまま返す", () => {
    expect(normalizeAvifQuality(50)).toBe(50);
    expect(normalizeAvifQuality(1)).toBe(1);
    expect(normalizeAvifQuality(100)).toBe(100);
  });

  it("範囲外の値は 1-100 にクランプする", () => {
    expect(normalizeAvifQuality(0)).toBe(1);
    expect(normalizeAvifQuality(-10)).toBe(1);
    expect(normalizeAvifQuality(101)).toBe(100);
    expect(normalizeAvifQuality(1000)).toBe(100);
  });

  it("小数は整数に丸める", () => {
    expect(normalizeAvifQuality(89.4)).toBe(89);
    expect(normalizeAvifQuality(89.5)).toBe(90);
  });

  it("非有限値はデフォルト品質を返す", () => {
    expect(normalizeAvifQuality(Number.NaN)).toBe(90);
    expect(normalizeAvifQuality(Number.POSITIVE_INFINITY)).toBe(90);
    expect(normalizeAvifQuality(Number.NEGATIVE_INFINITY)).toBe(90);
  });
});
