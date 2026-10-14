import { describe, expect, it } from "vitest";
import {
  CUSTOM_LUT_ID,
  DEFAULT_LUT_SELECTION,
  DEFAULT_LUT_STRENGTH,
  findLutPreset,
  isDefaultLutSelection,
  LUT_PRESETS,
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
