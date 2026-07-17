/**
 * ファイル処理関連のユーティリティ関数群
 */

import {
  HEIC_EXTENSIONS,
  SUPPORTED_IMAGE_FORMATS,
  TIFF_EXTENSIONS,
} from "./constants";

/**
 * URL管理のためのヘルパー関数群
 */
const urlMap = new Map<string, string>();

/**
 * ファイルからオブジェクトURLを作成し、管理する
 * @param file - ファイルオブジェクト
 * @param key - URL管理のためのキー
 * @returns オブジェクトURL
 */
export const createObjectURL = (file: File, key?: string): string => {
  const url = URL.createObjectURL(file);
  const mapKey = key || `${file.name}_${file.size}`;

  // 既存のURLがある場合は削除
  const existingUrl = urlMap.get(mapKey);
  if (existingUrl) {
    URL.revokeObjectURL(existingUrl);
  }

  urlMap.set(mapKey, url);
  return url;
};

/**
 * 指定されたキーのURLを削除する
 * @param key - 削除するURLのキー
 */
export const revokeObjectURL = (key: string): void => {
  const url = urlMap.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    urlMap.delete(key);
  }
};

/**
 * 全てのURLを削除する
 */
export const revokeAllObjectURLs = (): void => {
  for (const url of urlMap.values()) {
    URL.revokeObjectURL(url);
  }
  urlMap.clear();
};

/**
 * 圧縮率を計算する
 * @param originalSize - 元のサイズ
 * @param compressedSize - 圧縮後のサイズ
 * @returns 圧縮率（パーセンテージ）
 */
export const calculateCompressionRatio = (
  originalSize: number,
  compressedSize: number,
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
  total: number,
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
      existingFile.name === newFile.name && existingFile.size === newFile.size,
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
  newFiles: File[],
): File[] => {
  const uniqueNewFiles = newFiles.filter(
    (newFile) => !isDuplicateFile(existingFiles, newFile),
  );
  return [...existingFiles, ...uniqueNewFiles];
};

/** 上限付きマージの結果 */
export interface AddUniqueFilesWithLimitResult {
  /** 重複除外し上限件数までに切り詰めたファイル配列 */
  files: File[];
  /** 上限超過で一部を取り込めなかった場合は true */
  truncated: boolean;
}

/**
 * ファイル配列から重複を除外して追加し、合計件数を上限まで切り詰める
 * 上限を超えた場合は先頭から limit 件を残し、truncated=true を返す
 * （大量投入時のフリーズ/メモリ圧迫を防ぐためのハード上限。呼び出し側で警告表示に使う）
 * @param existingFiles - 既存のファイル配列
 * @param newFiles - 新しいファイル配列
 * @param limit - 合計件数の上限
 * @returns 切り詰めたファイル配列と、上限超過で切り捨てたかどうか
 */
export const addUniqueFilesWithLimit = (
  existingFiles: File[],
  newFiles: File[],
  limit: number,
): AddUniqueFilesWithLimitResult => {
  const merged = addUniqueFiles(existingFiles, newFiles);
  if (merged.length <= limit) {
    return { files: merged, truncated: false };
  }
  return { files: merged.slice(0, limit), truncated: true };
};

/**
 * 上限警告を「件数の減少（削除・クリア）」で消してよいか判定する
 * 「件数 < 上限」だけを条件にすると、フォルダ走査が上限で打ち切られた際に件数が
 * 上限未満でも出す警告を追加操作直後に消してしまうため、「件数が減少し、かつ上限未満」
 * を条件にする（追加操作では消さない）
 * @param prevLength - 直前のファイル件数
 * @param nextLength - 現在のファイル件数
 * @param limit - 件数の上限
 * @returns 警告を消すべきなら true
 */
export const shouldClearLimitWarningOnDecrease = (
  prevLength: number,
  nextLength: number,
  limit: number,
): boolean => nextLength < prevLength && nextLength < limit;

/**
 * ファイルタイプが画像かどうかを確認する
 * @param file - チェックするファイル
 * @returns 画像の場合はtrue
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith("image/");
};

/**
 * ファイルの MIME タイプが特定できないかどうかを確認する
 * HEIC などはブラウザによって MIME が空文字や application/octet-stream として報告されるため、
 * その場合は拡張子によるフォールバック判定・表示の対象とする
 * @param file - チェックするファイル
 * @returns MIME タイプが特定できない場合はtrue
 */
