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

/**
 * 最適化（フォーマット維持）結果の `ConversionResult` を組み立てる（Issue #61）。
 *
 * `buildConversionResult` と異なり出力の拡張子は変わらない（同一フォーマット）ため、
 * ファイル名は元ファイル名をそのまま維持する。`blob` は最適化版または元バイト列のいずれか
 * （no-worse-than-original 判定済み）で、`convertedSize` が `originalSize` と等しい場合は
 * 最適化で削減できず元を採用したことを意味する。
 */
export const buildOptimizeResult = (
  originalFile: File,
  blob: Blob,
): ConversionResult => {
  const url = URL.createObjectURL(blob);
  const filename = originalFile.name;
  const resultFile = new File([blob], filename, { type: blob.type });

  return {
    blob,
    url,
    originalSize: originalFile.size,
    convertedSize: blob.size,
    filename,
    originalFilename: originalFile.name,
    file: resultFile,
  };
};

/**
 * 画像編集（`/edit`）結果の `ConversionResult` を組み立てる（Issue #66）。
 *
 * 編集済みであることが分かるよう元ファイル名の拡張子直前に `_edited` サフィックスを付け
 * （crop の `_cropped` と同方針）、出力フォーマットに応じた拡張子を付与する
 * （元形式維持なら入力と同じ形式、形式選択時はその形式）。`originalFilename` は元ファイル名を
 * 保持するため、`ConversionResults` の変換前後比較（`originalFiles` との突き合わせ）が機能する。
 */
export const buildEditResult = (
  originalFile: File,
  blob: Blob,
  format: ConversionFormat,
  dimensions?: { width: number; height: number },
): ConversionResult => {
  const url = URL.createObjectURL(blob);
  const originalFilename = originalFile.name;
  const nameWithoutExt =
    originalFilename.substring(0, originalFilename.lastIndexOf(".")) ||
    originalFilename;
  const filename = `${nameWithoutExt}_edited.${format}`;
  const resultFile = new File([blob], filename, { type: blob.type });

  return {
    blob,
    url,
    originalSize: originalFile.size,
    convertedSize: blob.size,
    filename,
    originalFilename,
    file: resultFile,
    // 出力寸法（/studio のリネーム規則 {width} / {height} 用）
    width: dimensions?.width,
    height: dimensions?.height,
  };
};
