/**
 * 変換結果 `ConversionResult` の組み立て（Canvas 非依存・メインスレッド用）
 *
 * メインスレッドの `convertImage` と Worker プール（`imageProcessingPool`）の両方から
 * 同一の結果オブジェクトを生成するために切り出す。`URL.createObjectURL` を使うため
 * メインスレッドでのみ呼び出す（Worker はエンコード済みバイト列だけを返す）。
 */

import type { ConversionFormat, ConversionResult } from "./conversionCore";

/**
 * 元ファイルとエンコード済み Blob から `ConversionResult` を組み立てる。
 *
 * @param originalFile - 変換元のファイル
 * @param blob - エンコード済みの出力 Blob
 * @param format - 出力フォーマット（拡張子に使う）
 * @param targetSizeAchieved - 目標ファイルサイズ探索を行った場合の達成可否
 */
export const buildConversionResult = (
  originalFile: File,
  blob: Blob,
  format: ConversionFormat,
  targetSizeAchieved?: boolean,
): ConversionResult => {
  const url = URL.createObjectURL(blob);
  const originalFilename = originalFile.name;
  const nameWithoutExt =
    originalFilename.substring(0, originalFilename.lastIndexOf(".")) ||
    originalFilename;
  const filename = `${nameWithoutExt}.${format}`;
  const resultFile = new File([blob], filename, { type: blob.type });

  return {
    blob,
    url,
    originalSize: originalFile.size,
    convertedSize: blob.size,
    filename,
    originalFilename,
    file: resultFile,
    targetSizeAchieved,
  };
};
