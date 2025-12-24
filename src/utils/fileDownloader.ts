import JSZip from "jszip";
import type { ConversionResult } from "./imageConverter";
import type { CropResult } from "./imageCropper";

export type DownloadableResult = ConversionResult | CropResult;

/**
 * 結果の種類に応じてZipファイル名を生成
 */
const generateZipFilename = (results: DownloadableResult[]): string => {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/:/g, "-");

  // 最初の結果の種類を確認
  const isCropResult = results.some((result) => "croppedBlob" in result);
  const prefix = isCropResult ? "cropped_images" : "converted_images";

  return `${prefix}_${timestamp}.zip`;
};

/**
 * 単一ファイルをダウンロード
 */
export const downloadSingle = (result: DownloadableResult): void => {
  let blob: Blob;
  let filename: string;

  if ("blob" in result) {
    // ConversionResult
    blob = result.blob;
    filename = result.filename;
  } else if ("croppedBlob" in result && result.success) {
    // CropResult
    blob = result.croppedBlob;
    filename = result.fileName;
  } else {
    console.error("無効な結果です");
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 複数ファイルをZIPファイルとしてダウンロード
 */
export const downloadAsZip = async (
  results: DownloadableResult[],
  zipFilename?: string,
): Promise<void> => {
  if (results.length === 0) return;

  try {
    const zip = new JSZip();
    const fileNameCounts = new Map<string, number>();

    for (const result of results) {
      let blob: Blob;
      let filename: string;

      if ("blob" in result) {
        // ConversionResult
        blob = result.blob;
        filename = result.filename;
      } else if ("croppedBlob" in result && result.success) {
        // CropResult
        blob = result.croppedBlob;
        filename = result.fileName;
      } else {
        // エラー結果はスキップ
        continue;
      }

      // 重複ファイル名の処理
      if (fileNameCounts.has(filename)) {
        const count = (fileNameCounts.get(filename) || 0) + 1;
        fileNameCounts.set(filename, count);

        const nameWithoutExt =
          filename.substring(0, filename.lastIndexOf(".")) || filename;
        const extension = filename.substring(filename.lastIndexOf(".")) || "";
        filename = `${nameWithoutExt}_${count}${extension}`;
      } else {
        fileNameCounts.set(filename, 1);
      }

      // Blobをzipに追加
      zip.file(filename, blob);
    }

    // Zipファイルを生成
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // デフォルトのZipファイル名を生成
    const defaultZipFilename = zipFilename || generateZipFilename(results);

    // Zipファイルをダウンロード
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = defaultZipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // URLを解放
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
    }, 1000);
  } catch (error) {
    console.error("Zipファイルの作成に失敗しました:", error);
    throw new Error("Zipファイルの作成に失敗しました");
  }
};

/**
 * 複数ファイルのダウンロード（自動でZIP化または単一ダウンロードを判定）
 */
export const downloadMultiple = async (
  results: DownloadableResult[],
): Promise<void> => {
  if (results.length === 0) return;

  // 成功した結果のみをフィルタリング
  const successResults = results.filter((result) => {
    if ("blob" in result) {
      return true; // ConversionResultは常に成功とみなす
    }
    return result.success; // CropResultはsuccessプロパティをチェック
  });

  if (successResults.length === 0) return;

  if (successResults.length === 1) {
    // 1ファイルの場合は直接ダウンロード
    downloadSingle(successResults[0]);
  } else {
    // 複数ファイルの場合はZIPファイルを作成
    await downloadAsZip(successResults);
  }
};

/**
 * 単純なファイルダウンロード（File オブジェクト用）
 */
export const downloadFile = (file: File, filename?: string): void => {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * 複数のFileオブジェクトをダウンロード
 */
export const downloadMultipleFiles = async (
  files: File[],
  zipFilename?: string,
): Promise<void> => {
  if (files.length === 0) return;

  if (files.length === 1) {
    // 1ファイルの場合は直接ダウンロード
    downloadFile(files[0]);
  } else {
    // 複数ファイルの場合はZIPファイルを作成
    const zip = new JSZip();
    const fileNameCounts = new Map<string, number>();

    for (const file of files) {
      let filename = file.name;

      // 重複ファイル名の処理
      if (fileNameCounts.has(filename)) {
        const count = (fileNameCounts.get(filename) || 0) + 1;
        fileNameCounts.set(filename, count);

        const nameWithoutExt =
          filename.substring(0, filename.lastIndexOf(".")) || filename;
        const extension = filename.substring(filename.lastIndexOf(".")) || "";
        filename = `${nameWithoutExt}_${count}${extension}`;
      } else {
        fileNameCounts.set(filename, 1);
      }

      // ファイルをzipに追加
      zip.file(filename, file);
    }

    // Zipファイルを生成
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // デフォルトのZipファイル名を生成
    const defaultZipFilename =
      zipFilename ||
      `files_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.zip`;

    // Zipファイルをダウンロード
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipBlob);
    link.download = defaultZipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // URLを解放
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
    }, 1000);
  }
};
