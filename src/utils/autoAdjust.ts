/**
 * 自動補正（オートレベル / 自動ホワイトバランス）の Canvas / WebGL / DOM 非依存な純粋ロジック。
 *
 * 編集前ヒストグラム（`histogram.ts` の `HistogramData`）だけを入力とし、既存の調整スライダー値
 * （blacks / whites / temperature / tint、UI 単位 [-100, 100]）を逆算して返す。
 * 新しい描画パイプライン段は追加せず「統計 → 既存スライダー値」の変換に徹することで、
 * 結果がスライダーに可視化されユーザーがそのまま手動微調整できる（Lightroom の Auto と同方針）。
 *
 * 逆算には `adjustments.ts` が輸出するパイプライン係数
 * （`blacksToneWeight` / `whitesToneWeight` / `TEMPERATURE_SHIFT` / `TINT_SHIFT`）を使い、
 * `applyAdjustmentToPixel` との整合を単一の真実として保つ。
 * 入力が編集前統計のため同じ画像で何度呼んでも同じ値を返す（冪等）。
 *
 * Canvas / DOM / WASM に依存しないため単体テストの対象とする
 * （histogram.ts / toneCurve.ts と同じ「純粋ロジックの切り出し」方針）。
 */

import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_MIN,
  blacksToneWeight,
  TEMPERATURE_SHIFT,
  TINT_SHIFT,
  whitesToneWeight,
} from "./adjustments";
import type { HistogramData } from "./histogram";

/**
 * オートレベルのクリップ率（片側 0.5%）。
 * ノイズや少数の外れ値画素を黒点・白点の推定から除外する（Photoshop の自動補正と同程度）。
 */
export const AUTO_LEVELS_CLIP_RATIO = 0.005;

/** 黒点と白点の最小距離（正規化 [0,1]）。これ未満（単一値画像等）は補正しない */
const MIN_LEVELS_RANGE = 1 / 255;

/** トーンマスク重みの下限。重みがほぼ 0 の領域では除算せずクランプで飽和させる */
const MIN_TONE_WEIGHT = 1e-6;

/** オートレベルの結果（blacks / whites スライダーへセットする UI 値） */
export interface AutoLevelsResult {
  blacks: number;
  whites: number;
}

/** 自動ホワイトバランスの結果（temperature / tint スライダーへセットする UI 値） */
export interface AutoWhiteBalanceResult {
  temperature: number;
  tint: number;
}

/** UI 値へ丸める（round + [-100, 100] クランプ） */
const toUiValue = (value: number): number =>
  Math.round(Math.min(ADJUSTMENT_MAX, Math.max(ADJUSTMENT_MIN, value)));

/**
 * ヒストグラムのビン列から、両端をクリップ率ずつ除外したパーセンタイル範囲を求める。
 * 戻り値は [0, 1] 正規化した黒点 low・白点 high（low = クリップ分を超えた最初のビン、
 * high = 上側から同様に求めた最後のビン）。総カウント 0 のときは null。
 */
export const histogramPercentileRange = (
  bins: Uint32Array,
  clipRatio: number,
): { low: number; high: number } | null => {
  let total = 0;
  for (const count of bins) {
    total += count;
  }
  if (total <= 0 || bins.length < 2) {
    return null;
  }
  const clipCount = total * clipRatio;

  let lowBin = 0;
  let cumulative = 0;
  for (let i = 0; i < bins.length; i += 1) {
    cumulative += bins[i];
    if (cumulative > clipCount) {
      lowBin = i;
      break;
    }
  }

  let highBin = bins.length - 1;
  cumulative = 0;
  for (let i = bins.length - 1; i >= 0; i -= 1) {
    cumulative += bins[i];
    if (cumulative > clipCount) {
      highBin = i;
      break;
    }
  }

  const lastIndex = bins.length - 1;
  return { low: lowBin / lastIndex, high: highBin / lastIndex };
};

