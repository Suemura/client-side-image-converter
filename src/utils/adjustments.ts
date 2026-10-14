/**
 * 画像編集（ライト/カラー調整）のコア型と Canvas / WebGL 非依存の純粋ロジック。
 *
 * メインスレッド（`imageEditor.ts` / `webglImageRenderer.ts` の CPU パス）と
 * WebGL シェーダ（`adjustmentShader.ts`）の双方が同一の「調整の数式」を共有できるよう、
 * ピクセル単位の色調整を純粋関数 `applyAdjustmentToPixel` に集約する
 * （GLSL 側はこの関数を同じ順序・同じ係数でミラーする。これが WYSIWYG 一致の唯一の真実）。
 *
 * Canvas / DOM / WASM に依存しないため単体テストの対象とする
 * （cropGeometry.ts / conversionCore.ts と同じ「純粋ロジックの切り出し」方針）。
 */

/** ライト（明るさ・階調）系の調整項目 */
export const LIGHT_ADJUSTMENT_KEYS = [
  "exposure", // 露光量
  "gamma", // ガンマ（中間調の冪変換）
  "brightness", // 輝度
  "contrast", // コントラスト
  "highlights", // ハイライト
  "shadows", // シャドウ
  "whites", // 白レベル
  "blacks", // 黒レベル（ブラックポイント）
] as const;

/** カラー（色）系の調整項目 */
export const COLOR_ADJUSTMENT_KEYS = [
  "saturation", // 彩度
  "vibrance", // 自然な彩度
  "temperature", // 色温度
  "tint", // 色合い
  "hue", // 色相
  "monochrome", // モノクロ変換（0/100 のトグル）
] as const;

/** ディテール（近傍参照の畳み込み）系の調整項目 */
export const DETAIL_ADJUSTMENT_KEYS = [
  "sharpness", // シャープネス（小半径 unsharp mask、0 起点の片方向）
  "clarity", // 明瞭度（大半径・中間調限定の unsharp mask）
] as const;

/** 効果（画素位置依存の仕上げ）系の調整項目 */
export const EFFECT_ADJUSTMENT_KEYS = [
  "vignette", // ビネット（周辺減光 / 増光）
  "grain", // グレイン（決定的ノイズ、0 起点の片方向）
] as const;

/** 全調整項目のキー（UI のグループ表示・シェーダ配線・リセットで共用） */
export const ADJUSTMENT_KEYS = [
  ...LIGHT_ADJUSTMENT_KEYS,
  ...COLOR_ADJUSTMENT_KEYS,
  ...DETAIL_ADJUSTMENT_KEYS,
  ...EFFECT_ADJUSTMENT_KEYS,
] as const;

export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];

/**
 * 調整状態。各項目は UI 単位 [-100, 100] の整数で保持する（0 = 無調整）。
 * 描画（CPU / GPU）には `normalizeAdjustments` で [-1, 1] に正規化してから渡す。
 */
export type AdjustmentState = Record<AdjustmentKey, number>;

/** 正規化済みの調整値（各項目 [-1, 1]）。CPU / GPU の描画数式へ渡す */
export type NormalizedAdjustments = Record<AdjustmentKey, number>;

/** UI スライダーの範囲（全項目共通） */
export const ADJUSTMENT_MIN = -100;
export const ADJUSTMENT_MAX = 100;

/**
 * UI スライダーの下限の例外（0 起点の片方向項目）。未指定キーは ADJUSTMENT_MIN。
 * 状態のクランプ（clampAdjustments）は全キー [-100,100] のまま維持し、
 * 数式側でも負値を 0 扱いに防御する（UI 以外からの値混入対策）。
 */
export const ADJUSTMENT_UI_MIN: Partial<Record<AdjustmentKey, number>> = {
  sharpness: 0,
  grain: 0,
};

/** 無調整（すべて 0） */
export const DEFAULT_ADJUSTMENTS: AdjustmentState = {
  exposure: 0,
  gamma: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  monochrome: 0,
  sharpness: 0,
  clarity: 0,
  vignette: 0,
  grain: 0,
};

/** luma 計算に使う Rec.709 の輝度重み（GLSL 側と一致させる） */
export const LUMA_WEIGHTS: readonly [number, number, number] = [
  0.2126, 0.7152, 0.0722,
];

/** 値を [min, max] に収める（非有限値は fallback へ） */
const clampNumber = (
  value: number,
  min: number,
  max: number,
  fallback = 0,
): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
};

/**
 * 調整状態を UI 範囲 [-100, 100] にクランプする。
 * 未知キーは無視し、欠損キーは 0（無調整）で補完した完全な状態を返す。
 */
