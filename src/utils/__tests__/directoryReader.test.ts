import { describe, expect, it } from "vitest";
import {
  collectFilesFromEntries,
  type DataTransferItemLike,
  type DirectoryEntryLike,
  type EntryLike,
  type FileEntryLike,
  getEntriesFromDataTransferItems,
} from "../directoryReader";

/** テスト用の File オブジェクトを生成する */
const createFile = (name: string, type = "image/png"): File => {
  return new File([new Uint8Array(1)], name, { type });
};

/** ファイルエントリのモックを生成する */
const fileEntry = (file: File): FileEntryLike => ({
  isFile: true,
  isDirectory: false,
  file: (success) => success(file),
});

/**
 * ディレクトリエントリのモックを生成する。
 * readEntries は実ブラウザ同様、1 バッチずつ返し空配列で終端する挙動を再現する。
 * readCount には readEntries の呼び出し回数を記録する（ストリーミング打ち切りの検証用）。
 */
const directoryEntry = (
  children: EntryLike[],
  batchSize = children.length,
): DirectoryEntryLike & { readCount: number } => {
  const state = { readCount: 0 };
  return {
    isFile: false,
    isDirectory: true,
    get readCount() {
      return state.readCount;
    },
    createReader: () => {
      let offset = 0;
      return {
        readEntries: (success) => {
          state.readCount += 1;
          const batch = children.slice(offset, offset + batchSize);
          offset += batch.length;
          success(batch);
        },
      };
    },
  };
};

