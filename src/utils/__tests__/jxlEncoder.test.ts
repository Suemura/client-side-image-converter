import { describe, expect, it } from "vitest";
import { normalizeJxlQuality, resolveJxlEffort } from "../jxlEncoder";

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

describe("resolveJxlEffort", () => {
  it("8MP 以下はデフォルト努力度 7 を返す", () => {
    expect(resolveJxlEffort(1)).toBe(7);
    // フル HD（1920x1080 ≒ 2MP）
    expect(resolveJxlEffort(1920 * 1080)).toBe(7);
    // しきい値ちょうど（8MP）は据え置き
    expect(resolveJxlEffort(8_000_000)).toBe(7);
  });

  it("8MP 超（カメラ撮影画像級）は高速化のため努力度 3 を返す", () => {
    expect(resolveJxlEffort(8_000_001)).toBe(3);
    // 24MP（6000x4000）の実カメラ RAW 現像後サイズ
    expect(resolveJxlEffort(6000 * 4000)).toBe(3);
  });

  it("非有限値はデフォルト努力度を返す", () => {
    expect(resolveJxlEffort(Number.NaN)).toBe(7);
    expect(resolveJxlEffort(Number.POSITIVE_INFINITY)).toBe(7);
  });
});