export const clampAdjustments = (
  state: Partial<AdjustmentState>,
): AdjustmentState => {
  const result = { ...DEFAULT_ADJUSTMENTS };
  for (const key of ADJUSTMENT_KEYS) {
    result[key] = Math.round(
      clampNumber(state[key] ?? 0, ADJUSTMENT_MIN, ADJUSTMENT_MAX),
    );
  }
  return result;
};

/** すべての項目が 0（無調整）かどうか */
export const isDefaultAdjustments = (state: AdjustmentState): boolean =>
  ADJUSTMENT_KEYS.every((key) => state[key] === 0);

/**
 * UI 単位 [-100, 100] の調整状態を描画用 [-1, 1] に正規化する。
 * CPU パス（`applyAdjustmentToPixel`）と GPU パス（uniform アップロード）の両方が
 * この 1 か所の正規化を経由することで、係数のズレによる WYSIWYG 崩れを防ぐ。
 */
export const normalizeAdjustments = (
  state: AdjustmentState,
): NormalizedAdjustments => {
  const result = {} as NormalizedAdjustments;
  for (const key of ADJUSTMENT_KEYS) {
    result[key] = (state[key] ?? 0) / 100;
  }
  return result;
};

// --- GLSL 組込みと挙動を合わせるスカラーヘルパー（CPU パス用。effects.ts と共有） ---

/** GLSL clamp(v, 0.0, 1.0) と同一 */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** GLSL smoothstep(edge0, edge1, x) と同一 */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** GLSL mix(a, b, t) = a*(1-t) + b*t */
const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/** GLSL fract(x) = x - floor(x) */
const fract = (x: number): number => x - Math.floor(x);

const luma = (r: number, g: number, b: number): number =>
  r * LUMA_WEIGHTS[0] + g * LUMA_WEIGHTS[1] + b * LUMA_WEIGHTS[2];

// --- パイプライン係数の輸出（自動補正の逆算用） ---
// `applyAdjustmentToPixel` の手順 4（黒/白レベル）・手順 6（色温度/色合い）と同一の式・係数。
// 自動補正（autoAdjust.ts）が「目標の画素シフト量 → スライダー値」の逆算に使うため輸出する。
// GLSL 側（adjustmentShader.ts）は同じ式をリテラルでミラーしているため、変更時は両方を揃えること。

/** 黒レベルのトーンマスク重み。blacksAmt = n.blacks * blacksToneWeight(toneLuma) */
export const blacksToneWeight = (toneLuma: number): number =>
  0.5 * (1 - smoothstep(0, 0.5, toneLuma));

/** 白レベルのトーンマスク重み。whitesAmt = n.whites * whitesToneWeight(toneLuma) */
export const whitesToneWeight = (toneLuma: number): number =>
  0.5 * smoothstep(0.5, 1, toneLuma);

/** 色温度のチャンネルシフト係数（R へ加算・B から減算） */
export const TEMPERATURE_SHIFT = 0.2;

/** 色合いのチャンネルシフト係数（G へ加算） */
export const TINT_SHIFT = 0.2;

/** RGB([0,1]) → HSV([0,1]^3)。GLSL 側の分岐なし変換と同じ結果を返す */
const rgbToHsv = (
  r: number,
  g: number,
  b: number,
): [number, number, number] => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h /= 6;
    if (h < 0) {
      h += 1;
    }
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
};

/** HSV([0,1]^3) → RGB([0,1]) */
const hsvToRgb = (
  h: number,
  s: number,
  v: number,
): [number, number, number] => {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
};

/**
 * 1 ピクセル（RGB, 各 [0,1]）に正規化済み調整を適用して返す（各 [0,1]）。
 *
 * これが CPU / GPU 共通の「調整パイプライン」の定義であり、`adjustmentShader.ts` の
 * GLSL は本関数と同じ順序・同じ係数を実装する。順序依存を避けるためパイプライン順は固定し、
 * トーンマスク用の luma はコントラスト適用直後に一度だけ計算して blacks/whites/shadows/highlights
 * で共用する。色空間は sRGB ガンマ空間のまま（線形化しない）— 写真アプリ相当の簡易調整として十分で、
 * かつ GPU/CPU の一致を担保しやすいという設計判断。
 */
