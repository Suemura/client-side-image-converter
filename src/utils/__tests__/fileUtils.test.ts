import { describe, expect, it } from "vitest";
import {
  addFileNameSuffix,
  addUniqueFiles,
  addUniqueFilesWithLimit,
  buildAcceptAttribute,
  calculateAverageFileSize,
  calculateCompressionRatio,
  calculateFileStatistics,
  calculateProgressPercentage,
  calculateTotalFileSize,
  changeFileExtension,
  filterValidFiles,
  formatAcceptedTypesLabel,
  getFileExtension,
  getFileNameWithoutExtension,
  getFilesFromClipboardData,
  getFileTypeBadgeLabel,
  isAcceptedFileType,
  isDuplicateFile,
  isHeicFile,
  isImageFile,
  isTiffFile,
  isUnknownMimeType,
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

describe("addUniqueFilesWithLimit", () => {
  it("上限以下なら全件追加し truncated=false", () => {
    const existing = [createFile("a.png", 100, "image/png")];
    const result = addUniqueFilesWithLimit(
      existing,
      [createFile("b.png", 200, "image/png")],
      5,
    );
    expect(result.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(result.truncated).toBe(false);
  });

  it("上限ちょうどなら truncated=false", () => {
    const existing = [createFile("a.png", 100, "image/png")];
    const result = addUniqueFilesWithLimit(
      existing,
      [createFile("b.png", 200, "image/png")],
      2,
    );
    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it("上限超過なら先頭から limit 件に切り詰め truncated=true", () => {
    const newFiles = [
      createFile("b.png", 1, "image/png"),
      createFile("c.png", 2, "image/png"),
      createFile("d.png", 3, "image/png"),
    ];
    const existing = [createFile("a.png", 100, "image/png")];
    const result = addUniqueFilesWithLimit(existing, newFiles, 2);
    // 既存を先頭に残し、新規は上限までのみ取り込む
    expect(result.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(result.truncated).toBe(true);
  });

  it("重複除外は上限適用の前に行われる", () => {
    const existing = [createFile("a.png", 100, "image/png")];
    const result = addUniqueFilesWithLimit(
      existing,
      [
        createFile("a.png", 100, "image/png"), // 重複
        createFile("b.png", 200, "image/png"),
      ],
      2,
    );
    expect(result.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(result.truncated).toBe(false);
  });

  it("既存が既に上限件数のとき新規は取り込まず truncated=true", () => {
    const existing = [
      createFile("a.png", 1, "image/png"),
      createFile("b.png", 2, "image/png"),
    ];
    const result = addUniqueFilesWithLimit(
      existing,
      [createFile("c.png", 3, "image/png")],
      2,
    );
    expect(result.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(result.truncated).toBe(true);
  });

  it("新規が全て重複なら件数が増えず truncated=false", () => {
    const existing = [
      createFile("a.png", 1, "image/png"),
      createFile("b.png", 2, "image/png"),
    ];
    const result = addUniqueFilesWithLimit(
      existing,
      [createFile("a.png", 1, "image/png")],
      2,
    );
    expect(result.files.map((f) => f.name)).toEqual(["a.png", "b.png"]);
    expect(result.truncated).toBe(false);
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

describe("getFilesFromClipboardData", () => {
  const clipboardItem = (kind: string, file: File | null) => ({
    kind,
    getAsFile: () => file,
  });

  it("clipboardData が null の場合は空配列を返す", () => {
    expect(getFilesFromClipboardData(null)).toEqual([]);
  });

  it(".files があればそれを優先して返す", () => {
    const a = createFile("a.png", 10, "image/png");
    const result = getFilesFromClipboardData({ files: [a] });
    expect(result).toEqual([a]);
  });

  it(".files が空なら .items の kind==='file' から取り出す", () => {
    const a = createFile("pasted.png", 10, "image/png");
    const result = getFilesFromClipboardData({
      files: [],
      items: [clipboardItem("file", a)],
    });
    expect(result).toEqual([a]);
  });

  it(".items の文字列アイテム（kind==='string'）は無視する", () => {
    const a = createFile("pasted.png", 10, "image/png");
    const result = getFilesFromClipboardData({
      items: [clipboardItem("string", null), clipboardItem("file", a)],
    });
    expect(result).toEqual([a]);
  });

  it(".files も .items も無い場合は空配列を返す", () => {
    expect(getFilesFromClipboardData({})).toEqual([]);
  });
});

describe("isUnknownMimeType", () => {
  it("MIME タイプが空文字または application/octet-stream の場合に true を返す", () => {
    expect(isUnknownMimeType(createFile("a.heic", 10, ""))).toBe(true);
    expect(
      isUnknownMimeType(createFile("a.heic", 10, "application/octet-stream")),
    ).toBe(true);
  });

  it("MIME タイプが特定できている場合は false を返す", () => {
    expect(isUnknownMimeType(createFile("a.png", 10, "image/png"))).toBe(false);
    expect(isUnknownMimeType(createFile("a.pdf", 10, "application/pdf"))).toBe(
      false,
    );
  });
});

describe("getFileTypeBadgeLabel", () => {
  it("MIME タイプが特定できている場合はサブタイプを大文字で返す", () => {
    expect(getFileTypeBadgeLabel(createFile("a.png", 10, "image/png"))).toBe(
      "PNG",
    );
    expect(getFileTypeBadgeLabel(createFile("a.heic", 10, "image/heic"))).toBe(
      "HEIC",
    );
  });

  it("MIME タイプが特定できない場合は拡張子でフォールバック表示する", () => {
    expect(getFileTypeBadgeLabel(createFile("photo.heic", 10, ""))).toBe(
      "HEIC",
    );
    // isHeicFile と同じ基準: application/octet-stream も拡張子フォールバックの対象
    expect(
      getFileTypeBadgeLabel(
        createFile("photo.heic", 10, "application/octet-stream"),
      ),
    ).toBe("HEIC");
  });

  it("MIME も拡張子も特定できない場合は FILE を返す", () => {
    expect(getFileTypeBadgeLabel(createFile("noextension", 10, ""))).toBe(
      "FILE",
    );
  });
});

describe("isHeicFile", () => {
  it("HEIC/HEIF の MIME タイプを判定する", () => {
    expect(isHeicFile(createFile("a.heic", 10, "image/heic"))).toBe(true);
    expect(isHeicFile(createFile("a.heif", 10, "image/heif"))).toBe(true);
    expect(isHeicFile(createFile("a.png", 10, "image/png"))).toBe(false);
  });

  it("MIME タイプが空の場合は拡張子でフォールバック判定する", () => {
    expect(isHeicFile(createFile("photo.heic", 10, ""))).toBe(true);
    expect(isHeicFile(createFile("photo.HEIC", 10, ""))).toBe(true);
    expect(isHeicFile(createFile("photo.heif", 10, ""))).toBe(true);
    expect(isHeicFile(createFile("photo.png", 10, ""))).toBe(false);
  });

  it("MIME タイプが application/octet-stream の場合も拡張子で判定する", () => {
    expect(
      isHeicFile(createFile("photo.heic", 10, "application/octet-stream")),
    ).toBe(true);
    expect(
      isHeicFile(createFile("photo.bin", 10, "application/octet-stream")),
    ).toBe(false);
  });

  it("MIME タイプが特定できている場合は拡張子で判定しない", () => {
    // 拡張子が .heic でも MIME が別の画像形式なら HEIC とは扱わない
    expect(isHeicFile(createFile("photo.heic", 10, "image/png"))).toBe(false);
  });
});

describe("isTiffFile", () => {
  it("TIFF の MIME タイプを判定する", () => {
    expect(isTiffFile(createFile("a.tiff", 10, "image/tiff"))).toBe(true);
    expect(isTiffFile(createFile("a.png", 10, "image/png"))).toBe(false);
  });

  it("MIME タイプが空の場合は拡張子でフォールバック判定する", () => {
    expect(isTiffFile(createFile("scan.tif", 10, ""))).toBe(true);
    expect(isTiffFile(createFile("scan.tiff", 10, ""))).toBe(true);
    expect(isTiffFile(createFile("scan.TIFF", 10, ""))).toBe(true);
    expect(isTiffFile(createFile("scan.png", 10, ""))).toBe(false);
  });

  it("MIME タイプが application/octet-stream の場合も拡張子で判定する", () => {
    expect(
      isTiffFile(createFile("scan.tiff", 10, "application/octet-stream")),
    ).toBe(true);
    expect(
      isTiffFile(createFile("scan.bin", 10, "application/octet-stream")),
    ).toBe(false);
  });

  it("MIME タイプが特定できている場合は拡張子で判定しない", () => {
    // 拡張子が .tiff でも MIME が別の画像形式なら TIFF とは扱わない
    expect(isTiffFile(createFile("scan.tiff", 10, "image/png"))).toBe(false);
  });
});

describe("isAcceptedFileType (HEIC フォールバック)", () => {
  const acceptedWithHeic = [
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
  ];

  it("HEIC が許可されている場合は MIME 空でも拡張子で受理する", () => {
    expect(
      isAcceptedFileType(createFile("photo.heic", 10, ""), acceptedWithHeic),
    ).toBe(true);
    expect(
      isAcceptedFileType(createFile("photo.png", 10, ""), acceptedWithHeic),
    ).toBe(false);
  });

  it("HEIC が許可されていない場合は拡張子フォールバックしない", () => {
    expect(
      isAcceptedFileType(createFile("photo.heic", 10, ""), [
        "image/jpeg",
        "image/png",
      ]),
    ).toBe(false);
    expect(
      isAcceptedFileType(createFile("photo.heic", 10, "image/heic"), [
        "image/jpeg",
        "image/png",
      ]),
    ).toBe(false);
  });
});

describe("isAcceptedFileType (TIFF フォールバック)", () => {
  const acceptedWithTiff = ["image/jpeg", "image/png", "image/tiff"];

  it("TIFF が許可されている場合は MIME 空でも拡張子で受理する", () => {
    expect(
      isAcceptedFileType(createFile("scan.tif", 10, ""), acceptedWithTiff),
    ).toBe(true);
    expect(
      isAcceptedFileType(createFile("scan.tiff", 10, ""), acceptedWithTiff),
    ).toBe(true);
  });

  it("TIFF が許可されていない場合は拡張子フォールバックしない", () => {
    expect(
      isAcceptedFileType(createFile("scan.tiff", 10, ""), [
        "image/jpeg",
        "image/png",
      ]),
    ).toBe(false);
    expect(
      isAcceptedFileType(createFile("scan.tiff", 10, "image/tiff"), [
        "image/jpeg",
        "image/png",
      ]),
    ).toBe(false);
  });
});

describe("buildAcceptAttribute", () => {
  it("HEIC を含む場合は拡張子を併記する", () => {
    expect(buildAcceptAttribute(["image/jpeg", "image/heic"])).toBe(
      "image/jpeg,image/heic,.heic,.heif",
    );
  });

  it("TIFF を含む場合は拡張子を併記する", () => {
    expect(buildAcceptAttribute(["image/jpeg", "image/tiff"])).toBe(
      "image/jpeg,image/tiff,.tif,.tiff",
    );
  });

  it("HEIC と TIFF の両方を含む場合は両方の拡張子を併記する", () => {
    expect(
      buildAcceptAttribute(["image/jpeg", "image/tiff", "image/heic"]),
    ).toBe("image/jpeg,image/tiff,image/heic,.heic,.heif,.tif,.tiff");
  });

  it("フォールバック対象を含まない場合は MIME タイプのみを返す", () => {
    expect(buildAcceptAttribute(["image/jpeg", "image/png"])).toBe(
      "image/jpeg,image/png",
    );
  });
});

describe("formatAcceptedTypesLabel", () => {
  it("MIME タイプを表示名に変換してカンマ区切りで返す", () => {
    expect(
      formatAcceptedTypesLabel([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/bmp",
        "image/tiff",
      ]),
    ).toBe("JPG, PNG, WebP, BMP, TIFF");
  });

  it("HEIC/HEIF を含むラベルを生成する", () => {
    expect(formatAcceptedTypesLabel(["image/heic", "image/heif"])).toBe(
      "HEIC, HEIF",
    );
  });

  it("未知の MIME タイプはサブタイプの大文字表記にフォールバックする", () => {
    expect(formatAcceptedTypesLabel(["image/gif"])).toBe("GIF");
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
