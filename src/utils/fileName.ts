/**
 * ファイル名を指定された長さに省略する関数
 * 12文字以上の場合、中間部分を「...」で省略して「start...end」形式にする
 * @param fileName - 省略するファイル名
 * @param maxLength - 最大長（デフォルト: 12）
 * @returns 省略されたファイル名
 */
export const truncateFileName = (fileName: string, maxLength = 12): string => {
  if (fileName.length <= maxLength) {
    return fileName;
  }

  // ファイル名と拡張子を分離
  const lastDotIndex = fileName.lastIndexOf(".");
  const name =
    lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : "";

  // 拡張子の長さを考慮して、名前部分の長さを調整
  const availableLength = maxLength - extension.length - 3; // 3は"..."の長さ

  if (availableLength <= 0) {
    // 拡張子が長すぎる場合は、末尾省略に切り替え
    return fileName.length > maxLength
      ? `${fileName.substring(0, maxLength - 3)}...`
      : fileName;
  }

  // 前半と後半の長さを計算
  const startLength = Math.ceil(availableLength / 2);
  const endLength = Math.floor(availableLength / 2);

  const start = name.substring(0, startLength);
  const end = name.substring(name.length - endLength);

  return `${start}...${end}${extension}`;
};

/**
 * 同名ファイル名を一意化する関数を生成する。
 * ZIP ダウンロード（downloadAsZip / downloadMultipleFiles）とハンドオフ（handoff.ts）で
 * 同じ連番規則を共有するための単一の真実。
 * - 初出のファイル名はそのまま採用する
 * - 2 件目以降は拡張子の前に `_2`, `_3`, ... を付ける
 * - 連番を付けた結果が既出の実ファイル名と衝突する場合（例: photo.png / photo_2.png を
 *   両方 JPEG 変換すると photo.jpeg の連番候補 photo_2.jpeg が実在名と重なる）は、
 *   一意になるまで連番をインクリメントする
 * @returns ファイル名を受け取り一意化済みのファイル名を返す関数（呼び出しごとに採番状態を共有）
 */
export const createFileNameUniquifier = (): ((name: string) => string) => {
  // 元のファイル名 → 次に試す連番（同名 n 件目の探索を毎回 2 から始めない）
  const nameCounts = new Map<string, number>();
  // 採番済みの実ファイル名（連番候補との衝突チェック用）
  const usedNames = new Set<string>();

  return (name: string): string => {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    const lastDotIndex = name.lastIndexOf(".");
    const base = lastDotIndex > 0 ? name.substring(0, lastDotIndex) : name;
    const extension = lastDotIndex > 0 ? name.substring(lastDotIndex) : "";

    let count = (nameCounts.get(name) ?? 1) + 1;
    let candidate = `${base}_${count}${extension}`;
    // 連番候補が既出の実ファイル名と衝突する間は一意になるまで進める
    while (usedNames.has(candidate)) {
      count += 1;
      candidate = `${base}_${count}${extension}`;
    }

    nameCounts.set(name, count);
    usedNames.add(candidate);
    return candidate;
  };
};

/**
 * ファイル名の拡張子の直前へサフィックスを挿入する。
 * 拡張子がない場合は末尾へ付与する（例: "photo.png" + "_redacted" → "photo_redacted.png"）。
 * @param fileName - 元のファイル名
 * @param suffix - 挿入するサフィックス（例: "_redacted"）
 * @returns サフィックス付きのファイル名
 */
export const appendFileNameSuffix = (
  fileName: string,
  suffix: string,
): string => {
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    // 拡張子なし・ドットで始まる名前（隠しファイル等）は末尾へ付与する
    return `${fileName}${suffix}`;
  }
  const base = fileName.substring(0, lastDotIndex);
  const extension = fileName.substring(lastDotIndex);
  return `${base}${suffix}${extension}`;
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