export const applyAdjustmentToPixel = (
  r: number,
  g: number,
  b: number,
  n: NormalizedAdjustments,
): [number, number, number] => {
  let cr = r;
  let cg = g;
  let cb = b;

  // 1. 露光量（±1 stop）
  const exposureGain = 2 ** n.exposure;
  cr *= exposureGain;
  cg *= exposureGain;
  cb *= exposureGain;

  // 1b. ガンマ（中間調の冪変換。γ = 2^(-n) で + が明るく = 他スライダーと符号の向きが揃う）。
  // 露光直後は c ≥ 0 が保証される唯一の位置のため冪が安全（輝度リフト以降は負になり得る）。
  // GLSL の pow は負値で未定義のため max(c, 0) の防御も両パスで揃える
  if (n.gamma !== 0) {
    const gammaExp = 2 ** -n.gamma;
    cr = Math.max(cr, 0) ** gammaExp;
    cg = Math.max(cg, 0) ** gammaExp;
    cb = Math.max(cb, 0) ** gammaExp;
  }

  // 2. 輝度（加算リフト）
  const lift = n.brightness * 0.5;
  cr += lift;
  cg += lift;
  cb += lift;

  // 3. コントラスト（0.5 ピボット）
  const contrastGain = 1 + n.contrast;
  cr = (cr - 0.5) * contrastGain + 0.5;
  cg = (cg - 0.5) * contrastGain + 0.5;
  cb = (cb - 0.5) * contrastGain + 0.5;

  // トーンマスク用の luma（この時点で一度だけ計算し 4 項目で共用）
  const toneLuma = luma(cr, cg, cb);

  // 4. 黒レベル / 白レベル
  const blacksAmt = n.blacks * blacksToneWeight(toneLuma);
  const whitesAmt = n.whites * whitesToneWeight(toneLuma);
  // 5. シャドウ / ハイライト（黒/白より広いマスク域で差別化。+ を「明るく」に統一）
  const shadowsAmt = n.shadows * 0.5 * (1 - smoothstep(0, 0.6, toneLuma));
  const highlightsAmt = n.highlights * 0.5 * smoothstep(0.4, 1, toneLuma);
  const toneAdd = blacksAmt + whitesAmt + shadowsAmt + highlightsAmt;
  cr += toneAdd;
  cg += toneAdd;
  cb += toneAdd;

  // 6. 色温度（青-橙軸。+ = 暖色）/ 色合い（+ = 緑寄り）
  cr += n.temperature * TEMPERATURE_SHIFT;
  cb -= n.temperature * TEMPERATURE_SHIFT;
  cg += n.tint * TINT_SHIFT;

  // 色操作の前に一度クランプ（彩度/色相変換は [0,1] の妥当な色を前提とする。
  // GLSL 側の temperature 直後のクランプと対応）
  cr = clamp01(cr);
  cg = clamp01(cg);
  cb = clamp01(cb);

  // 7. 彩度（-1 で完全グレースケール）
  const satLuma = luma(cr, cg, cb);
  const satGain = 1 + n.saturation;
  cr = mix(satLuma, cr, satGain);
  cg = mix(satLuma, cg, satGain);
  cb = mix(satLuma, cb, satGain);

  // 8. 自然な彩度（既に彩度が高い画素ほど効果を抑制）。
  // vibrance=0 のとき amt=0 → mix ゲイン 1 で無変化。GLSL とパイプラインを一致させるため
  // 条件分岐せず常に評価し、クランプはこの直後に一度だけ行う。
  const sat = Math.max(cr, cg, cb) - Math.min(cr, cg, cb);
  const amt = n.vibrance * (1 - sat);
  const vibLuma = luma(cr, cg, cb);
  const vibGain = 1 + amt;
  cr = mix(vibLuma, cr, vibGain);
  cg = mix(vibLuma, cg, vibGain);
  cb = mix(vibLuma, cb, vibGain);
  cr = clamp01(cr);
  cg = clamp01(cg);
  cb = clamp01(cb);

  // 9. 色相（±180° の回転）
  if (n.hue !== 0) {
    const [h, s, v] = rgbToHsv(cr, cg, cb);
    const [nr, ng, nb] = hsvToRgb(fract(h + n.hue * 0.5), s, v);
    cr = nr;
    cg = ng;
    cb = nb;
  }

  // 9b. モノクロ変換（0/100 のトグル。luma 化）。色相の後 = 調整の最後に置くことで、
  // 温度 / 色合い / 色相がモノクロ化前の色に効き、B&W の「カラーフィルタ」として機能する。
  // 彩度 -100 と結果は同じだが、彩度スライダーと独立に ON/OFF できる明示トグルとして提供する
  if (n.monochrome >= 0.5) {
    const monoLuma = luma(cr, cg, cb);
    cr = monoLuma;
    cg = monoLuma;
    cb = monoLuma;
  }

  // 10. 最終クランプ
  return [clamp01(cr), clamp01(cg), clamp01(cb)];
};
