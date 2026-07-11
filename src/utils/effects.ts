/**
 * ディテール（シャープネス / 明瞭度）とビネット / グレインの Canvas / WebGL / DOM 非依存な純粋ロジック。
 *
 * per-pixel 色変換だけの既存調整（`adjustments.ts`）と異なり、本モジュールの効果は
 * **近傍参照**（ディテール = 輝度の unsharp mask）と**画素位置**（ビネット = 中心からの距離、
 * グレイン = 座標ハッシュ）に依存する。パイプライン上の位置は
 * 「ディテール（ソース直後）→ 調整 → トーンカーブ → LUT → ビネット → グレイン」で固定し、
 * GPU（`adjustmentShader.ts` の GLSL）は本モジュールの関数と同じ順序・同じ係数・同じクランプ位置を
 * ミラーする（`applyAdjustmentToPixel` を唯一の真実とするのと同方針）。
 *
 * グレインの乱数は `Math.random` を使わず、GLSL の uint 演算とビット同一に実装できる
 * lowbias32 整数ハッシュで決定的に生成する（プレビューと出力・GPU と CPU で同じ粒）。
 *
 * Canvas / DOM / WASM に依存しないため単体テストの対象とする
 * （adjustments.ts / toneCurve.ts と同じ「純粋ロジックの切り出し」方針）。
 */

import { clamp01, LUMA_WEIGHTS, smoothstep } from "./adjustments";

// --- 係数定数（GLSL 側はビルダーがこれらを埋め込むため、ここが単一の真実） ---

/** シャープネス（小半径 unsharp mask）のゲイン */
export const SHARPNESS_GAIN = 2.0;

/** 明瞭度（大半径・中間調限定の unsharp mask）のゲイン */
export const CLARITY_GAIN = 1.5;

/** ビネットの最大減光率（n=±1 のとき四隅が 1 ∓ この値の係数になる） */
export const VIGNETTE_STRENGTH = 0.8;

/** ビネットの減光開始半径（対角正規化距離。これ以内の中心部は減光しない） */
export const VIGNETTE_INNER = 0.3;

/** グレインの最大ノイズ振幅（n=1 のとき ±この値） */
export const GRAIN_STRENGTH = 0.12;

/**
 * 3×3 ガウスカーネル (1,2,1)⊗(1,2,1)/16 のタップ（重み和 = 1）。
 * GLSL 側はビルダーがこの配列から texelFetch のタップ行を生成するため、カーネルの単一の真実。
 * y 対称なので GPU テクスチャの Y 反転の影響を受けない。
 */
export const GAUSS3_TAPS: ReadonlyArray<{
  dx: number;
  dy: number;
  w: number;
}> = [
  { dx: -1, dy: -1, w: 1 / 16 },
  { dx: 0, dy: -1, w: 2 / 16 },
  { dx: 1, dy: -1, w: 1 / 16 },
  { dx: -1, dy: 0, w: 2 / 16 },
  { dx: 0, dy: 0, w: 4 / 16 },
  { dx: 1, dy: 0, w: 2 / 16 },
  { dx: -1, dy: 1, w: 1 / 16 },
  { dx: 0, dy: 1, w: 2 / 16 },
  { dx: 1, dy: 1, w: 1 / 16 },
];

/**
 * 明瞭度の大半径ぼかし近似に使う整数ストライド（解像度適応）。
 * 3×3 カーネルをこの間隔で疎サンプリングすることで、マルチパスや非整数半径を使わずに
 * GPU / CPU で厳密に一致する大半径ぼかしを得る。短辺 200px ごとに 1 増え、下限 2。
 */
export const clarityStride = (width: number, height: number): number =>
  Math.max(2, Math.floor(Math.min(width, height) / 200));

/**
 * RGBA バイト列から輝度平面（[0,1] の Float32Array、width×height）を構築する。
 * ディテールの畳み込みタップをスカラー参照にするための CPU パス前処理
 * （sharpness / clarity がともに 0 のときは呼ばない）。
 */
