/**
 * トーンカーブ（RGB マスター / 輝度チャンネル）のコア型と Canvas / WebGL / DOM 非依存の純粋ロジック。
 *
 * カーブは正規化座標 [0,1]² の制御点列で表し、Fritsch–Carlson の単調 3 次 Hermite 補間で
 * 256 エントリの 1D LUT へ焼成する（単調性保証・オーバーシュートなし）。GPU / CPU が共有する
 * 唯一のデータ形式は `buildToneCurveTable` が生成する RGBA インターリーブの
 * `Float32Array(256 * 4)`（焼成時に 8bit 量子化済み）で、GPU は 256×1 RGBA8 テクスチャの
 * LINEAR サンプリング、CPU は同式の
 * floor + lerp（`sampleCurveTable`）で lookup する（`adjustments.ts` の `applyAdjustmentToPixel` を
 * 唯一の真実とするのと同方針。GLSL 側は `applyToneCurveToPixel` を同順序・同係数でミラーする）。
 *
 * 適用順はパイプライン固定: 調整（applyAdjustmentToPixel）→ トーンカーブ（RGB → 輝度）→ LUT。
 * 輝度カーブは既存トーン調整（blacks/whites 等の toneAdd）と同じ加算シフト方式
 * （`curve(luma) - luma` を全チャンネルへ加算）とし、比率スケール方式の黒つぶれ特異点を避ける。
 *
 * Canvas / DOM / WASM に依存しないため単体テストの対象とする
 * （cropGeometry.ts / lutParser.ts と同じ「純粋ロジックの切り出し」方針）。
 */

import { LUMA_WEIGHTS } from "./adjustments";

/** カーブの制御点（正規化座標。x: 入力 [0,1] / y: 出力 [0,1]） */
export interface CurvePoint {
  x: number;
  y: number;
}

/** カーブのチャンネル。"rgb" は全チャンネル同一適用のマスターカーブ */
export const CURVE_CHANNELS = ["rgb", "luminance"] as const;
export type CurveChannel = (typeof CURVE_CHANNELS)[number];

/** チャンネル → 制御点列（常に x 昇順・端点 x=0 / x=1 を含む） */
export type ToneCurveState = Record<CurveChannel, CurvePoint[]>;

/** 焼成する 1D LUT のエントリ数（8bit 階調・ヒストグラムのビン数と揃える） */
export const CURVE_LUT_SIZE = 256;

/** 1 チャンネルあたりの制御点数の上限 */
export const MAX_CURVE_POINTS = 16;

/** 隣接制御点間の x の最小間隔（点の重なり・縦壁を防ぐ） */
export const CURVE_POINT_MIN_GAP = 0.01;

