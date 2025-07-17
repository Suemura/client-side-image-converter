/**
 * ファイル処理関連のユーティリティ関数群
 */

/**
 * URL管理のためのヘルパークラス
 */
export class URLManager {
  private static urlMap = new Map<string, string>();

  /**
   * ファイルからオブジェクトURLを作成し、管理する
   * @param file - ファイルオブジェクト
   * @param key - URL管理のためのキー
   * @returns オブジェクトURL
   */
  static createObjectURL(file: File, key?: string): string {
    const url = URL.createObjectURL(file);
    const mapKey = key || `${file.name}_${file.size}`;
    
    // 既存のURLがある場合は削除
    if (this.urlMap.has(mapKey)) {
      URL.revokeObjectURL(this.urlMap.get(mapKey)!);
    }
    
    this.urlMap.set(mapKey, url);
    return url;
  }

  /**
   * 指定されたキーのURLを削除する
   * @param key - 削除するURLのキー
   */
  static revokeObjectURL(key: string): void {
    const url = this.urlMap.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.urlMap.delete(key);
    }
  }

  /**
   * 全てのURLを削除する
   */
  static revokeAllObjectURLs(): void {
    for (const url of this.urlMap.values()) {
      URL.revokeObjectURL(url);
    }
    this.urlMap.clear();
  }
}

/**
 * 圧縮率を計算する
 * @param originalSize - 元のサイズ
 * @param compressedSize - 圧縮後のサイズ
 * @returns 圧縮率（パーセンテージ）
 */
export const calculateCompressionRatio = (
  originalSize: number,
  compressedSize: number
): number => {
  if (originalSize === 0) return 0;
  return ((originalSize - compressedSize) / originalSize) * 100;
};

/**
 * 進捗率を計算する
 * @param current - 現在の値
 * @param total - 合計値
 * @returns 進捗率（パーセンテージ）
 */
export const calculateProgressPercentage = (
  current: number,
  total: number
): number => {
  if (total === 0) return 0;
  return (current / total) * 100;
};

/**
 * ファイルの重複を確認する
 * @param files - 既存のファイル配列
 * @param newFile - 新しいファイル
 * @returns 重複している場合はtrue
 */
export const isDuplicateFile = (files: File[], newFile: File): boolean => {
  return files.some(
    (existingFile) =>
      existingFile.name === newFile.name && existingFile.size === newFile.size
  );
};

/**
 * ファイル配列から重複を除外して新しいファイルを追加する
 * @param existingFiles - 既存のファイル配列
 * @param newFiles - 新しいファイル配列
 * @returns 重複を除外したファイル配列
 */
export const addUniqueFiles = (
  existingFiles: File[],
  newFiles: File[]
): File[] => {
  const uniqueNewFiles = newFiles.filter(
    (newFile) => !isDuplicateFile(existingFiles, newFile)
  );
  return [...existingFiles, ...uniqueNewFiles];
};

/**
 * ファイルタイプが画像かどうかを確認する
 * @param file - チェックするファイル
 * @returns 画像の場合はtrue
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith("image/");
};

/**
 * ファイルタイプが指定された形式に含まれているかを確認する
 * @param file - チェックするファイル
 * @param acceptedTypes - 許可されたMIMEタイプの配列
 * @returns 許可されている場合はtrue
 */
export const isAcceptedFileType = (
  file: File,
  acceptedTypes: string[]
): boolean => {
  return acceptedTypes.includes(file.type);
};

/**
 * ファイル配列をフィルタリングして有効なファイルのみを返す
 * @param files - フィルタリングするファイル配列
 * @param acceptedTypes - 許可されたMIMEタイプの配列
 * @returns フィルタリングされたファイル配列
 */
export const filterValidFiles = (
  files: File[],
  acceptedTypes: string[]
): File[] => {
  return files.filter((file) => isAcceptedFileType(file, acceptedTypes));
};

/**
 * ファイル配列の合計サイズを計算する
 * @param files - ファイル配列
 * @returns 合計サイズ（バイト）
 */
export const calculateTotalFileSize = (files: File[]): number => {
  return files.reduce((total, file) => total + file.size, 0);
};

/**
 * ファイル配列の平均サイズを計算する
 * @param files - ファイル配列
 * @returns 平均サイズ（バイト）
 */
export const calculateAverageFileSize = (files: File[]): number => {
  if (files.length === 0) return 0;
  return calculateTotalFileSize(files) / files.length;
};

/**
 * ファイル名から拡張子を取得する
 * @param fileName - ファイル名
 * @returns 拡張子（ドット付き）
 */
export const getFileExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : "";
};

/**
 * ファイル名から拡張子を除いた名前を取得する
 * @param fileName - ファイル名
 * @returns 拡張子を除いたファイル名
 */
export const getFileNameWithoutExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
};

/**
 * ファイル名と新しい拡張子から新しいファイル名を生成する
 * @param fileName - 元のファイル名
 * @param newExtension - 新しい拡張子（ドット付き）
 * @returns 新しいファイル名
 */
export const changeFileExtension = (
  fileName: string,
  newExtension: string
): string => {
  const nameWithoutExtension = getFileNameWithoutExtension(fileName);
  return `${nameWithoutExtension}${newExtension}`;
};

/**
 * ファイル名にサフィックスを追加する
 * @param fileName - 元のファイル名
 * @param suffix - 追加するサフィックス
 * @returns 新しいファイル名
 */
export const addFileNameSuffix = (fileName: string, suffix: string): string => {
  const nameWithoutExtension = getFileNameWithoutExtension(fileName);
  const extension = getFileExtension(fileName);
  return `${nameWithoutExtension}${suffix}${extension}`;
};

/**
 * 統計情報を計算する
 * @param files - ファイル配列またはサイズ配列
 * @returns 統計情報
 */
export const calculateFileStatistics = (files: File[] | number[]) => {
  const sizes = Array.isArray(files) && files.length > 0 && typeof files[0] === "number"
    ? files as number[]
    : (files as File[]).map(file => file.size);

  if (sizes.length === 0) {
    return {
      total: 0,
      average: 0,
      min: 0,
      max: 0,
      count: 0,
    };
  }

  const total = sizes.reduce((sum, size) => sum + size, 0);
  const average = total / sizes.length;
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);

  return {
    total,
    average,
    min,
    max,
    count: sizes.length,
  };
};