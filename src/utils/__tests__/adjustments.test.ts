import { describe, expect, it } from "vitest";
import {
  ADJUSTMENT_KEYS,
  type AdjustmentState,
  applyAdjustmentToPixel,
  blacksToneWeight,
  clampAdjustments,
  DEFAULT_ADJUSTMENTS,
  type EditState,
  isDefaultAdjustments,
  LUMA_WEIGHTS,
  normalizeAdjustments,
  resolveAdjustmentForIndex,
  TEMPERATURE_SHIFT,
  TINT_SHIFT,
  whitesToneWeight,
} from "../adjustments";

/** UI 状態から正規化して 1 ピクセルへ適用するテストヘルパー */
const apply = (
  rgb: [number, number, number],
  overrides: Partial<AdjustmentState>,
): [number, number, number] => {
  const state = clampAdjustments({ ...DEFAULT_ADJUSTMENTS, ...overrides });
  return applyAdjustmentToPixel(
    rgb[0],
    rgb[1],
    rgb[2],
    normalizeAdjustments(state),
  );
};

const lumaOf = (rgb: [number, number, number]): number =>
  rgb[0] * LUMA_WEIGHTS[0] +
  rgb[1] * LUMA_WEIGHTS[1] +
  rgb[2] * LUMA_WEIGHTS[2];

describe("clampAdjustments", () => {
  it("範囲外の値を [-100, 100] に丸める", () => {
    const clamped = clampAdjustments({ exposure: 500, contrast: -999 });
    expect(clamped.exposure).toBe(100);
    expect(clamped.contrast).toBe(-100);
  });

  it("欠損キーは 0（無調整）で補完し、非有限値も 0 にする", () => {
    const clamped = clampAdjustments({ hue: Number.NaN });
    expect(clamped.hue).toBe(0);
    // 指定しなかったキーは DEFAULT の 0
    expect(clamped.saturation).toBe(0);
    expect(Object.keys(clamped).sort()).toEqual([...ADJUSTMENT_KEYS].sort());
  });

  it("小数は整数へ丸める", () => {
    expect(clampAdjustments({ brightness: 12.7 }).brightness).toBe(13);
  });
});

describe("isDefaultAdjustments", () => {
  it("すべて 0 のとき true", () => {
    expect(isDefaultAdjustments(DEFAULT_ADJUSTMENTS)).toBe(true);
  });
  it("1 項目でも 0 以外なら false", () => {
    expect(isDefaultAdjustments({ ...DEFAULT_ADJUSTMENTS, exposure: 1 })).toBe(
      false,
    );
  });
});

describe("normalizeAdjustments", () => {
  it("UI 単位 [-100,100] を [-1,1] に正規化する", () => {
    const n = normalizeAdjustments(
      clampAdjustments({ exposure: 100, contrast: -50 }),
    );
    expect(n.exposure).toBeCloseTo(1);
    expect(n.contrast).toBeCloseTo(-0.5);
  });
});