export const isUnknownMimeType = (file: File): boolean => {
  return file.type === "" || file.type === "application/octet-stream";
};

/**
 * MIME タイプだけでは判定・選択できない形式の拡張子フォールバック定義
 * （MIME が特定できないブラウザ・OS 向けに、判定と accept 属性の両方で使用する）
 */
const FORMAT_EXTENSION_FALLBACKS: ReadonlyArray<{
  mimeTypes: readonly string[];
  extensions: readonly string[];
}> = [
  {
    mimeTypes: SUPPORTED_IMAGE_FORMATS.HEIC_FORMATS,
    extensions: HEIC_EXTENSIONS,
  },
  {
    mimeTypes: SUPPORTED_IMAGE_FORMATS.TIFF_FORMATS,
    extensions: TIFF_EXTENSIONS,
  },
];

/**
 * MIME タイプ群または拡張子フォールバックでファイル形式を判定する
 * @param file - チェックするファイル
 * @param mimeTypes - 対象形式のMIMEタイプの配列
 * @param extensions - 対象形式の拡張子の配列（ドット付き・小文字）
 * @returns 対象形式の場合はtrue
 */
const matchesFormat = (
  file: File,
  mimeTypes: readonly string[],
  extensions: readonly string[],
): boolean => {
  if (mimeTypes.includes(file.type)) {
    return true;
  }
  if (isUnknownMimeType(file)) {
    const extension = getFileExtension(file.name).toLowerCase();
    return extensions.includes(extension);
  }
  return false;
};

/**
 * ファイルがHEIC/HEIF形式かどうかを確認する
 * HEIC は MIME タイプが空になるブラウザがあるため、
 * MIME が特定できない場合のみ拡張子でフォールバック判定する
 * @param file - チェックするファイル
 * @returns HEIC/HEIF の場合はtrue
 */
export const isHeicFile = (file: File): boolean => {
  return matchesFormat(
    file,
    SUPPORTED_IMAGE_FORMATS.HEIC_FORMATS,
    HEIC_EXTENSIONS,
  );
};

/**
 * ファイルがTIFF形式かどうかを確認する
 * TIFF も MIME タイプが特定されない環境があるため、
 * MIME が特定できない場合のみ拡張子でフォールバック判定する
 * @param file - チェックするファイル
 * @returns TIFF の場合はtrue
 */
export const isTiffFile = (file: File): boolean => {
  return matchesFormat(
    file,
    SUPPORTED_IMAGE_FORMATS.TIFF_FORMATS,
    TIFF_EXTENSIONS,
  );
};

/**
 * ファイルタイプが指定された形式に含まれているかを確認する
 * HEIC/HEIF や TIFF が許可されている場合は拡張子によるフォールバック判定も行う
 * @param file - チェックするファイル
 * @param acceptedTypes - 許可されたMIMEタイプの配列
 * @returns 許可されている場合はtrue
 */
export const isAcceptedFileType = (
  file: File,
  acceptedTypes: readonly string[],
): boolean => {
  if (acceptedTypes.includes(file.type)) {
    return true;
  }
  return FORMAT_EXTENSION_FALLBACKS.some(
    ({ mimeTypes, extensions }) =>
      mimeTypes.some((type) => acceptedTypes.includes(type)) &&
      matchesFormat(file, mimeTypes, extensions),
  );
};

/**
 * ファイルの実効 MIME タイプを解決する。
 * file.type が特定できない（空文字 / application/octet-stream）場合は、
 * 拡張子（FORMAT_EXTENSION_FALLBACKS）から実際の形式を推定して返す。
 * isAcceptedFileType の拡張子フォールバック判定と整合させることで、
 * 「拡張子フォールバックで受理はしたが、生の file.type を使う後続処理（送り先候補の
 * 算出など）とは食い違う」乖離を防ぐ。
 * @param file - 対象ファイル
 * @returns 実効 MIME タイプ（推定できない場合は file.type をそのまま返す）
 */
