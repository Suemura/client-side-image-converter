import { describe, expect, it } from "vitest";
import {
  addFileNameSuffix,
  addUniqueFiles,
  calculateAverageFileSize,
  calculateCompressionRatio,
  calculateFileStatistics,
  calculateProgressPercentage,
  calculateTotalFileSize,
  changeFileExtension,
  filterValidFiles,
  getFileExtension,
  getFileNameWithoutExtension,
  isAcceptedFileType,
  isDuplicateFile,
  isImageFile,
} from "../fileUtils";

/** テスト用の File オブジェクトを生成する */
const createFile = (name: string, size: number, type: string): File => {
  return new File([new Uint8Array(size)], name, { type });
};

describe("calculateCompressionRatio", () => {
  it("圧縮率をパーセンテージで返す", () => {
    expect(calculateCompressionRatio(1000, 250)).toBe(75);
    expect(calculateCompressionRatio(1000, 1000)).toBe(0);
  });

  it("元サイズが 0 の場合は 0 を返す", () => {
    expect(calculateCompressionRatio(0, 100)).toBe(0);
  });
});

describe("calculateProgressPercentage", () => {
  it("進捗率をパーセンテージで返す", () => {
    expect(calculateProgressPercentage(5, 10)).toBe(50);
    expect(calculateProgressPercentage(10, 10)).toBe(100);
  });

  it("合計が 0 の場合は 0 を返す", () => {
    expect(calculateProgressPercentage(5, 0)).toBe(0);
  });
});

describe("isDuplicateFile / addUniqueFiles", () => {
  it("名前とサイズが同じファイルを重複と判定する", () => {
    const existing = [createFile("a.png", 100, "image/png")];
    expect(
      isDuplicateFile(existing, createFile("a.png", 100, "image/png")),
    ).toBe(true);
    expect(
      isDuplicateFile(existing, createFile("a.png", 200, "image/png")),
    ).toBe(false);
    expect(
      isDuplicateFile(existing, createFile("b.png", 100, "image/png")),
    ).toBe(false);
  });

  it("重複を除外して新しいファイルを追加する", () => {
    const existing = [createFile("a.png", 100, "image/png")];
    const added = addUniqueFiles(existing, [
      createFile("a.png", 100, "image/png"),
      createFile("b.png", 200, "image/png"),
    ]);
    expect(added.map((f) => f.name)).toEqual(["a.png", "b.png"]);
  });
});

describe("isImageFile / isAcceptedFileType / filterValidFiles", () => {
  it("MIME タイプが image/ で始まるファイルを画像と判定する", () => {
    expect(isImageFile(createFile("a.png", 10, "image/png"))).toBe(true);
    expect(isImageFile(createFile("a.txt", 10, "text/plain"))).toBe(false);
  });

  it("許可された MIME タイプのみを受け入れる", () => {
    const accepted = ["image/jpeg", "image/png"];
    expect(
      isAcceptedFileType(createFile("a.png", 10, "image/png"), accepted),
    ).toBe(true);
    expect(
      isAcceptedFileType(createFile("a.gif", 10, "image/gif"), accepted),
    ).toBe(false);
  });

  it("有効なファイルのみをフィルタリングする", () => {
    const files = [
      createFile("a.png", 10, "image/png"),
      createFile("b.gif", 10, "image/gif"),
      createFile("c.jpg", 10, "image/jpeg"),
    ];
    const valid = filterValidFiles(files, ["image/jpeg", "image/png"]);
    expect(valid.map((f) => f.name)).toEqual(["a.png", "c.jpg"]);
  });
});

describe("ファイルサイズ計算", () => {
  it("合計サイズを計算する", () => {
    const files = [
      createFile("a.png", 100, "image/png"),
      createFile("b.png", 200, "image/png"),
    ];
    expect(calculateTotalFileSize(files)).toBe(300);
    expect(calculateTotalFileSize([])).toBe(0);
  });

  it("平均サイズを計算する（空配列は 0）", () => {
    const files = [
      createFile("a.png", 100, "image/png"),
      createFile("b.png", 200, "image/png"),
    ];
    expect(calculateAverageFileSize(files)).toBe(150);
    expect(calculateAverageFileSize([])).toBe(0);
  });
});

describe("ファイル名操作", () => {
  it("拡張子を取得する（ドット付き）", () => {
    expect(getFileExtension("photo.jpg")).toBe(".jpg");
    expect(getFileExtension("archive.tar.gz")).toBe(".gz");
    expect(getFileExtension("noextension")).toBe("");
  });

  it("拡張子を除いた名前を取得する", () => {
    expect(getFileNameWithoutExtension("photo.jpg")).toBe("photo");
    expect(getFileNameWithoutExtension("noextension")).toBe("noextension");
  });

  it("拡張子を変更する", () => {
    expect(changeFileExtension("photo.png", ".webp")).toBe("photo.webp");
    expect(changeFileExtension("noextension", ".jpg")).toBe("noextension.jpg");
  });

  it("サフィックスを追加する", () => {
    expect(addFileNameSuffix("photo.png", "_cropped")).toBe(
      "photo_cropped.png",
    );
    expect(addFileNameSuffix("noextension", "_v2")).toBe("noextension_v2");
  });
});

describe("calculateFileStatistics", () => {
  it("File 配列から統計情報を計算する", () => {
    const files = [
      createFile("a.png", 100, "image/png"),
      createFile("b.png", 300, "image/png"),
    ];
    expect(calculateFileStatistics(files)).toEqual({
      total: 400,
      average: 200,
      min: 100,
      max: 300,
      count: 2,
    });
  });

  it("数値配列からも統計情報を計算する", () => {
    expect(calculateFileStatistics([10, 20, 30])).toEqual({
      total: 60,
      average: 20,
      min: 10,
      max: 30,
      count: 3,
    });
  });

  it("空配列はすべて 0 を返す", () => {
    expect(calculateFileStatistics([])).toEqual({
      total: 0,
      average: 0,
      min: 0,
      max: 0,
      count: 0,
    });
  });
});
