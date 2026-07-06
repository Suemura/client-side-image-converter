/**
 * PNG 出力の品質ティア判定（純粋関数）
 *
 * Canvas API は PNG のロスレス出力しか持たないため、品質値に応じて出力戦略を切り替える。
 * この閾値ロジックをメインスレッド（`convertToPngWithQuality`）と Worker（OffscreenCanvas）で
 * 共有するために純粋関数として切り出す（分岐の乖離を防ぐ）。
 */

/**
 * PNG 出力戦略:
 * - `lossless`: 標準 PNG（無劣化）
 * - `compressed`: Canvas の PNG 出力に低めの品質ヒントを与える
 * - `jpeg-roundtrip`: 一度 JPEG で圧縮してから PNG へ再エンコードし積極的に圧縮する
 */
export type PngQualityStrategy = "lossless" | "compressed" | "jpeg-roundtrip";

/** PNG 出力の JPEG ラウンドトリップ時に用いる中間品質ヒント（0-1） */
export const PNG_COMPRESSED_QUALITY_HINT = 0.92;

/**
 * 品質値（0-100）から PNG 出力戦略を判定する。
 *
 * @param quality - UI の品質値（0-100 を想定。範囲外でも境界で丸められる）
 */
export const pngQualityStrategy = (quality: number): PngQualityStrategy => {
  if (quality >= 95) {
    return "lossless";
  }
  if (quality >= 70) {
    return "compressed";
  }
  return "jpeg-roundtrip";
};
