import { describe, expect, it } from "vitest";
import { LUMA_WEIGHTS } from "../adjustments";
import {
  blurLumaAt,
  clarityStride,
  computeLumaPlane,
  detailDeltaAt,
  GAUSS3_TAPS,
  grainNoiseAt,
  hashPixel,
  lowbias32,
  midtoneWeight,
  vignetteFactorAt,
} from "../effects";

/** 一様な輝度平面を作る */
const flatPlane = (width: number, height: number, value: number) =>
  new Float32Array(width * height).fill(value);

/** 上半分 top / 下半分 bottom の 2 トーン輝度平面を作る */
const twoTonePlane = (
  width: number,
  height: number,
  top: number,
  bottom: number,
) => {
  const plane = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    plane.fill(y < height / 2 ? top : bottom, y * width, (y + 1) * width);
  }
  return plane;
};

describe("GAUSS3_TAPS", () => {
  it("重みの総和が 1（ぼかしで平均輝度を保存する）", () => {
    const sum = GAUSS3_TAPS.reduce((acc, tap) => acc + tap.w, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("上下・左右対称（テクスチャの Y 反転に影響されない）", () => {
    for (const tap of GAUSS3_TAPS) {
      const mirrored = GAUSS3_TAPS.find(
        (t) => t.dx === tap.dx && t.dy === -tap.dy,
      );
      expect(mirrored?.w).toBe(tap.w);
    }
  });
});

describe("clarityStride", () => {
  it("小さい画像でも下限 2 を返す", () => {
    expect(clarityStride(16, 16)).toBe(2);
    expect(clarityStride(400, 300)).toBe(2);
  });

  it("短辺 200px ごとに増える（解像度適応・単調非減少）", () => {
    expect(clarityStride(1000, 800)).toBe(4);
    expect(clarityStride(4000, 3000)).toBe(15);
    expect(clarityStride(4000, 3000)).toBeGreaterThanOrEqual(
      clarityStride(1000, 800),
    );
  });
});

describe("computeLumaPlane", () => {
  it("Rec.709 重みで輝度を [0,1] 化する", () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const plane = computeLumaPlane(data, 2, 1);
    expect(plane[0]).toBeCloseTo(LUMA_WEIGHTS[0], 6);
    expect(plane[1]).toBeCloseTo(LUMA_WEIGHTS[1], 6);
  });
});

describe("blurLumaAt", () => {
  it("平坦な画像ではぼかしても値が変わらない", () => {
    // 0.4 は fp32 で正確に表現できないため Float32Array 経由の値に精度 6 で比較する
    const plane = flatPlane(8, 8, 0.4);
    expect(blurLumaAt(plane, 8, 8, 4, 4, 1)).toBeCloseTo(0.4, 6);
    // 端（クランプ処理）でも平坦なら不変
    expect(blurLumaAt(plane, 8, 8, 0, 0, 2)).toBeCloseTo(0.4, 6);
  });

  it("エッジ近傍では反対側の値に引かれる", () => {
    const plane = twoTonePlane(8, 8, 0.8, 0.2);
    // 境界のすぐ上（明側）: 下の暗い行が混ざり base より小さい
    expect(blurLumaAt(plane, 8, 8, 4, 3, 1)).toBeLessThan(0.8);
    // 境界のすぐ下（暗側）: 上の明るい行が混ざり base より大きい
    expect(blurLumaAt(plane, 8, 8, 4, 4, 1)).toBeGreaterThan(0.2);
  });
});

describe("midtoneWeight", () => {
  it("中間調 0.5 で 1、両端 0 / 1 で 0", () => {
    expect(midtoneWeight(0.5)).toBe(1);
    expect(midtoneWeight(0)).toBe(0);
    expect(midtoneWeight(1)).toBe(0);
    expect(midtoneWeight(0.25)).toBeCloseTo(0.5, 10);
  });
});

describe("detailDeltaAt", () => {
  it("平坦な画像では delta = 0", () => {
    const plane = flatPlane(8, 8, 0.5);
    expect(detailDeltaAt(plane, 8, 8, 4, 4, 2, 1, 1)).toBeCloseTo(0, 10);
  });

  it("シャープネスはエッジの明側を明るく・暗側を暗くする", () => {
    const plane = twoTonePlane(8, 8, 0.8, 0.2);
    expect(detailDeltaAt(plane, 8, 8, 4, 3, 2, 1, 0)).toBeGreaterThan(0);
    expect(detailDeltaAt(plane, 8, 8, 4, 4, 2, 1, 0)).toBeLessThan(0);
  });

  it("シャープネスの負値は 0 扱い（片方向）", () => {
    const plane = twoTonePlane(8, 8, 0.8, 0.2);
    expect(detailDeltaAt(plane, 8, 8, 4, 3, 2, -1, 0)).toBe(0);
  });

  it("明瞭度は中間調マスクにより両端輝度で効かない", () => {
    // base = 1.0（マスク 0）のエッジでは clarity の delta が 0
    const plane = twoTonePlane(8, 8, 1.0, 0.0);
    expect(detailDeltaAt(plane, 8, 8, 4, 3, 1, 0, 1)).toBeCloseTo(0, 10);
    // base = 0.6（マスク 0.8）では効く
    const midPlane = twoTonePlane(8, 8, 0.6, 0.2);
    expect(detailDeltaAt(midPlane, 8, 8, 4, 3, 1, 0, 1)).toBeGreaterThan(0);
  });

  it("明瞭度の負値は差分を反転する（軟調化）", () => {
    const plane = twoTonePlane(8, 8, 0.6, 0.2);
    const positive = detailDeltaAt(plane, 8, 8, 4, 3, 1, 0, 1);
    const negative = detailDeltaAt(plane, 8, 8, 4, 3, 1, 0, -1);
    expect(negative).toBeCloseTo(-positive, 10);
  });
});

describe("vignetteFactorAt", () => {
  it("中心部（減光開始半径の内側）は係数 1", () => {
    expect(vignetteFactorAt(8, 8, 16, 16, 1)).toBe(1);
  });

  it("n > 0 で四隅が減光し、n < 0 で増光する", () => {
    const dark = vignetteFactorAt(0, 0, 16, 16, 1);
    const bright = vignetteFactorAt(0, 0, 16, 16, -1);
    expect(dark).toBeLessThan(0.5);
    expect(dark).toBeGreaterThanOrEqual(0);
    expect(bright).toBeGreaterThan(1.5);
  });

  it("四隅は対称（同じ係数）", () => {
    const corners = [
      vignetteFactorAt(0, 0, 16, 16, 1),
      vignetteFactorAt(15, 0, 16, 16, 1),
      vignetteFactorAt(0, 15, 16, 16, 1),
      vignetteFactorAt(15, 15, 16, 16, 1),
    ];
    for (const corner of corners) {
      expect(corner).toBeCloseTo(corners[0], 10);
    }
  });

  it("n = 0 では全画素で係数 1", () => {
    expect(vignetteFactorAt(0, 0, 16, 16, 0)).toBe(1);
    expect(vignetteFactorAt(8, 8, 16, 16, 0)).toBe(1);
  });
});

describe("lowbias32 / hashPixel / grainNoiseAt", () => {
  it("決定的（同じ入力に同じ値）で 32bit 符号なし域に収まる", () => {
    expect(lowbias32(12345)).toBe(lowbias32(12345));
    expect(lowbias32(12345)).toBeGreaterThanOrEqual(0);
    expect(lowbias32(12345)).toBeLessThan(2 ** 32);
    expect(hashPixel(3, 7)).toBe(hashPixel(3, 7));
  });

  it("座標の入替や隣接画素で異なる値になる", () => {
    expect(hashPixel(1, 2)).not.toBe(hashPixel(2, 1));
    expect(grainNoiseAt(5, 5)).not.toBe(grainNoiseAt(6, 5));
    expect(grainNoiseAt(5, 5)).not.toBe(grainNoiseAt(5, 6));
  });

  it("ノイズは [-1, 1) に収まり、平均がほぼ 0（無彩色・無バイアス）", () => {
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    const n = 128;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const v = grainNoiseAt(x, y);
        sum += v;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThan(1);
    expect(Math.abs(sum / (n * n))).toBeLessThan(0.02);
  });
});