describe("collectFilesFromEntries", () => {
  it("ファイルエントリから File を取り出す", async () => {
    const a = createFile("a.png");
    const b = createFile("b.jpg", "image/jpeg");
    const { files } = await collectFilesFromEntries([
      fileEntry(a),
      fileEntry(b),
    ]);
    expect(files).toEqual([a, b]);
  });

  it("ディレクトリを再帰走査して配下のファイルを収集する", async () => {
    const root = createFile("root.png");
    const nested = createFile("nested.png");
    const deep = createFile("deep.png");
    const entries: EntryLike[] = [
      fileEntry(root),
      directoryEntry([fileEntry(nested), directoryEntry([fileEntry(deep)])]),
    ];
    const { files } = await collectFilesFromEntries(entries);
    expect(files.map((f) => f.name)).toEqual([
      "root.png",
      "nested.png",
      "deep.png",
    ]);
  });

  it("readEntries が複数バッチに分かれても全件取得する", async () => {
    const children = Array.from({ length: 5 }, (_, i) =>
      fileEntry(createFile(`f${i}.png`)),
    );
    // 1 バッチ 2 件ずつ返す（空配列が返るまでループする挙動を検証）
    const { files } = await collectFilesFromEntries([
      directoryEntry(children, 2),
    ]);
    expect(files.map((f) => f.name)).toEqual([
      "f0.png",
      "f1.png",
      "f2.png",
      "f3.png",
      "f4.png",
    ]);
  });

  it("一部のファイル読み取りが失敗しても読めたファイルだけ返す", async () => {
    const failingEntry: FileEntryLike = {
      isFile: true,
      isDirectory: false,
      file: (_success, errorCallback) =>
        errorCallback?.(new Error("read failed")),
    };
    const ok = createFile("ok.png");
    const { files } = await collectFilesFromEntries([
      failingEntry,
      fileEntry(ok),
    ]);
    expect(files.map((f) => f.name)).toEqual(["ok.png"]);
  });

  it("空のディレクトリはファイル 0 件を返す", async () => {
    const { files } = await collectFilesFromEntries([directoryEntry([])]);
    expect(files).toEqual([]);
  });

  it("エントリが空なら空配列を返す", async () => {
    const { files, reachedLimit } = await collectFilesFromEntries([]);
    expect(files).toEqual([]);
    expect(reachedLimit).toBe(false);
  });

  it("maxFiles 未指定なら従来どおり全件収集し reachedLimit は false", async () => {
    const children = Array.from({ length: 5 }, (_, i) =>
      fileEntry(createFile(`f${i}.png`)),
    );
    const { files, reachedLimit } = await collectFilesFromEntries(children);
    expect(files).toHaveLength(5);
    expect(reachedLimit).toBe(false);
  });

  it("maxFiles に達した時点で収集を打ち切り reachedLimit を返す", async () => {
    const children = Array.from({ length: 5 }, (_, i) =>
      fileEntry(createFile(`f${i}.png`)),
    );
    const { files, reachedLimit } = await collectFilesFromEntries(children, {
      maxFiles: 3,
    });
    expect(files.map((f) => f.name)).toEqual(["f0.png", "f1.png", "f2.png"]);
    expect(reachedLimit).toBe(true);
  });

  it("maxFiles 未達なら reachedLimit は false", async () => {
    const children = Array.from({ length: 5 }, (_, i) =>
      fileEntry(createFile(`f${i}.png`)),
    );
    const { files, reachedLimit } = await collectFilesFromEntries(children, {
      maxFiles: 10,
    });
    expect(files).toHaveLength(5);
    expect(reachedLimit).toBe(false);
  });

  it("再帰時もサブフォルダに残余バジェットを渡し全体で上限を超えない", async () => {
    // ルート直下に 2 ファイル + サブフォルダ（3 ファイル）。上限 4 なら 2 + 2 で打ち切る
    const entries: EntryLike[] = [
      fileEntry(createFile("r0.png")),
      fileEntry(createFile("r1.png")),
      directoryEntry([
        fileEntry(createFile("s0.png")),
        fileEntry(createFile("s1.png")),
        fileEntry(createFile("s2.png")),
      ]),
    ];
    const { files, reachedLimit } = await collectFilesFromEntries(entries, {
      maxFiles: 4,
    });
    expect(files.map((f) => f.name)).toEqual([
      "r0.png",
      "r1.png",
      "s0.png",
      "s1.png",
    ]);
    expect(reachedLimit).toBe(true);
  });

  it("上限に達したらディレクトリの残りバッチを読まない（ストリーミング有界化）", async () => {
    // 1 フォルダに 100 件フラット、1 バッチ 10 件。maxFiles=5 なら最初の 1 バッチで足りる
    const children = Array.from({ length: 100 }, (_, i) =>
      fileEntry(createFile(`f${i}.png`)),
    );
    const dir = directoryEntry(children, 10);
    const { files, reachedLimit } = await collectFilesFromEntries([dir], {
      maxFiles: 5,
    });
    expect(files).toHaveLength(5);
    expect(reachedLimit).toBe(true);
    // 全 100 件を列挙する旧実装なら 11 回（10 バッチ + 終端）読むが、
    // ストリーミングでは上限を満たした 1 バッチ目で打ち切る
    expect(dir.readCount).toBe(1);
  });

  it("上限が 1 バッチを跨ぐ場合は必要なバッチだけ読む", async () => {
    const children = Array.from({ length: 100 }, (_, i) =>
      fileEntry(createFile(`f${i}.png`)),
    );
    const dir = directoryEntry(children, 10);
    const { files } = await collectFilesFromEntries([dir], { maxFiles: 15 });
    expect(files).toHaveLength(15);
    // 10 件のバッチ 2 回で 15 件に達する（3 バッチ目以降は読まない）
    expect(dir.readCount).toBe(2);
  });

  it("空サブフォルダが先頭に並んでも後方の画像を取りこぼさない（エントリ数でなくファイル数で打ち切る）", async () => {
    // 空サブフォルダはファイル 0 件でバジェットを消費しないため、上限が小さくても後方に到達する
    const deep = createFile("deep.png");
    const root = directoryEntry([
      directoryEntry([]),
      directoryEntry([]),
      directoryEntry([]),
      directoryEntry([fileEntry(deep)]),
    ]);
    const { files, reachedLimit } = await collectFilesFromEntries([root], {
      maxFiles: 2,
    });
    expect(files.map((f) => f.name)).toEqual(["deep.png"]);
    expect(reachedLimit).toBe(false);
  });

  it("accept を通過しないファイルはバジェットを消費せず収集もしない", async () => {
    // 画像とテキストが交互。accept=画像のみ・maxFiles=3 → 画像だけ 3 件集め、テキストは数えない
    const entries: EntryLike[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(fileEntry(createFile(`img${i}.png`, "image/png")));
      entries.push(fileEntry(createFile(`note${i}.txt`, "text/plain")));
    }
    const { files, reachedLimit } = await collectFilesFromEntries(entries, {
      maxFiles: 3,
      accept: (f) => f.type.startsWith("image/"),
    });
    expect(files.map((f) => f.name)).toEqual([
      "img0.png",
      "img1.png",
      "img2.png",
    ]);
    expect(reachedLimit).toBe(true);
  });

  it("accept で対象外のファイルは上限未満でも除外される", async () => {
    const entries: EntryLike[] = [
      fileEntry(createFile("a.png", "image/png")),
      fileEntry(createFile("note.txt", "text/plain")),
      fileEntry(createFile("b.png", "image/png")),
    ];
    const { files, reachedLimit } = await collectFilesFromEntries(entries, {
      accept: (f) => f.type.startsWith("image/"),
    });
    expect(files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(reachedLimit).toBe(false);
  });

  it("accept 未指定なら全ファイルを収集する（後方互換）", async () => {
    const entries: EntryLike[] = [
      fileEntry(createFile("a.png", "image/png")),
      fileEntry(createFile("note.txt", "text/plain")),
    ];
    const { files } = await collectFilesFromEntries(entries);
    expect(files.map((f) => f.name)).toEqual(["a.png", "note.txt"]);
  });
});

describe("getEntriesFromDataTransferItems", () => {
  it("webkitGetAsEntry() が返すエントリを収集する", () => {
    const entryA = fileEntry(createFile("a.png"));
    const entryB = fileEntry(createFile("b.png"));
    const items: DataTransferItemLike[] = [
      { webkitGetAsEntry: () => entryA },
      { webkitGetAsEntry: () => entryB },
    ];
    expect(getEntriesFromDataTransferItems(items)).toEqual([entryA, entryB]);
  });

  it("null を返すアイテム（文字列ドラッグ等）は除外する", () => {
    const entry = fileEntry(createFile("a.png"));
    const items: DataTransferItemLike[] = [
      { webkitGetAsEntry: () => null },
      { webkitGetAsEntry: () => entry },
    ];
    expect(getEntriesFromDataTransferItems(items)).toEqual([entry]);
  });

  it("webkitGetAsEntry 未実装のアイテムは除外する", () => {
    const items: DataTransferItemLike[] = [{}, {}];
    expect(getEntriesFromDataTransferItems(items)).toEqual([]);
  });
});
