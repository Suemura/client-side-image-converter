/**
 * RAW 現像パラメータの純粋ロジック（Canvas / WASM 非依存・単体テスト対象）
 *
 * ユーザー向けの現像パラメータ（露出補正 EV / ホワイトバランス / ハイライト復元）を
 * libraw-wasm の `LibRawSettings` へ変換する。LibRaw はこれらをリニア 16bit の
 * 生データ上で適用するため、8bit 現像後の調整より階調余地が大きい（Issue #132）。
 *
 * `import type` のみのため libraw-wasm の WASM 本体はロードされない。
 */

import type { LibRawSettings } from "libraw-wasm";

/** ホワイトバランスのモード */
export type RawWbMode = "camera" | "auto" | "manual";

/**
 * ハイライト復元モード（LibRaw の `-H` に対応する値のうち UI で提示する 3 つ）
 * - 0: クリップ（標準。白飛び部分を白へ切り捨てる）
 * - 2: ブレンド（クリップと復元の中間的な合成）
 * - 5: 再構築（未クリップのチャンネルから復元。3-9 のうち中庸な 5 を採用）
 */
export type RawHighlightMode = 0 | 2 | 5;

/** RAW 現像パラメータ（UI ⇔ 変換オプションで受け渡す plain object。structured clone 可） */
export interface RawDevelopParams {
  /** 露出補正（EV）。EXPOSURE_EV_MIN..EXPOSURE_EV_MAX */
  exposureEV: number;
  /** ホワイトバランスのモード */
  wbMode: RawWbMode;
  /** 色温度（ケルビン）。wbMode === "manual" のときのみ使用 */
  kelvin: number;
  /** ハイライト復元モード */
  highlightMode: RawHighlightMode;
}

/** 露出補正の下限（EV）。2^-2 = 0.25 で LibRaw の expShift 有効域下限に一致 */
export const EXPOSURE_EV_MIN = -2;
/** 露出補正の上限（EV）。2^3 = 8 で LibRaw の expShift 有効域上限に一致 */
export const EXPOSURE_EV_MAX = 3;
/** 色温度スライダーの下限（K） */
export const KELVIN_MIN = 2000;
/** 色温度スライダーの上限（K） */
export const KELVIN_MAX = 10000;
/** 色温度の既定値（K）。昼光（D65）相当でほぼ無補正になる */
export const KELVIN_DEFAULT = 6500;

/** デフォルト現像パラメータ（カメラ設定準拠 = Issue #101 時点の固定挙動と同一） */
export const DEFAULT_RAW_DEVELOP_PARAMS: RawDevelopParams = {
  exposureEV: 0,
  wbMode: "camera",
  kelvin: KELVIN_DEFAULT,
  highlightMode: 0,
};

/** パラメータがデフォルト現像（無調整）と等価かを返す */
export const isDefaultRawDevelopParams = (
  params: RawDevelopParams,
): boolean => {
  // kelvin は wbMode !== "manual" のとき現像結果に影響しないため比較しない
  return (
    params.exposureEV === DEFAULT_RAW_DEVELOP_PARAMS.exposureEV &&
    params.wbMode === DEFAULT_RAW_DEVELOP_PARAMS.wbMode &&
    params.highlightMode === DEFAULT_RAW_DEVELOP_PARAMS.highlightMode
  );
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * 色温度（ケルビン）から黒体放射の RGB 近似色を計算する（Tanner Helland 近似）。
 * 戻り値は 0..1 に正規化した RGB。
 */
const kelvinToIlluminantRgb = (kelvin: number): [number, number, number] => {
  const temp = clamp(kelvin, 1000, 40000) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (temp - 60) ** -0.1332047592;
    g = 288.1221695283 * (temp - 60) ** -0.0755148492;
    b = 255;
  }

  return [
    clamp(r, 0, 255) / 255,
    clamp(g, 0, 255) / 255,
    clamp(b, 0, 255) / 255,
  ];
};

/**
 * 色温度（ケルビン）を LibRaw の `userMul`（RGBG2 のホワイトバランス係数）へ変換する。
 *
 * 「光源が指定色温度だった」と仮定して中和する写真的な意味論:
 * 低 K（暖色光源）指定 → 青を持ち上げて画は寒色寄りに、高 K 指定 → 赤を持ち上げて暖色寄りになる。
 * 黒体放射近似の逆数を G=1 で正規化した相対調整用の係数で、カメラ実測 WB の再現ではない。
 */
export const kelvinToWbMultipliers = (
  kelvin: number,
): [number, number, number, number] => {
  const [r, g, b] = kelvinToIlluminantRgb(kelvin);
  // 逆数（中和）。0 除算を避けるため下限を設ける
  const mulR = 1 / Math.max(r, 0.01);
  const mulG = 1 / Math.max(g, 0.01);
  const mulB = 1 / Math.max(b, 0.01);
  // G = 1 に正規化し、極端な係数はクランプする
  return [clamp(mulR / mulG, 0.1, 10), 1, clamp(mulB / mulG, 0.1, 10), 1];
};

/**
 * 現像パラメータを libraw-wasm の `LibRawSettings` へ変換する（`open()` へ渡す）。
 *
 * デフォルトパラメータ・halfSize なしのとき、Issue #101 時点の固定設定
 * `{ useCameraWb: true, outputBps: 8 }` と同値になる（後方互換）。
 *
 * @param params - 現像パラメータ（未指定時はデフォルト現像）
 * @param options - halfSize: プレビュー用の半分サイズ現像（demosaic 省略で大幅高速化）
 */
export const buildLibRawSettings = (
  params: RawDevelopParams = DEFAULT_RAW_DEVELOP_PARAMS,
  options?: { halfSize?: boolean },
): LibRawSettings => {
  // Canvas へ展開するため 8bit 出力で十分（16bit 中間バッファのメモリ圧迫も避ける）。
  // 現像処理自体は LibRaw 内部のリニア 16bit 域で行われるため階調メリットは失われない
  const settings: LibRawSettings = { outputBps: 8 };

  // ホワイトバランス
  if (params.wbMode === "camera") {
    settings.useCameraWb = true;
  } else if (params.wbMode === "auto") {
    settings.useAutoWb = true;
  } else {
    settings.userMul = kelvinToWbMultipliers(params.kelvin);
  }

  // 露出補正（EV → リニア倍率）。expCorrec を立てないと expShift は無視される
  if (params.exposureEV !== 0) {
    settings.expCorrec = true;
    settings.expShift = clamp(
      2 ** clamp(params.exposureEV, EXPOSURE_EV_MIN, EXPOSURE_EV_MAX),
      0.25,
      8,
    );
  }

  // ハイライト復元（0 = クリップは LibRaw デフォルトのため省略）
  if (params.highlightMode !== 0) {
    settings.highlight = params.highlightMode;
  }

  if (options?.halfSize) {
    settings.halfSize = true;
  }

  return settings;
};