/** 恒等カーブの制御点（対角の 2 端点） */
const createDefaultPoints = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/** 無編集（両チャンネル恒等）のトーンカーブ状態 */
export const DEFAULT_TONE_CURVE: ToneCurveState = {
  rgb: createDefaultPoints(),
  luminance: createDefaultPoints(),
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 制御点列が既定（対角の 2 端点のみ）かどうか */
export const isDefaultCurvePoints = (points: CurvePoint[]): boolean =>
  points.length === 2 &&
  points[0].x === 0 &&
  points[0].y === 0 &&
  points[1].x === 1 &&
  points[1].y === 1;

/** 両チャンネルとも既定（恒等）かどうか */
export const isDefaultToneCurve = (state: ToneCurveState): boolean =>
  CURVE_CHANNELS.every((channel) => isDefaultCurvePoints(state[channel]));

/**
 * 制御点を追加した新しい配列を返す（x 昇順を維持。既存の点オブジェクトは再利用する）。
 * 上限（MAX_CURVE_POINTS）超過、または既存点と x が最小間隔未満のときは追加せず
 * **同じ配列参照**を返す（呼び出し側は参照比較で成否を判定できる）。
 */
export const addCurvePoint = (
  points: CurvePoint[],
  x: number,
  y: number,
): CurvePoint[] => {
  if (points.length >= MAX_CURVE_POINTS) {
    return points;
  }
  const cx = clamp01(x);
  const cy = clamp01(y);
  if (points.some((p) => Math.abs(p.x - cx) < CURVE_POINT_MIN_GAP)) {
    return points;
  }
  const next = [...points, { x: cx, y: cy }];
  next.sort((a, b) => a.x - b.x);
  return next;
};

/**
 * 制御点を移動した新しい配列を返す。
 * 端点（先頭 / 末尾）は x を固定して y のみ動かせる（フェード表現用）。
 * 内部点の x は隣接点 ± 最小間隔にクランプし、並び順とインデックスの安定を保つ。
 * 不正なインデックスは同じ配列参照を返す。
 */
export const moveCurvePoint = (
  points: CurvePoint[],
  index: number,
  x: number,
  y: number,
): CurvePoint[] => {
  if (index < 0 || index >= points.length) {
    return points;
  }
  const cy = clamp01(y);
  let cx = clamp01(x);
  if (index === 0) {
    cx = points[0].x;
  } else if (index === points.length - 1) {
    cx = points[points.length - 1].x;
  } else {
    const min = points[index - 1].x + CURVE_POINT_MIN_GAP;
    const max = points[index + 1].x - CURVE_POINT_MIN_GAP;
    // 追加・移動時に最小間隔が維持されるため通常 min <= max。万一逆転していたら現在値を保つ
    cx = min <= max ? Math.min(max, Math.max(min, cx)) : points[index].x;
  }
  const next = [...points];
  next[index] = { x: cx, y: cy };
  return next;
};

/**
 * 制御点を削除した新しい配列を返す。
 * 端点（先頭 / 末尾）は削除できない（常に 2 点以上が保たれる）。
 * 削除できないときは同じ配列参照を返す。
 */
export const removeCurvePoint = (
  points: CurvePoint[],
  index: number,
): CurvePoint[] => {
  if (index <= 0 || index >= points.length - 1) {
    return points;
  }
  return points.filter((_, i) => i !== index);
};

/**
 * Fritsch–Carlson 法で各制御点の接線（傾き）を計算する。
 * 局所極値で接線を 0 にし、割線に対する制限（α² + β² ≤ 9）で単調性を保証する
 * （制御点列が単調な区間ではオーバーシュートしない）。
 */
const computeCurveTangents = (points: CurvePoint[]): number[] => {
  const n = points.length;
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x;
    secants.push(h > 0 ? (points[i + 1].y - points[i].y) / h : 0);
  }
  const tangents = new Array<number>(n);
  tangents[0] = secants[0];
  tangents[n - 1] = secants[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // 割線の符号が変わる点（局所極値）は接線 0
    tangents[i] =
      secants[i - 1] * secants[i] <= 0 ? 0 : (secants[i - 1] + secants[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const secant = secants[i];
    if (secant === 0) {
      // 水平区間は両端の接線を 0 にして平坦を維持する
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / secant;
    const beta = tangents[i + 1] / secant;
    const norm = alpha * alpha + beta * beta;
    if (norm > 9) {
      const tau = 3 / Math.sqrt(norm);
      tangents[i] = tau * alpha * secant;
      tangents[i + 1] = tau * beta * secant;
    }
  }
  return tangents;
};

/** 接線計算済みの制御点列を x で評価する（区間探索 + 3 次 Hermite） */
const evaluateWithTangents = (
  points: CurvePoint[],
  tangents: number[],
  x: number,
): number => {
  const n = points.length;
  if (x <= points[0].x) {
    return clamp01(points[0].y);
  }
  if (x >= points[n - 1].x) {
    return clamp01(points[n - 1].y);
  }
  let i = 0;
  while (x > points[i + 1].x) {
    i++;
  }
  const h = points[i + 1].x - points[i].x;
  if (h <= 0) {
    return clamp01(points[i + 1].y);
  }
  const t = (x - points[i].x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const y =
    (2 * t3 - 3 * t2 + 1) * points[i].y +
    (t3 - 2 * t2 + t) * h * tangents[i] +
    (-2 * t3 + 3 * t2) * points[i + 1].y +
    (t3 - t2) * h * tangents[i + 1];
  return clamp01(y);
};

/**
 * 制御点列を x ∈ [0,1] で評価する（単調 3 次 Hermite）。
 * 制御点が 2 点未満の縮退列は恒等（y = x）として扱う。
 */
export const evaluateCurve = (points: CurvePoint[], x: number): number => {
  const cx = clamp01(x);
  if (points.length < 2) {
    return cx;
  }
  return evaluateWithTangents(points, computeCurveTangents(points), cx);
};

/** 制御点列を 256 エントリの 1D LUT（各 [0,1]）へ焼成する */
export const buildCurveLut = (points: CurvePoint[]): Float32Array => {
  const lut = new Float32Array(CURVE_LUT_SIZE);
  if (points.length < 2) {
    for (let i = 0; i < CURVE_LUT_SIZE; i++) {
      lut[i] = i / (CURVE_LUT_SIZE - 1);
    }
    return lut;
  }
  const tangents = computeCurveTangents(points);
  for (let i = 0; i < CURVE_LUT_SIZE; i++) {
    lut[i] = evaluateWithTangents(points, tangents, i / (CURVE_LUT_SIZE - 1));
  }
  return lut;
};

/** 焼成時の 8bit 量子化（GPU の RGBA8 テクセルと同じ値へ丸める）。恒等 i/255 は不変 */
const quantize8 = (v: number): number => Math.round(v * 255) / 255;

/**
 * トーンカーブ状態を GPU / CPU 共通の lookup テーブルへ焼成する。
 *
 * 形式は RGBA インターリーブの `Float32Array(256 * 4)`:
 * `.rgb` に各チャンネルのカーブ（現状は 3 つともマスターカーブの同値。将来 R/G/B 個別カーブを
 * 追加してもテクスチャ形式・シェーダを変えずに拡張できる）、`.a` に輝度カーブを詰める。
 * GPU はこれを 256×1 の RGBA8 テクスチャとしてアップロードするため、各エントリは焼成時に
 * 8bit 量子化しておく（GPU テクセルと CPU の参照値が同一になり lookup の量子化差が出ない。
 * 恒等カーブの i/255 は量子化で不変のため恒等の厳密性も保たれる）。
 */
export const buildToneCurveTable = (state: ToneCurveState): Float32Array => {
  const master = buildCurveLut(state.rgb);
  const luminance = buildCurveLut(state.luminance);
  const table = new Float32Array(CURVE_LUT_SIZE * 4);
  for (let i = 0; i < CURVE_LUT_SIZE; i++) {
    const m = quantize8(master[i]);
    table[i * 4] = m;
    table[i * 4 + 1] = m;
    table[i * 4 + 2] = m;
    table[i * 4 + 3] = quantize8(luminance[i]);
  }
  return table;
};

/**
 * 焼成テーブルの 1 チャンネルを v ∈ [0,1] で線形補間 lookup する。
 * GPU（256×1 テクスチャの LINEAR サンプリング + テクセル中心補正 (v*255+0.5)/256）と
 * 同じ floor + lerp の式で lookup する。テーブル値は焼成時に 8bit 量子化済み
 * （`buildToneCurveTable`）のため、GPU のテクセル値と CPU の参照値も同一で一致する。
 * channel: 0=R / 1=G / 2=B / 3=輝度。
 */
export const sampleCurveTable = (
  table: Float32Array,
  channel: 0 | 1 | 2 | 3,
  v: number,
): number => {
  const f = clamp01(v) * (CURVE_LUT_SIZE - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, CURVE_LUT_SIZE - 1);
  const t = f - i0;
  return table[i0 * 4 + channel] * (1 - t) + table[i1 * 4 + channel] * t;
};

/**
 * 1 ピクセル（RGB, 各 [0,1]）へ焼成済みトーンカーブを適用して返す（各 [0,1]）。
 *
 * これが CPU / GPU 共通の「トーンカーブ適用」の定義であり、`adjustmentShader.ts` の GLSL は
 * 本関数と同じ順序（1. RGB マスターカーブ → 2. 輝度カーブの加算シフト）をミラーする。
 * 輝度シフトは既存トーン調整（toneAdd）と同じ加算方式で、luma は Rec.709（LUMA_WEIGHTS）。
 */
export const applyToneCurveToPixel = (
  r: number,
  g: number,
  b: number,
  table: Float32Array,
): [number, number, number] => {
  // 1. RGB マスターカーブ（チャンネルごとに lookup）
  const cr = sampleCurveTable(table, 0, r);
  const cg = sampleCurveTable(table, 1, g);
  const cb = sampleCurveTable(table, 2, b);
  // 2. 輝度カーブ（curve(luma) - luma を全チャンネルへ加算）
  const luma =
    cr * LUMA_WEIGHTS[0] + cg * LUMA_WEIGHTS[1] + cb * LUMA_WEIGHTS[2];
  const shift = sampleCurveTable(table, 3, luma) - luma;
  return [clamp01(cr + shift), clamp01(cg + shift), clamp01(cb + shift)];
};

/** crop / adjustments / LUT と同型の、edit ページが保持するトーンカーブ状態（一括 / 画像ごと） */
export interface ToneCurveEditState {
  /** true: 全画像へ共有カーブを適用 / false: 画像ごとに保持 */
  applyToAll: boolean;
  /** 一括モードの共有カーブ */
  sharedToneCurve: ToneCurveState;
  /** 画像ごとのカーブ（未設定インデックスは恒等） */
  perImageToneCurve: Record<number, ToneCurveState>;
}

/**
 * 出力時、指定インデックスの画像へ適用するトーンカーブを解決する。
 * （`resolveAdjustmentForIndex` / `resolveLutForIndex` を踏襲）
 */
export const resolveToneCurveForIndex = (
  index: number,
  state: ToneCurveEditState,
): ToneCurveState => {
  if (state.applyToAll) {
    return state.sharedToneCurve;
  }
  return state.perImageToneCurve[index] ?? DEFAULT_TONE_CURVE;
};
