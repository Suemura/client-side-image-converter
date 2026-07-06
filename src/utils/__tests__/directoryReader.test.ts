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
 */
const directoryEntry = (
  children: EntryLike[],
  batchSize = children.length,
): DirectoryEntryLike => ({
  isFile: false,
  isDirectory: true,
  createReader: () => {
    let offset = 0;
    return {
      readEntries: (success) => {
        const batch = children.slice(offset, offset + batchSize);
        offset += batch.length;
        success(batch);
      },
    };
  },
});

describe("collectFilesFromEntries", () => {
  it("ファイルエントリから File を取り出す", async () => {
    const a = createFile("a.png");
    const b = createFile("b.jpg", "image/jpeg");
    const files = await collectFilesFromEntries([fileEntry(a), fileEntry(b)]);
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
    const files = await collectFilesFromEntries(entries);
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
    const files = await collectFilesFromEntries([directoryEntry(children, 2)]);
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
    const files = await collectFilesFromEntries([failingEntry, fileEntry(ok)]);
    expect(files.map((f) => f.name)).toEqual(["ok.png"]);
  });

  it("空のディレクトリはファイル 0 件を返す", async () => {
    const files = await collectFilesFromEntries([directoryEntry([])]);
    expect(files).toEqual([]);
  });

  it("エントリが空なら空配列を返す", async () => {
    expect(await collectFilesFromEntries([])).toEqual([]);
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