/**
 * オートレベル: 編集前の輝度ヒストグラムから黒点・白点を推定し、
 * 黒点画素が 0・白点画素が 1 へ写るような blacks / whites スライダー値を逆算する。
 *
 * パイプライン（`applyAdjustmentToPixel` 手順 4）は輝度マスク付きの加算シフト
 * `toneAdd = n.blacks * blacksToneWeight(l) + n.whites * whitesToneWeight(l)` のため、
 * 黒点 bp では `bp + n.blacks * blacksToneWeight(bp) = 0`、
 * 白点 wp では `wp + n.whites * whitesToneWeight(wp) = 1` を解く
 * （bp ≤ 0.5 ≤ wp の通常ケースでは互いのマスク重みが 0 で独立に解ける）。
 * マスク重みがほぼ 0 の端（黒点が 0.5 以上にある極端に明るい画像等）は
 * 除算せず ±100 へ飽和させる。
 *
 * ヒストグラムが空のときは null、黒点と白点がほぼ同一（単一値画像）のときは
 * 無補正 `{ blacks: 0, whites: 0 }` を返す。
 */
export const computeAutoLevels = (
  histogram: HistogramData,
  clipRatio: number = AUTO_LEVELS_CLIP_RATIO,
): AutoLevelsResult | null => {
  const range = histogramPercentileRange(histogram.luminance, clipRatio);
  if (!range) {
    return null;
  }
  const { low: blackPoint, high: whitePoint } = range;
  if (whitePoint - blackPoint < MIN_LEVELS_RANGE) {
    return { blacks: 0, whites: 0 };
  }
  const blacks =
    blackPoint === 0
      ? 0
      : toUiValue(
          (-100 * blackPoint) /
            Math.max(blacksToneWeight(blackPoint), MIN_TONE_WEIGHT),
        );
  const whites =
    whitePoint === 1
      ? 0
      : toUiValue(
          (100 * (1 - whitePoint)) /
            Math.max(whitesToneWeight(whitePoint), MIN_TONE_WEIGHT),
        );
  return { blacks, whites };
};

/**
 * ヒストグラムの R / G / B ビンからチャンネル平均（[0, 1] 正規化）を求める。
 * カウント対象ピクセルが 0 のときは null。
 */
export const channelMeansFromHistogram = (
  histogram: HistogramData,
): { r: number; g: number; b: number } | null => {
  if (histogram.pixelCount <= 0) {
    return null;
  }
  const mean = (bins: Uint32Array): number => {
    let sum = 0;
    for (let i = 0; i < bins.length; i += 1) {
      sum += i * bins[i];
    }
    return sum / histogram.pixelCount / (bins.length - 1);
  };
  return {
    r: mean(histogram.r),
    g: mean(histogram.g),
    b: mean(histogram.b),
  };
};

/**
 * 自動ホワイトバランス（gray-world）: 編集前のチャンネル平均が等しくなるような
 * temperature / tint スライダー値を逆算する。
 *
 * パイプライン（`applyAdjustmentToPixel` 手順 6）のシフトは
 * `R += t·TEMPERATURE_SHIFT, B -= t·TEMPERATURE_SHIFT, G += tint·TINT_SHIFT` のため、
 * R と B の平均の等化は `t = (avgB - avgR) / (2·TEMPERATURE_SHIFT)`、
 * G を RB 平均（温度補正で不変）へ揃えるのは `tint = ((avgR + avgB)/2 - avgG) / TINT_SHIFT`。
 *
 * gray-world は支配色のある被写体（森・夕焼け等）で過補正し得る古典的限界があるが、
 * 結果はスライダーに可視化されるためユーザーが即座に戻せる（補正の出発点の提供）。
 * ヒストグラムが空のときは null。
 */
export const computeAutoWhiteBalance = (
  histogram: HistogramData,
): AutoWhiteBalanceResult | null => {
  const means = channelMeansFromHistogram(histogram);
  if (!means) {
    return null;
  }
  const temperature = toUiValue(
    (100 * (means.b - means.r)) / (2 * TEMPERATURE_SHIFT),
  );
  const tint = toUiValue(
    (100 * ((means.r + means.b) / 2 - means.g)) / TINT_SHIFT,
  );
  return { temperature, tint };
};
