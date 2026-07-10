/**
 * ヒストグラム表示（RGB / 輝度）のコア型と Canvas / DOM 非依存の純粋ロジック。
 *
 * 編集ページのヒストグラムは調整・LUT 適用後のプレビュー（転写済み 2D キャンバス）から
 * 縮小サンプリングした RGBA バイト列を入力とし、本モジュールでビン計算と SVG パス生成を行う。
 * 輝度は `adjustments.ts` の `LUMA_WEIGHTS`（Rec.709）を再利用し、調整パイプラインの
 * トーンマスクと同一の輝度定義を保つ（単一の真実の維持）。
 *
 * Canvas / DOM / WASM に依存しないため単体テストの対象とする
 * （cropGeometry.ts / lutParser.ts と同じ「純粋ロジックの切り出し」方針）。
 */

import { LUMA_WEIGHTS } from "./adjustments";

/** ヒストグラムのビン数（8bit チャンネルの階調数） */
export const HISTOGRAM_BINS = 256;

/**
 * サンプリングの上限ピクセル数（256×256 相当）。
 * プレビューからの読み戻し（getImageData）とビン計算のコストをこの面積に有界化する。
 */
export const HISTOGRAM_MAX_SAMPLE_PIXELS = 65536;

/** 256 ビンの R / G / B / 輝度ヒストグラム */
export interface HistogramData {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luminance: Uint32Array;
  /** カウント対象になったピクセル数（alpha = 0 は除外） */
  pixelCount: number;
}

/**
 * RGBA バイト列（ImageData.data 互換）から 256 ビンのヒストグラムを算出する。
 *
 * alpha = 0 の完全透明ピクセルはカウントしない（透過部が bin 0 のスパイクとして
 * 現れるのを防ぐ。Photoshop 等の写真アプリと同挙動）。
 * 末尾の不完全なピクセル（4 バイト未満の端数）は無視する。
 */
export const computeHistogram = (
  data: Uint8ClampedArray | Uint8Array,
): HistogramData => {
  const r = new Uint32Array(HISTOGRAM_BINS);
  const g = new Uint32Array(HISTOGRAM_BINS);
  const b = new Uint32Array(HISTOGRAM_BINS);
  const luminance = new Uint32Array(HISTOGRAM_BINS);
  let pixelCount = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) {
      continue;
    }
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];
    r[pr] += 1;
    g[pg] += 1;
    b[pb] += 1;
    // Rec.709 の重み合計は 1.0 のため理論上 [0, 255] に収まるが、
    // 浮動小数の丸めで 255 を僅かに超えた場合に備えてクランプする
    const lumaBin = Math.min(
      HISTOGRAM_BINS - 1,
      Math.round(
        pr * LUMA_WEIGHTS[0] + pg * LUMA_WEIGHTS[1] + pb * LUMA_WEIGHTS[2],
      ),
    );
    luminance[lumaBin] += 1;
    pixelCount += 1;
  }

  return { r, g, b, luminance, pixelCount };
};

/**
 * サンプリング用キャンバスの寸法を解決する。
 * アスペクト比を維持したまま総ピクセル数が maxPixels 以下になるよう縮小する
 * （拡大はしない。各辺は最小 1）。縦横比が極端な画像では floor と最小 1 の
 * 組み合わせにより上限を多少超えることがあるが、性能上の目安として許容する。
 * 不正な寸法（非有限・0 以下）は { width: 0, height: 0 } を返し、呼び出し側でスキップする。
 */
export const resolveHistogramSampleSize = (
  width: number,
  height: number,
  maxPixels: number = HISTOGRAM_MAX_SAMPLE_PIXELS,
): { width: number; height: number } => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const total = width * height;
  if (total <= maxPixels) {
    return { width, height };
  }
  const scale = Math.sqrt(maxPixels / total);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
};

/** 複数チャンネルの共通スケール（最大カウント）を求める。RGB 重畳表示で共用する */
export const histogramMaxCount = (...bins: Uint32Array[]): number => {
  let max = 0;
  for (const channel of bins) {
    for (const count of channel) {
      if (count > max) {
        max = count;
      }
    }
  }
  return max;
};

/** SVG パス座標の桁数を抑える（文字列サイズと描画コストの削減。小数 2 桁） */
const formatCoord = (value: number): number => Math.round(value * 100) / 100;

/**
 * ヒストグラムのビン列を、下辺で閉じた SVG パス文字列（fill 用ポリゴン）へ変換する。
 * y はカウント 0 が height（下辺）、maxCount が 0（上辺）になる線形スケール。
 * maxCount が 0 以下（全ビン 0）のときは下辺のみのパスを返す（ゼロ除算ガード）。
 *
 * 出力形式は `M0 {h} L{x} {y} ... L{w} {h} Z`（スペース区切り）で固定し、
 * E2E テストが `d` 属性のパースで非ゼロビンの位置を検証できるようにする。
 */
export const buildHistogramPath = (
  bins: Uint32Array,
  options: { width: number; height: number; maxCount: number },
): string => {
  const { width, height, maxCount } = options;
  if (maxCount <= 0 || bins.length === 0) {
    return `M0 ${height} L${width} ${height} Z`;
  }
  const lastIndex = bins.length - 1;
  const points: string[] = [];
  for (let i = 0; i < bins.length; i += 1) {
    const x = formatCoord(lastIndex === 0 ? 0 : (i / lastIndex) * width);
    const y = formatCoord(height - (bins[i] / maxCount) * height);
    points.push(`L${x} ${y}`);
  }
  return `M0 ${height} ${points.join(" ")} L${width} ${height} Z`;
};