export const resolveEffectiveMimeType = (file: File): string => {
  if (!isUnknownMimeType(file)) {
    return file.type;
  }
  const extension = getFileExtension(file.name).toLowerCase();
  for (const { mimeTypes, extensions } of FORMAT_EXTENSION_FALLBACKS) {
    const index = extensions.indexOf(extension);
    if (index !== -1) {
      return mimeTypes[index] ?? mimeTypes[0];
    }
  }
  return file.type;
};

/**
 * ファイル配列をフィルタリングして有効なファイルのみを返す
 * @param files - フィルタリングするファイル配列
 * @param acceptedTypes - 許可されたMIMEタイプの配列
 * @returns フィルタリングされたファイル配列
 */
export const filterValidFiles = (
  files: File[],
  acceptedTypes: readonly string[],
): File[] => {
  return files.filter((file) => isAcceptedFileType(file, acceptedTypes));
};

/** クリップボードの 1 アイテムの最小構造型（DataTransferItem 互換） */
export interface ClipboardItemLike {
  readonly kind: string;
  getAsFile(): File | null;
}

/** paste イベントの clipboardData の最小構造型（DataTransfer 互換） */
export interface ClipboardDataLike {
  readonly files?: ArrayLike<File> | null;
  readonly items?: ArrayLike<ClipboardItemLike> | null;
}

/**
 * クリップボード（paste イベント）のデータからファイルを取り出す
 * .files を優先し、無ければ .items の kind === "file" を getAsFile() で取得する
 * （画像に限らず全ファイルを返す。MIME フィルタは呼び出し側で行う）
 * @param clipboardData - paste イベントの clipboardData
 * @returns 取り出したファイル配列
 */
export const getFilesFromClipboardData = (
  clipboardData: ClipboardDataLike | null,
): File[] => {
  if (!clipboardData) {
    return [];
  }
  if (clipboardData.files && clipboardData.files.length > 0) {
    return Array.from(clipboardData.files);
  }
  if (clipboardData.items) {
    const files: File[] = [];
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    return files;
  }
  return [];
};

/**
 * input[accept] 属性用の文字列を構築する
 * HEIC/HEIF や TIFF は MIME タイプだけではファイル選択できない環境があるため拡張子も併記する
 * @param acceptedTypes - 許可されたMIMEタイプの配列
 * @returns accept 属性に設定する文字列
 */
export const buildAcceptAttribute = (
  acceptedTypes: readonly string[],
): string => {
  const fallbackExtensions = FORMAT_EXTENSION_FALLBACKS.flatMap(
    ({ mimeTypes, extensions }) =>
      mimeTypes.some((type) => acceptedTypes.includes(type))
        ? [...extensions]
        : [],
  );
  return [...acceptedTypes, ...fallbackExtensions].join(",");
};

/** 対応フォーマット表示用の MIME タイプ表示名 */
const MIME_DISPLAY_NAMES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/bmp": "BMP",
  "image/tiff": "TIFF",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
};

/**
 * 許可された MIME タイプの配列から対応フォーマットの表示ラベルを生成する
 * @param acceptedTypes - 許可されたMIMEタイプの配列
 * @returns カンマ区切りの表示ラベル（例: "JPG, PNG, WebP"）
 */
export const formatAcceptedTypesLabel = (
  acceptedTypes: readonly string[],
): string => {
  return acceptedTypes
    .map(
      (type) =>
        MIME_DISPLAY_NAMES[type] ?? type.replace("image/", "").toUpperCase(),
    )
    .join(", ");
};

/**
 * ファイルタイプバッジの表示ラベルを生成する
 * MIME タイプが特定できない場合（HEIC 等）は isHeicFile と同じ基準で
 * 拡張子によるフォールバック表示を行う
 * @param file - 対象のファイル
 * @returns バッジに表示するラベル（例: "HEIC" / "PNG" / "FILE"）
 */
export const getFileTypeBadgeLabel = (file: File): string => {
  if (isUnknownMimeType(file)) {
    return getFileExtension(file.name).replace(".", "").toUpperCase() || "FILE";
  }
  return file.type.split("/")[1]?.toUpperCase() || "FILE";
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
  newExtension: string,
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
  const sizes =
    Array.isArray(files) && files.length > 0 && typeof files[0] === "number"
      ? (files as number[])
      : (files as File[]).map((file) => file.size);

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
