import { describe, expect, it } from "vitest";
import {
  buildLibRawSettings,
  DEFAULT_RAW_DEVELOP_PARAMS,
  EXPOSURE_EV_MAX,
  EXPOSURE_EV_MIN,
  isDefaultRawDevelopParams,
  KELVIN_DEFAULT,
  kelvinToWbMultipliers,
  type RawDevelopParams,
} from "../rawDevelopment";

describe("buildLibRawSettings", () => {
  it("デフォルトパラメータでは従来の固定設定と同値になる（後方互換）", () => {
    expect(buildLibRawSettings()).toEqual({
      useCameraWb: true,
      outputBps: 8,
    });
    expect(buildLibRawSettings(DEFAULT_RAW_DEVELOP_PARAMS)).toEqual({
      useCameraWb: true,
      outputBps: 8,
    });
  });

  it("halfSize オプションが settings に反映される", () => {
    expect(
      buildLibRawSettings(DEFAULT_RAW_DEVELOP_PARAMS, { halfSize: true }),
    ).toEqual({
      useCameraWb: true,
      outputBps: 8,
      halfSize: true,
    });
    // halfSize: false は省略される（デフォルト同値）
    expect(
      buildLibRawSettings(DEFAULT_RAW_DEVELOP_PARAMS, { halfSize: false }),
    ).toEqual({ useCameraWb: true, outputBps: 8 });
  });

  it("露出補正 EV がリニア倍率 expShift へ変換される（expCorrec 併立）", () => {
    const params: RawDevelopParams = {
      ...DEFAULT_RAW_DEVELOP_PARAMS,
      exposureEV: 1,
    };
    const settings = buildLibRawSettings(params);
    expect(settings.expCorrec).toBe(true);
    expect(settings.expShift).toBeCloseTo(2);
    // 自動明るさ調整は露出シフトを相殺するため、露出補正時は無効化される
    expect(settings.noAutoBright).toBe(true);

    expect(
      buildLibRawSettings({ ...params, exposureEV: -1 }).expShift,
    ).toBeCloseTo(0.5);
    expect(
      buildLibRawSettings({ ...params, exposureEV: 3 }).expShift,
    ).toBeCloseTo(8);
  });

  it("露出補正 0 のときは expCorrec / expShift / noAutoBright を設定しない", () => {
    const settings = buildLibRawSettings(DEFAULT_RAW_DEVELOP_PARAMS);
    expect(settings.expCorrec).toBeUndefined();
    expect(settings.expShift).toBeUndefined();
    expect(settings.noAutoBright).toBeUndefined();
  });

  it("範囲外の EV は expShift の有効域 0.25〜8 にクランプされる", () => {
    expect(
      buildLibRawSettings({
        ...DEFAULT_RAW_DEVELOP_PARAMS,
        exposureEV: EXPOSURE_EV_MIN - 5,
      }).expShift,
    ).toBe(0.25);
    expect(
      buildLibRawSettings({
        ...DEFAULT_RAW_DEVELOP_PARAMS,
        exposureEV: EXPOSURE_EV_MAX + 5,
      }).expShift,
    ).toBe(8);
  });

  it("wbMode に応じて useCameraWb / useAutoWb / userMul が排他的に設定される", () => {
    const camera = buildLibRawSettings({
      ...DEFAULT_RAW_DEVELOP_PARAMS,
      wbMode: "camera",
    });
    expect(camera.useCameraWb).toBe(true);
    expect(camera.useAutoWb).toBeUndefined();
    expect(camera.userMul).toBeUndefined();

    const auto = buildLibRawSettings({
      ...DEFAULT_RAW_DEVELOP_PARAMS,
      wbMode: "auto",
    });
    expect(auto.useAutoWb).toBe(true);
    expect(auto.useCameraWb).toBeUndefined();
    expect(auto.userMul).toBeUndefined();

    const manual = buildLibRawSettings({
      ...DEFAULT_RAW_DEVELOP_PARAMS,
      wbMode: "manual",
      kelvin: 5000,
    });
    expect(manual.userMul).toEqual(kelvinToWbMultipliers(5000));
    expect(manual.useCameraWb).toBeUndefined();
    expect(manual.useAutoWb).toBeUndefined();
  });

  it("ハイライト復元モードが highlight に反映される（0 は省略）", () => {
    expect(
      buildLibRawSettings(DEFAULT_RAW_DEVELOP_PARAMS).highlight,
    ).toBeUndefined();
    expect(
      buildLibRawSettings({ ...DEFAULT_RAW_DEVELOP_PARAMS, highlightMode: 2 })
        .highlight,
    ).toBe(2);
    expect(
      buildLibRawSettings({ ...DEFAULT_RAW_DEVELOP_PARAMS, highlightMode: 5 })
        .highlight,
    ).toBe(5);
  });
});

