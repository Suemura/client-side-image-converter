/**
 * 画像の色調・フィルタ調整に関する Canvas 非依存の純粋ロジック。
 *
 * crop ページ（state 保持）・CropToolbar（UI）・imageCropper（描画・出力）で共有する。
 * Canvas / DOM に依存しないため単体テストの対象とする
 * （cropGeometry.ts と同じ「純粋ロジックの切り出し」方針）。
 * 実際の適用は imageCropper の renderOrientedImage が `ctx.filter` へ set することで、
 * プレビューと出力の双方に同一結果を焼き込む（WYSIWYG）。
 */

/** 色調・フィルタ調整（スライダー 3 種 + ワンクリックフィルタ 2 種） */
export interface ImageAdjustments {
  /** 明るさ（1 = 100% が中立） */
  brightness: number;
  /** コントラスト（1 = 100% が中立） */
  contrast: number;
  /** 彩度（1 = 100% が中立） */
  saturate: number;
  /** グレースケール（true で 100% 適用） */
  grayscale: boolean;
  /** セピア（true で 100% 適用） */
  sepia: boolean;
}

/** 無調整（すべて中立）。リセットや未設定インデックスの既定値に使う */
export const IDENTITY_ADJUSTMENTS: ImageAdjustments = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  grayscale: false,
  sepia: false,
};

/** スライダーの範囲（0〜200%、1% 刻み）。UI と共有する */
export const ADJUSTMENT_RANGE = {
  min: 0,
  max: 2,
  step: 0.01,
} as const;

/** スライダー項目のキー（明るさ・コントラスト・彩度） */
export type AdjustmentSliderKey = "brightness" | "contrast" | "saturate";

/** ワンクリックフィルタのキー（グレースケール・セピア） */
export type AdjustmentFilterKey = "grayscale" | "sepia";

/**
 * 乗数を CSS filter 用の文字列へ整形する。
 * スライダー step（0.01）に合わせて小数 2 桁へ丸め、末尾の余分な 0 は付けない。
 */
const formatMultiplier = (value: number): string =>
  Number(value.toFixed(2)).toString();

/**
 * 調整値から Canvas の `ctx.filter` に設定する CSS filter 文字列を組み立てる。
 * 中立でないスライダーと true のフィルタのみを連結し、何も無ければ "none" を返す
 * （`ctx.filter` に常に有効な値を渡すため）。
 * 例: `"brightness(1.1) contrast(0.9) saturate(1.2) sepia(1)"`
 */
export const buildCanvasFilter = (adjustments: ImageAdjustments): string => {
  const parts: string[] = [];
  if (adjustments.brightness !== 1) {
    parts.push(`brightness(${formatMultiplier(adjustments.brightness)})`);
  }
  if (adjustments.contrast !== 1) {
    parts.push(`contrast(${formatMultiplier(adjustments.contrast)})`);
  }
  if (adjustments.saturate !== 1) {
    parts.push(`saturate(${formatMultiplier(adjustments.saturate)})`);
  }
  if (adjustments.grayscale) {
    parts.push("grayscale(1)");
  }
  if (adjustments.sepia) {
    parts.push("sepia(1)");
  }
  return parts.length > 0 ? parts.join(" ") : "none";
};

/** 調整が中立（無調整）かどうかを判定する */
export const isIdentityAdjustments = (adjustments: ImageAdjustments): boolean =>
  buildCanvasFilter(adjustments) === "none";
