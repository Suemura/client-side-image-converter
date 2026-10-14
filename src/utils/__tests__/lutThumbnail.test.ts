import { describe, expect, it } from "vitest";
import { createIdentityLut, type LutData } from "../lutParser";
import {
  applyLutToPixels,
  makeGradientBasePixels,
  resolveCoverCropRect,
} from "../lutThumbnail";

describe("resolveCoverCropRect", () => {
  it("横長ソースは左右を中央トリミングする", () => {
    // 出力 112x72（14:9）に対して 2:1 ソース → 高さ全域・幅を切り出す
    const rect = resolveCoverCropRect(2000, 1000, 112, 72);
    expect(rect.sh).toBe(1000);
    expect(rect.sw).toBe(Math.round(1000 * (112 / 72)));
    expect(rect.sy).toBe(0);
    expect(rect.sx).toBe(Math.floor((2000 - rect.sw) / 2));
  });

  it("縦長ソースは上下を中央トリミングする", () => {
    const rect = resolveCoverCropRect(1000, 2000, 112, 72);
    expect(rect.sw).toBe(1000);
    expect(rect.sh).toBe(Math.round(1000 / (112 / 72)));
    expect(rect.sx).toBe(0);
    expect(rect.sy).toBe(Math.floor((2000 - rect.sh) / 2));
  });

  it("同アスペクトのソースは全域を返す", () => {
    const rect = resolveCoverCropRect(1120, 720, 112, 72);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 1120, sh: 720 });
  });

  it("出力より小さいソースでも比率どおり切り出す（拡大側の判断は呼び出し側）", () => {
    const rect = resolveCoverCropRect(56, 36, 112, 72);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 56, sh: 36 });
  });

  it("極端な縦横比でも切り出し辺は最小 1 を保つ", () => {
    const rect = resolveCoverCropRect(1, 10000, 112, 72);
    expect(rect.sw).toBe(1);
    expect(rect.sh).toBeGreaterThanOrEqual(1);
  });

  it.each([
    [0, 100],
    [-1, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
  ])("不正なソース寸法（%s）はゼロ矩形を返す", (bad, ok) => {
    expect(resolveCoverCropRect(bad, ok, 112, 72)).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
    expect(resolveCoverCropRect(ok, bad, 112, 72)).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
  });

  it("不正な出力寸法はゼロ矩形を返す", () => {
    expect(resolveCoverCropRect(100, 100, 0, 72)).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
    expect(resolveCoverCropRect(100, 100, 112, Number.NaN)).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
  });
});

describe("makeGradientBasePixels", () => {
  it("RGBA 長（幅×高さ×4）の配列を返し alpha は 255", () => {
    const pixels = makeGradientBasePixels(8, 4);
    expect(pixels.length).toBe(8 * 4 * 4);
    for (let p = 3; p < pixels.length; p += 4) {
      expect(pixels[p]).toBe(255);
    }
  });

  it("四隅がグラデーションの期待値になる", () => {
    const w = 8;
    const h = 4;
    const pixels = makeGradientBasePixels(w, h);
    const at = (x: number, y: number) => {
      const p = (y * w + x) * 4;
      return [pixels[p], pixels[p + 1], pixels[p + 2]];
    };
    expect(at(0, 0)).toEqual([0, 0, 255]); // 左上: R=0, B=最大
    expect(at(w - 1, 0)).toEqual([255, 0, 0]); // 右上: R=最大, B=0
    expect(at(0, h - 1)).toEqual([0, 255, 255]); // 左下: G=最大
    expect(at(w - 1, h - 1)).toEqual([255, 255, 0]); // 右下
  });
});

describe("applyLutToPixels", () => {
  it("恒等 LUT では入力と一致する（丸め誤差 ±1）", () => {
    const base = makeGradientBasePixels(8, 4);
    const out = applyLutToPixels(base, createIdentityLut(2));
    expect(out.length).toBe(base.length);
    for (let p = 0; p < base.length; p += 4) {
      expect(Math.abs(out[p] - base[p])).toBeLessThanOrEqual(1);
      expect(Math.abs(out[p + 1] - base[p + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(out[p + 2] - base[p + 2])).toBeLessThanOrEqual(1);
    }
  });

  it("反転 LUT では色が反転する", () => {
    // size=2 の反転 LUT（各格子点の出力 = 1 - 入力）
    const identity = createIdentityLut(2);
    const inverted: LutData = {
      ...identity,
      data: identity.data.map((v) => 1 - v),
    };
    const base = new Uint8ClampedArray([255, 0, 128, 200]);
    const out = applyLutToPixels(base, inverted);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(255);
    expect(Math.abs(out[2] - 127)).toBeLessThanOrEqual(1);
  });

  it("入力配列を変更せず alpha を素通しする", () => {
    const base = new Uint8ClampedArray([10, 20, 30, 42]);
    const snapshot = Uint8ClampedArray.from(base);
    const out = applyLutToPixels(base, createIdentityLut(2));
    expect(base).toEqual(snapshot);
    expect(out[3]).toBe(42);
  });
});