describe("kelvinToWbMultipliers", () => {
  it("G = 1 に正規化された 4 要素（RGBG2）を返す", () => {
    const mul = kelvinToWbMultipliers(KELVIN_DEFAULT);
    expect(mul).toHaveLength(4);
    expect(mul[1]).toBe(1);
    expect(mul[3]).toBe(1);
  });

  it("既定の 6500K 付近では R / B 係数がほぼ等倍（無補正相当）", () => {
    const [r, , b] = kelvinToWbMultipliers(KELVIN_DEFAULT);
    expect(r).toBeGreaterThan(0.85);
    expect(r).toBeLessThan(1.15);
    expect(b).toBeGreaterThan(0.85);
    expect(b).toBeLessThan(1.15);
  });

  it("低 K（暖色光源の中和）では B 係数が大きく、高 K では R 係数が大きい", () => {
    const [rLow, , bLow] = kelvinToWbMultipliers(3000);
    const [rHigh, , bHigh] = kelvinToWbMultipliers(10000);
    // 3000K: 暖色光源を中和するため青を持ち上げる（画は寒色寄り）
    expect(bLow).toBeGreaterThan(rLow);
    // 10000K: 青い光源を中和するため赤を持ち上げる（画は暖色寄り）
    expect(rHigh).toBeGreaterThan(bHigh);
  });

  it("2000K → 10000K で暖色度（R/B 比）が単調に増加する", () => {
    let prevRatio = Number.NEGATIVE_INFINITY;
    for (let k = 2000; k <= 10000; k += 500) {
      const [r, , b] = kelvinToWbMultipliers(k);
      const ratio = r / b;
      expect(ratio).toBeGreaterThan(prevRatio);
      prevRatio = ratio;
    }
  });

  it("極端な入力でも係数が有限かつクランプ範囲内に収まる", () => {
    for (const k of [500, 1000, 40000, 100000]) {
      const mul = kelvinToWbMultipliers(k);
      for (const m of mul) {
        expect(Number.isFinite(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(0.1);
        expect(m).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("isDefaultRawDevelopParams", () => {
  it("デフォルトパラメータは true", () => {
    expect(isDefaultRawDevelopParams(DEFAULT_RAW_DEVELOP_PARAMS)).toBe(true);
  });

  it("kelvin の変更は wbMode が manual でなければ無調整とみなす", () => {
    expect(
      isDefaultRawDevelopParams({
        ...DEFAULT_RAW_DEVELOP_PARAMS,
        kelvin: 3000,
      }),
    ).toBe(true);
  });

  it("露出・WB モード・ハイライトのいずれかが変更されると false", () => {
    expect(
      isDefaultRawDevelopParams({
        ...DEFAULT_RAW_DEVELOP_PARAMS,
        exposureEV: 1,
      }),
    ).toBe(false);
    expect(
      isDefaultRawDevelopParams({
        ...DEFAULT_RAW_DEVELOP_PARAMS,
        wbMode: "auto",
      }),
    ).toBe(false);
    expect(
      isDefaultRawDevelopParams({
        ...DEFAULT_RAW_DEVELOP_PARAMS,
        highlightMode: 2,
      }),
    ).toBe(false);
  });
});
