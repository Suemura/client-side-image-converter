/**
 * 自動補正（オートレベル / 自動ホワイトバランス / WB スポイト）の
 * Canvas / WebGL / DOM 非依存な純粋ロジック。
 *
 * 編集前の統計（`histogram.ts` の `HistogramData`、または WB スポイトのサンプリング点）だけを
 * 入力とし、既存の調整スライダー値（blacks / whites / temperature / tint、UI 単位 [-100, 100]）を
 * 逆算して返す。
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
 * 飽和は「達成不可なら無補正 0」ではなく意図的な選択である:
 * 厳密解 `-100·bp/weight(bp)` は重みの縮小に伴い単調に増大するため、±100 への飽和は
 * 低コントラスト画像で解が範囲を超えるときと同じ一般クランプの連続な極限にあたる。
 * 0 を返す方式は恣意的な重み閾値の前後で「最大補正 ⇔ 無補正」が不連続に跳ぶうえ、
 * マスク端に近い画素へのわずかな補正も捨ててしまう。飽和なら「その方向へ最大限
 * 試みた」ことがスライダーに可視化され、不要ならワンクリックでリセットできる。
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
 * WB スポイト: 「無彩色にしたい色」(r, g, b)（各 [0, 1] 正規化）が中性
 * （R = B・G = (R+B)/2）になる temperature / tint スライダー値を逆算する。
 *
 * パイプライン（`applyAdjustmentToPixel` 手順 6）のシフトは
 * `R += t·TEMPERATURE_SHIFT, B -= t·TEMPERATURE_SHIFT, G += tint·TINT_SHIFT` のため、
 * R と B の等化は `t = (b - r) / (2·TEMPERATURE_SHIFT)`、
 * G を RB 平均（温度補正で不変）へ揃えるのは `tint = ((r + b)/2 - g) / TINT_SHIFT`。
 *
 * WB の逆算式の単一の真実はこの関数に集約され、gray-world の `computeAutoWhiteBalance` は
 * チャンネル平均をこの関数へ渡す特殊形にあたる。
 *
 * 厳密性の注記: temperature / tint はパイプライン手順 6 で適用されるため、露光量等の
 * 他調整が非 0 のとき対象点は厳密には中性にならない（手順 1〜5 がチャンネル一様変換の
 * ため近似は良好）。他スライダー値に依存させると同じ点の再指定で値が変わり冪等性が
 * 壊れるため、編集前の色だけから逆算する方針を採る（自動補正と同一の設計判断）。
 */
export const computeWhiteBalanceForNeutralPoint = (rgb: {
  r: number;
  g: number;
  b: number;
}): AutoWhiteBalanceResult => {
  const temperature = toUiValue(
    (100 * (rgb.b - rgb.r)) / (2 * TEMPERATURE_SHIFT),
  );
  const tint = toUiValue((100 * ((rgb.r + rgb.b) / 2 - rgb.g)) / TINT_SHIFT);
  return { temperature, tint };
};

/**
 * 自動ホワイトバランス（gray-world）: 編集前のチャンネル平均が等しくなるような
 * temperature / tint スライダー値を逆算する
 * （= チャンネル平均色への `computeWhiteBalanceForNeutralPoint`）。
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
  return computeWhiteBalanceForNeutralPoint(means);
};

// --- WB スポイトのサンプリング / 座標変換ヘルパー ---

/** WB スポイトの近傍サンプリング半径（2 = 5×5 窓）。1 画素ではノイズに弱いため平均する */
export const WB_SAMPLE_RADIUS = 2;

/**
 * サンプリング窓（中心 (x, y) ± radius の正方形）を画像境界内へクランプした矩形を返す。
 * 画像端では窓が縮む（角では (radius+1)² まで）。中心が画像外・寸法が不正のときは null。
 * 呼び出し側はこの矩形だけを getImageData で読むことで、読み出しを最大 (2·radius+1)² 画素に抑える。
 */
export const clampSampleWindow = (
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null => {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const centerX = Math.floor(x);
  const centerY = Math.floor(y);
  if (centerX < 0 || centerY < 0 || centerX >= width || centerY >= height) {
    return null;
  }
  const left = Math.max(0, centerX - radius);
  const top = Math.max(0, centerY - radius);
  const right = Math.min(width - 1, centerX + radius);
  const bottom = Math.min(height - 1, centerY + radius);
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

/**
 * RGBA バイト列（ImageData.data 互換）の平均色を [0, 1] 正規化で返す。
 * alpha = 0 の完全透明ピクセルは除外する（`computeHistogram` と同基準）。
 * 有効ピクセルが無いときは null。
 */
export const averageRgb = (
  data: Uint8ClampedArray | Uint8Array,
): { r: number; g: number; b: number } | null => {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) {
      continue;
    }
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }
  if (count === 0) {
    return null;
  }
  return { r: r / count / 255, g: g / count / 255, b: b / count / 255 };
};

/**
 * プレビュー表示上のクリック位置（表示要素内オフセット px）をソース自然座標の画素位置へ写像する。
 * 結果は [0, 寸法-1] にクランプする（表示要素の右端・下端クリックを有効画素に丸める）。
 * 表示・ソースの寸法が 0 以下や非有限のときは null。
 */
export const displayPointToSourcePixel = (
  offsetX: number,
  offsetY: number,
  displayWidth: number,
  displayHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number } | null => {
  if (
    !Number.isFinite(offsetX) ||
    !Number.isFinite(offsetY) ||
    !Number.isFinite(displayWidth) ||
    !Number.isFinite(displayHeight) ||
    displayWidth <= 0 ||
    displayHeight <= 0 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return null;
  }
  const x = Math.min(
    sourceWidth - 1,
    Math.max(0, Math.floor((offsetX / displayWidth) * sourceWidth)),
  );
  const y = Math.min(
    sourceHeight - 1,
    Math.max(0, Math.floor((offsetY / displayHeight) * sourceHeight)),
  );
  return { x, y };
};
