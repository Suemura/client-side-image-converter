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
 * ディレクトリリーダーから 1 バッチ分のエントリを取得する（readEntries を Promise 化）。
 * readEntries は 1 回あたり一定件数しか返さず、空配列が返ると終端を示す。
 * 全バッチを一括バッファせず呼び出し側でストリーミング処理する（残余バジェットが
 * 尽きたら以降のバッチを読まない）ために、ここでは 1 回分だけ読む。
 */
const readEntryBatch = (reader: DirectoryReaderLike): Promise<EntryLike[]> => {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
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

/** collectFilesFromEntries のオプション */
export interface CollectFilesOptions {
  /**
   * 収集件数の上限（accept を通過したファイル基準。未指定なら無制限）。
   * これに達するとディレクトリの残りバッチを読まずに走査を打ち切る。
   */
  maxFiles?: number;
  /**
   * 収集対象を絞り込む述語。false を返したファイルはバジェットに数えず収集もしない。
   * 未指定なら全ファイルを収集する（後方互換）。
   */
  accept?: (file: File) => boolean;
}

/** collectFilesFromEntries の結果 */
export interface CollectFilesResult {
  /** 収集した File 配列（accept を通過したもののみ） */
  files: File[];
  /**
   * maxFiles に達して走査を打ち切った場合は true（＝収集しきれなかったファイルが
   * 残っている可能性がある）。maxFiles 未指定時は常に false。
   */
  reachedLimit: boolean;
}

/**
 * エントリ配列を再帰的にたどり、配下の File を収集する。
 * ディレクトリはサブフォルダを含めて再帰走査する。
 *
 * ## 有界化（メモリ安全）
 * ディレクトリの列挙は「全エントリを一括バッファしてから処理」ではなく、
 * readEntries の 1 バッチごとに処理するストリーミング方式で行う。`maxFiles` に
 * 達したら以降のバッチを読まないため、1 フォルダに数万件がフラットに入っていても
 * メモリに載る FileSystemEntry ハンドルは「ブラウザのバッチサイズ × 再帰の深さ」に
 * 有界化される。巨大ツリー誤投入時のフリーズ／メモリ圧迫を防ぐためのハード上限で、
 * 呼び出し側の件数上限＋警告と対で使う。
 *
 * ## 打ち切りの基準（accept）
 * `accept` を指定すると、通過したファイルだけをバジェットに数え・収集する。
 * 非対象ファイル（サイドカーの .xmp/.json 等）はバジェットを消費しないため、
 * 「有効画像がバジェット未満なのにサイドカーで先に上限に達して深部の画像を
 * 取りこぼす」という生ファイル数基準の打ち切りの弱点を解消する。空サブフォルダも
 * 0 件としてバジェットを消費しないため、「先頭に空サブフォルダが多数並び後方に
 * だけ画像がある」構造でも取りこぼさない（エントリ数ではなくファイル数で打ち切る）。
 *
 * ## 取りこぼしの通知（reachedLimit）
 * 収集件数が `maxFiles` に達したら `reachedLimit=true` を返す。呼び出し側は
 * 上限 +1 を渡してこのフラグと重複除外後の超過判定を OR で警告に連動させることで、
 * 「重複が多く最終件数は上限以下だが収集自体は打ち切った」ケースも取りこぼしとして
 * 通知できる（保守的に過大近似する：残りが空フォルダ・非対象ファイルだけでも true）。
 *
 * @param entries - 走査対象のエントリ配列
 * @param options - maxFiles（上限）と accept（絞り込み述語）
 * @returns 収集した File 配列（MIME フィルタは呼び出し側で行う）と reachedLimit
 */
export const collectFilesFromEntries = async (
  entries: EntryLike[],
  options: CollectFilesOptions = {},
): Promise<CollectFilesResult> => {
  const { maxFiles = Number.POSITIVE_INFINITY, accept } = options;
  const files: File[] = [];
  const isFull = (): boolean => files.length >= maxFiles;

  // エントリ配列を走査し、accept を通過した File だけを収集する。
  // ディレクトリは 1 バッチずつストリーミング列挙し、上限に達したら以降のバッチを
  // 読まない。個別のファイル/ディレクトリ読み取り失敗はスキップし兄弟の走査は続ける。
  const walkEntries = async (list: EntryLike[]): Promise<void> => {
    for (const entry of list) {
      if (isFull()) {
        break;
      }
      try {
        if (isFileEntry(entry)) {
          const file = await readFileFromEntry(entry);
          if (!accept || accept(file)) {
            files.push(file);
          }
        } else if (isDirectoryEntry(entry)) {
          const reader = entry.createReader();
          while (!isFull()) {
            const batch = await readEntryBatch(reader);
            if (batch.length === 0) {
              break;
            }
            await walkEntries(batch);
          }
        }
      } catch {
        // 個別のファイル/ディレクトリの読み取りに失敗しても、ドロップ全体を
        // 失敗させず読めたファイルだけを取り込む（一部の破損・権限エラー対策）
      }
    }
  };

  await walkEntries(entries);
  return { files, reachedLimit: isFull() };
};
