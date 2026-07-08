import { describe, expect, it } from "vitest";
import {
  CUSTOM_LUT_ID,
  DEFAULT_LUT_SELECTION,
  DEFAULT_LUT_STRENGTH,
  findLutPreset,
  isDefaultLutSelection,
  LUT_PRESETS,
  type LutSelection,
  type LutSelectionState,
  resolveLutForIndex,
} from "../lutState";

describe("DEFAULT_LUT_SELECTION", () => {
  it("未選択・フル適用強度である", () => {
    expect(DEFAULT_LUT_SELECTION.lutId).toBeNull();
    expect(DEFAULT_LUT_SELECTION.strength).toBe(DEFAULT_LUT_STRENGTH);
    expect(isDefaultLutSelection(DEFAULT_LUT_SELECTION)).toBe(true);
  });

  it("LUT が選択されていれば default ではない", () => {
    expect(isDefaultLutSelection({ lutId: "warm", strength: 50 })).toBe(false);
  });
});

describe("LUT_PRESETS", () => {
  it("ID が一意で file/nameKey を持つ", () => {
    const ids = LUT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of LUT_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.nameKey).toBeTruthy();
      expect(preset.file).toMatch(/\.cube$/);
    }
  });

  it("プリセット ID は予約済みのカスタム ID と衝突しない", () => {
    expect(LUT_PRESETS.some((p) => p.id === CUSTOM_LUT_ID)).toBe(false);
  });

  it("findLutPreset で ID から引ける", () => {
    expect(findLutPreset(LUT_PRESETS[0].id)).toEqual(LUT_PRESETS[0]);
    expect(findLutPreset("no-such-id")).toBeUndefined();
  });
});

describe("resolveLutForIndex", () => {
  const shared: LutSelection = { lutId: "cinematic", strength: 80 };
  const perImage: Record<number, LutSelection> = {
    0: { lutId: "warm", strength: 40 },
    2: { lutId: CUSTOM_LUT_ID, strength: 100 },
  };

  it("一括モードでは全インデックスで共有選択を返す", () => {
    const state: LutSelectionState = {
      applyToAll: true,
      sharedLut: shared,
      perImageLut: perImage,
    };
    expect(resolveLutForIndex(0, state)).toEqual(shared);
    expect(resolveLutForIndex(5, state)).toEqual(shared);
  });

  it("画像ごとモードでは当該インデックスの選択を返す", () => {
    const state: LutSelectionState = {
      applyToAll: false,
      sharedLut: shared,
      perImageLut: perImage,
    };
    expect(resolveLutForIndex(0, state)).toEqual(perImage[0]);
    expect(resolveLutForIndex(2, state)).toEqual(perImage[2]);
  });

  it("画像ごとモードで未設定インデックスは既定（未選択）を返す", () => {
    const state: LutSelectionState = {
      applyToAll: false,
      sharedLut: shared,
      perImageLut: perImage,
    };
    expect(resolveLutForIndex(1, state)).toEqual(DEFAULT_LUT_SELECTION);
  });
});