describe("applyAdjustmentToPixel", () => {
  it("無調整では入力をそのまま返す（恒等性）", () => {
    const out = apply([0.3, 0.5, 0.7], {});
    expect(out[0]).toBeCloseTo(0.3, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(0.7, 5);
  });

  it("出力は常に [0,1] にクランプされる", () => {
    const bright = apply([0.9, 0.9, 0.9], { exposure: 100, brightness: 100 });
    const dark = apply([0.1, 0.1, 0.1], { exposure: -100, brightness: -100 });
    for (const v of [...bright, ...dark]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("露光量 + で明るくなる", () => {
    const before: [number, number, number] = [0.4, 0.4, 0.4];
    const after = apply(before, { exposure: 50 });
    expect(lumaOf(after)).toBeGreaterThan(lumaOf(before));
  });

  it("輝度 + で明るく、− で暗くなる", () => {
    const mid: [number, number, number] = [0.5, 0.5, 0.5];
    expect(lumaOf(apply(mid, { brightness: 40 }))).toBeGreaterThan(0.5);
    expect(lumaOf(apply(mid, { brightness: -40 }))).toBeLessThan(0.5);
  });

  it("コントラスト + で 0.5 からの偏差が拡大する", () => {
    // 明るい画素はより明るく、暗い画素はより暗く
    expect(apply([0.7, 0.7, 0.7], { contrast: 60 })[0]).toBeGreaterThan(0.7);
    expect(apply([0.3, 0.3, 0.3], { contrast: 60 })[0]).toBeLessThan(0.3);
  });

  it("彩度 -100 で完全グレースケール（R=G=B）になる", () => {
    const [r, g, b] = apply([0.8, 0.2, 0.4], { saturation: -100 });
    expect(r).toBeCloseTo(g, 5);
    expect(g).toBeCloseTo(b, 5);
  });

  it("彩度 + で色差（最大-最小）が拡大する", () => {
    const before: [number, number, number] = [0.6, 0.5, 0.4];
    const after = apply(before, { saturation: 60 });
    const spread = (c: [number, number, number]) =>
      Math.max(...c) - Math.min(...c);
    expect(spread(after)).toBeGreaterThan(spread(before));
  });

  it("色温度 + で赤が増え青が減る（暖色化）", () => {
    const before: [number, number, number] = [0.5, 0.5, 0.5];
    const after = apply(before, { temperature: 60 });
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[2]).toBeLessThan(before[2]);
  });

  it("色合い + で緑が増える", () => {
    const after = apply([0.5, 0.5, 0.5], { tint: 60 });
    expect(after[1]).toBeGreaterThan(0.5);
  });

  it("自然な彩度は低彩度画素により強い彩度ゲイン（相対倍率）をかける", () => {
    // vibrance は既に彩度が高い画素ほど倍率を抑えるため、彩度の相対的な伸び
    // （after/before）は低彩度画素の方が大きい（絶対量ではなく倍率で比較する）。
    const spread = (c: [number, number, number]) =>
      Math.max(...c) - Math.min(...c);
    const lowBefore: [number, number, number] = [0.52, 0.5, 0.48];
    const lowRatio =
      spread(apply(lowBefore, { vibrance: 80 })) / spread(lowBefore);
    const highBefore: [number, number, number] = [0.9, 0.5, 0.1];
    const highRatio =
      spread(apply(highBefore, { vibrance: 80 })) / spread(highBefore);
    expect(lowRatio).toBeGreaterThan(highRatio);
  });

  it("色相を回すと彩度のある色のチャンネル構成が変わる", () => {
    const before: [number, number, number] = [0.9, 0.1, 0.1]; // 赤
    const after = apply(before, { hue: 40 });
    // 少なくとも 1 チャンネルが有意に変化する
    const delta =
      Math.abs(after[0] - before[0]) +
      Math.abs(after[1] - before[1]) +
      Math.abs(after[2] - before[2]);
    expect(delta).toBeGreaterThan(0.05);
  });

  it("グレー画素は色相を回しても変化しない（彩度 0）", () => {
    const before: [number, number, number] = [0.5, 0.5, 0.5];
    const after = apply(before, { hue: 80 });
    expect(after[0]).toBeCloseTo(0.5, 4);
    expect(after[1]).toBeCloseTo(0.5, 4);
    expect(after[2]).toBeCloseTo(0.5, 4);
  });

  it("ガンマ + で中間調が明るく、− で暗くなる。端点 0 / 1 は不変", () => {
    const mid: [number, number, number] = [0.25, 0.25, 0.25];
    // γ = 2^(-0.5) ≈ 0.707 → 0.25^0.707 ≈ 0.375
    expect(apply(mid, { gamma: 50 })[0]).toBeCloseTo(0.25 ** (2 ** -0.5), 5);
    expect(apply(mid, { gamma: 50 })[0]).toBeGreaterThan(0.25);
    expect(apply(mid, { gamma: -50 })[0]).toBeLessThan(0.25);
    // 冪変換なので黒と白は動かない
    expect(apply([0, 0, 0], { gamma: 60 })[0]).toBe(0);
    expect(apply([1, 1, 1], { gamma: 60 })[0]).toBe(1);
  });

  it("モノクロで R=G=B（luma 保存）になる", () => {
    const before: [number, number, number] = [0.8, 0.2, 0.4];
    const [r, g, b] = apply(before, { monochrome: 100 });
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeCloseTo(lumaOf(before), 5);
  });

  it("モノクロは彩度スライダーと独立に機能する", () => {
    const [r, g, b] = apply([0.8, 0.2, 0.4], {
      saturation: 50,
      monochrome: 100,
    });
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("色温度はモノクロ化前に効く（B&W カラーフィルタとして機能）", () => {
    const gray: [number, number, number] = [0.5, 0.5, 0.5];
    const plain = apply(gray, { monochrome: 100 })[0];
    const filtered = apply(gray, { temperature: 100, monochrome: 100 })[0];
    // 温度シフト後の luma は R 重み分だけ増える（0.2·(W_r − W_b) > 0）
    expect(filtered).not.toBeCloseTo(plain, 3);
    expect(filtered).toBeGreaterThan(plain);
  });
});

describe("パイプライン係数の輸出（自動補正の逆算用）", () => {
  it("blacksToneWeight は暗部 0.5・中点 0 の smoothstep マスク", () => {
    expect(blacksToneWeight(0)).toBeCloseTo(0.5, 10);
    expect(blacksToneWeight(0.25)).toBeCloseTo(0.25, 10);
    expect(blacksToneWeight(0.5)).toBeCloseTo(0, 10);
    expect(blacksToneWeight(1)).toBeCloseTo(0, 10);
  });

  it("whitesToneWeight は明部 0.5・中点 0 の smoothstep マスク", () => {
    expect(whitesToneWeight(1)).toBeCloseTo(0.5, 10);
    expect(whitesToneWeight(0.75)).toBeCloseTo(0.25, 10);
    expect(whitesToneWeight(0.5)).toBeCloseTo(0, 10);
    expect(whitesToneWeight(0)).toBeCloseTo(0, 10);
  });

  it("シフト係数は GLSL 側のリテラル（0.2）と一致する", () => {
    expect(TEMPERATURE_SHIFT).toBe(0.2);
    expect(TINT_SHIFT).toBe(0.2);
  });

  it("整合ガード: applyAdjustmentToPixel の黒/白レベルは輸出した重みと同じシフト量になる", () => {
    // グレー 0.25 に blacks=-100（n=-1）→ 0.25 - blacksToneWeight(0.25) = 0
    const black = apply([0.25, 0.25, 0.25], { blacks: -100 });
    expect(black[0]).toBeCloseTo(0.25 - blacksToneWeight(0.25), 5);
    // グレー 0.75 に whites=100（n=1）→ 0.75 + whitesToneWeight(0.75) = 1
    const white = apply([0.75, 0.75, 0.75], { whites: 100 });
    expect(white[0]).toBeCloseTo(0.75 + whitesToneWeight(0.75), 5);
  });

  it("整合ガード: applyAdjustmentToPixel の色温度/色合いは輸出した係数と同じシフト量になる", () => {
    const [r, g, b] = apply([0.5, 0.5, 0.5], { temperature: 50, tint: 50 });
    expect(r).toBeCloseTo(0.5 + 0.5 * TEMPERATURE_SHIFT, 5);
    expect(b).toBeCloseTo(0.5 - 0.5 * TEMPERATURE_SHIFT, 5);
    expect(g).toBeCloseTo(0.5 + 0.5 * TINT_SHIFT, 5);
  });
});

describe("resolveAdjustmentForIndex", () => {
  const shared: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, exposure: 30 };
  const perImage: AdjustmentState = { ...DEFAULT_ADJUSTMENTS, contrast: 50 };

  it("一括モードは全インデックスで共有調整を返す", () => {
    const state: EditState = {
      applyToAll: true,
      sharedAdjustments: shared,
      perImageAdjustments: { 0: perImage },
    };
    expect(resolveAdjustmentForIndex(0, state)).toBe(shared);
    expect(resolveAdjustmentForIndex(5, state)).toBe(shared);
  });

  it("画像ごとモードは当該インデックスの値、未設定は DEFAULT を返す", () => {
    const state: EditState = {
      applyToAll: false,
      sharedAdjustments: shared,
      perImageAdjustments: { 1: perImage },
    };
    expect(resolveAdjustmentForIndex(1, state)).toBe(perImage);
    expect(resolveAdjustmentForIndex(0, state)).toBe(DEFAULT_ADJUSTMENTS);
  });
});
