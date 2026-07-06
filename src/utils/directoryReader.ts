/**
 * フォルダドロップ時のディレクトリ再帰走査ユーティリティ
 *
 * ドロップされた DataTransferItem の webkitGetAsEntry() で得られる
 * FileSystemEntry を再帰的にたどり、配下の File をまとめて収集する。
 * happy-dom には FileSystem Entry API が存在しないため、単体テストで
 * モックできるよう最小構造型（*Like）を定義し、それに対して処理する。
 */

/** FileSystemEntry の最小構造型（ファイル・ディレクトリ共通） */
export interface EntryLike {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
}

/** FileSystemFileEntry の最小構造型 */
export interface FileEntryLike extends EntryLike {
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: unknown) => void,
  ): void;
}

/** FileSystemDirectoryEntry の最小構造型 */
export interface DirectoryEntryLike extends EntryLike {
  createReader(): DirectoryReaderLike;
}

/** FileSystemDirectoryReader の最小構造型 */
export interface DirectoryReaderLike {
  readEntries(
    successCallback: (entries: EntryLike[]) => void,
    errorCallback?: (error: unknown) => void,
  ): void;
}

/** DataTransferItem の最小構造型（webkitGetAsEntry のみ利用） */
export interface DataTransferItemLike {
  webkitGetAsEntry?: () => EntryLike | null;
}

const isFileEntry = (entry: EntryLike): entry is FileEntryLike => entry.isFile;

const isDirectoryEntry = (entry: EntryLike): entry is DirectoryEntryLike =>
  entry.isDirectory;

/**
 * ディレクトリの全エントリを取得する。
 * readEntries は 1 回あたり一定件数しか返さないため、空配列が返るまで繰り返す。
 */
const readAllDirectoryEntries = (
  reader: DirectoryReaderLike,
): Promise<EntryLike[]> => {
  return new Promise((resolve, reject) => {
    const collected: EntryLike[] = [];
    const readBatch = (): void => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(collected);
          return;
        }
        collected.push(...entries);
        readBatch();
      }, reject);
    };
    readBatch();
  });
};

/** ファイルエントリから File を取り出す */
const readFileFromEntry = (entry: FileEntryLike): Promise<File> => {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
};

/**
 * DataTransferItem の配列から webkitGetAsEntry() でエントリを同期取得する。
 * drop イベント中のみ items が有効なため、await をまたぐ前に同期で呼ぶ必要がある。
 * @param items - DataTransferItem 配列
 * @returns 取得できたエントリの配列（null は除外）
 */
export const getEntriesFromDataTransferItems = (
  items: DataTransferItemLike[],
): EntryLike[] => {
  const entries: EntryLike[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
};

/**
 * エントリ配列を再帰的にたどり、配下の全 File を収集する。
 * ディレクトリはサブフォルダを含めて再帰走査する。
 *
 * `maxFiles` を指定すると、収集件数がそれに達した時点で走査を打ち切る。
 * 巨大なディレクトリツリーを誤投入したときに File 参照が無制限に積み上がって
 * メモリ圧迫するのを防ぐためのハード上限（呼び出し側の件数上限＋警告と対で使う）。
 * 打ち切りは MIME フィルタ前かつ重複除外前の生ファイル数で行うため、画像が疎で深い
 * ツリーや既存ファイルとの重複が多いツリーでは、非画像・重複ファイルで先に上限に達し
 * 深部の非重複画像を取りこぼし得る（このとき呼び出し側では重複除外後の件数が上限を
 * 超えず警告が出ないこともある）が、いずれもメモリ安全のための意図的挙動。
 * 未指定時は従来どおり全件収集する。
 * @param entries - 走査対象のエントリ配列
 * @param maxFiles - 収集件数の上限（未指定なら無制限）
 * @returns 収集した File 配列（MIME フィルタは呼び出し側で行う）
 */
export const collectFilesFromEntries = async (
  entries: EntryLike[],
  maxFiles: number = Number.POSITIVE_INFINITY,
): Promise<File[]> => {
  const files: File[] = [];
  for (const entry of entries) {
    if (files.length >= maxFiles) {
      break;
    }
    try {
      if (isFileEntry(entry)) {
        files.push(await readFileFromEntry(entry));
      } else if (isDirectoryEntry(entry)) {
        const childEntries = await readAllDirectoryEntries(
          entry.createReader(),
        );
        // サブフォルダには残余バジェットだけを渡し、全体で maxFiles を超えないようにする
        files.push(
          ...(await collectFilesFromEntries(
            childEntries,
            maxFiles - files.length,
          )),
        );
      }
    } catch {
      // 個別のファイル/ディレクトリの読み取りに失敗しても、ドロップ全体を
      // 失敗させず読めたファイルだけを取り込む（一部の破損・権限エラー対策）
    }
  }
  return files;
};