export const computeLumaPlane = (
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Float32Array => {
  const plane = new Float32Array(width * height);
  for (let p = 0, i = 0; p < plane.length; p += 1, i += 4) {
    plane[p] =
      (data[i] * LUMA_WEIGHTS[0] +
        data[i + 1] * LUMA_WEIGHTS[1] +
        data[i + 2] * LUMA_WEIGHTS[2]) /
      255;
  }
  return plane;
};

/**
 * 輝度平面の (x, y) を中心に、ストライド付き 3×3 ガウスぼかしの値を返す。
 * 画像端はクランプ（GLSL 側の `clamp(coord, 0, size-1)` と同一の端処理）。
 */
export const blurLumaAt = (
  luma: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  stride: number,
): number => {
  let sum = 0;
  for (const tap of GAUSS3_TAPS) {
    const tx = Math.min(width - 1, Math.max(0, x + tap.dx * stride));
    const ty = Math.min(height - 1, Math.max(0, y + tap.dy * stride));
    sum += tap.w * luma[ty * width + tx];
  }
  return sum;
};

/** 明瞭度の中間調マスク（輝度 0.5 で 1、両端 0 で 0。ハイライト / シャドウを保護する） */
export const midtoneWeight = (l: number): number =>
  clamp01(1 - Math.abs(2 * l - 1));

/**
 * ディテール（シャープネス + 明瞭度）による輝度シフト量を返す。
 * 全チャンネルへ一様加算する無彩色の unsharp mask で、色フリンジを生まない。
 * - シャープネス: 隣接 3×3（ストライド 1）の小半径差分。負値は 0 扱い（片方向）
 * - 明瞭度: ストライド付き 3×3 の大半径差分 × 中間調マスク（負で軟調化も可能）
 */
export const detailDeltaAt = (
  luma: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  stride: number,
  nSharpness: number,
  nClarity: number,
): number => {
  const base = luma[y * width + x];
  let delta = 0;
  if (nSharpness > 0) {
    delta +=
      nSharpness *
      SHARPNESS_GAIN *
      (base - blurLumaAt(luma, width, height, x, y, 1));
  }
  if (nClarity !== 0) {
    delta +=
      nClarity *
      CLARITY_GAIN *
      midtoneWeight(base) *
      (base - blurLumaAt(luma, width, height, x, y, stride));
  }
  return delta;
};

/**
 * ビネットの乗算係数を返す（画素中心の対角正規化距離による周辺減光 / 増光）。
 * 非正方形では楕円状に落ちる（アスペクト追従。写真アプリの慣行）。
 * n > 0 で四隅が暗く（最大 1-VIGNETTE_STRENGTH）、n < 0 で四隅が明るくなる。
 * 係数は 0 未満にならないようクランプする。
 */
export const vignetteFactorAt = (
  x: number,
  y: number,
  width: number,
  height: number,
  nVignette: number,
): number => {
  const px = ((x + 0.5) / width) * 2 - 1;
  const py = ((y + 0.5) / height) * 2 - 1;
  const dist = Math.sqrt(px * px + py * py) / Math.SQRT2;
  const fall = smoothstep(VIGNETTE_INNER, 1, dist);
  return Math.max(0, 1 - nVignette * VIGNETTE_STRENGTH * fall);
};

// --- グレイン（決定的な整数ハッシュノイズ） ---

/** lowbias32 の乗算定数（GLSL 側のリテラルと一致させる。シェーダテストのガードが参照） */
export const LOWBIAS32_M1 = 0x7feb352d;
export const LOWBIAS32_M2 = 0x846ca68b;

/**
 * lowbias32 整数ハッシュ（32bit）。`Math.imul` + 符号なし化で 32bit 演算を厳密に行うため、
 * GLSL ES 3.00 の uint 演算による同一実装とビット同一の値を返す（GPU/CPU の粒一致の根拠）。
 */
export const lowbias32 = (x: number): number => {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, LOWBIAS32_M1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, LOWBIAS32_M2) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

/** 画素座標の 2D ハッシュ（lowbias32 の合成。GLSL 側と同式） */
export const hashPixel = (x: number, y: number): number =>
  lowbias32(((x >>> 0) + lowbias32(y >>> 0)) >>> 0);

/**
 * 画素座標から [-1, 1) の決定的ノイズを返す。
 * ハッシュの上位 24bit のみを float 化する（2^24 未満の整数は fp32 で正確に表現できるため、
 * GPU(fp32) / CPU(fp64) の値がビット一致する）。
 */
export const grainNoiseAt = (x: number, y: number): number =>
  ((hashPixel(x, y) >>> 8) / 16777216) * 2 - 1;
