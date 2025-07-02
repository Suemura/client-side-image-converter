/**
 * ファイル名を指定された長さに省略する関数
 * 12文字以上の場合、中間部分を「...」で省略して「start...end」形式にする
 * @param fileName - 省略するファイル名
 * @param maxLength - 最大長（デフォルト: 12）
 * @returns 省略されたファイル名
 */
export const truncateFileName = (fileName: string, maxLength: number = 12): string => {
  if (fileName.length <= maxLength) {
    return fileName;
  }

  // ファイル名と拡張子を分離
  const lastDotIndex = fileName.lastIndexOf('.');
  const name = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';

  // 拡張子の長さを考慮して、名前部分の長さを調整
  const availableLength = maxLength - extension.length - 3; // 3は"..."の長さ

  if (availableLength <= 0) {
    // 拡張子が長すぎる場合は、末尾省略に切り替え
    return fileName.length > maxLength ? `${fileName.substring(0, maxLength - 3)}...` : fileName;
  }

  // 前半と後半の長さを計算
  const startLength = Math.ceil(availableLength / 2);
  const endLength = Math.floor(availableLength / 2);

  const start = name.substring(0, startLength);
  const end = name.substring(name.length - endLength);

  return `${start}...${end}${extension}`;
};

/**
 * ファイルサイズを人間が読める形式にフォーマットする関数
 * @param bytes - バイト数
 * @returns フォーマットされたファイルサイズ文字列
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};
