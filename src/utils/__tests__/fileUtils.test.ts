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
  isRawFile,
  isTiffFile,
  isUnknownMimeType,
  shouldClearLimitWarningOnDecrease,
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

describe("shouldClearLimitWarningOnDecrease", () => {
  it("件数が減って上限未満になったら true（削除・クリア）", () => {
    expect(shouldClearLimitWarningOnDecrease(200, 199, 200)).toBe(true);
    expect(shouldClearLimitWarningOnDecrease(50, 0, 200)).toBe(true);
  });

  it("件数が増えたら（上限未満でも）false", () => {
    // フォルダ走査打ち切りで上限未満のまま警告を出すケースを消さないための肝
    expect(shouldClearLimitWarningOnDecrease(10, 20, 200)).toBe(false);
    expect(shouldClearLimitWarningOnDecrease(1, 2, 200)).toBe(false);
  });

  it("件数が変わらなければ false（上限到達中の no-op 投入で警告を消さない）", () => {
    expect(shouldClearLimitWarningOnDecrease(200, 200, 200)).toBe(false);
    expect(shouldClearLimitWarningOnDecrease(50, 50, 200)).toBe(false);
  });

  it("減っても上限以上のままなら false", () => {
    expect(shouldClearLimitWarningOnDecrease(300, 250, 200)).toBe(false);
    expect(shouldClearLimitWarningOnDecrease(300, 200, 200)).toBe(false);
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

describe("isRawFile", () => {
  it("RAW の MIME タイプを判定する", () => {
    expect(isRawFile(createFile("a.dng", 10, "image/x-adobe-dng"))).toBe(true);
    expect(isRawFile(createFile("a.nef", 10, "image/x-nikon-nef"))).toBe(true);
    expect(isRawFile(createFile("a.png", 10, "image/png"))).toBe(false);
  });

  it("MIME タイプが空・application/octet-stream でも拡張子で判定する", () => {
    expect(isRawFile(createFile("photo.cr2", 10, ""))).toBe(true);
    expect(isRawFile(createFile("photo.CR3", 10, ""))).toBe(true);
    expect(
      isRawFile(createFile("photo.arw", 10, "application/octet-stream")),
    ).toBe(true);
    expect(isRawFile(createFile("photo.png", 10, ""))).toBe(false);
  });

  it("MIME が image/tiff に誤報告されても拡張子を優先して RAW と判定する", () => {
    // NEF / DNG 等は TIFF ベースの形式のため OS が image/tiff と報告することがある
    expect(isRawFile(createFile("photo.nef", 10, "image/tiff"))).toBe(true);
    expect(isRawFile(createFile("photo.dng", 10, "image/tiff"))).toBe(true);
    // 純粋な TIFF は RAW ではない
    expect(isRawFile(createFile("scan.tiff", 10, "image/tiff"))).toBe(false);
  });

  it("対応拡張子を網羅的に判定する", () => {
    for (const ext of [
      ".dng",
      ".cr2",
      ".cr3",
      ".nef",
      ".nrw",
      ".arw",
      ".raf",
      ".orf",
      ".rw2",
      ".pef",
      ".srw",
    ]) {
      expect(isRawFile(createFile(`photo${ext}`, 10, ""))).toBe(true);
    }
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

describe("isAcceptedFileType (RAW フォールバック)", () => {
  const acceptedWithRaw = [
    "image/jpeg",
    "image/x-adobe-dng",
    "image/x-nikon-nef",
  ];

  it("RAW が許可されている場合は MIME 空でも拡張子で受理する", () => {
    expect(
      isAcceptedFileType(createFile("photo.dng", 10, ""), acceptedWithRaw),
    ).toBe(true);
    expect(
      isAcceptedFileType(
        createFile("photo.nef", 10, "application/octet-stream"),
        acceptedWithRaw,
      ),
    ).toBe(true);
  });

  it("RAW が許可されていない場合（crop / metadata 等）は受理しない", () => {
    const acceptedWithoutRaw = ["image/jpeg", "image/png", "image/webp"];
    expect(
      isAcceptedFileType(createFile("photo.dng", 10, ""), acceptedWithoutRaw),
    ).toBe(false);
    expect(
      isAcceptedFileType(
        createFile("photo.nef", 10, "image/x-nikon-nef"),
        acceptedWithoutRaw,
      ),
    ).toBe(false);
    // MIME が image/tiff 誤報告でも image/tiff 非許可のページでは受理しない
    expect(
      isAcceptedFileType(
        createFile("photo.nef", 10, "image/tiff"),
        acceptedWithoutRaw,
      ),
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

  it("RAW を含む場合は拡張子を併記する", () => {
    expect(buildAcceptAttribute(["image/jpeg", "image/x-adobe-dng"])).toBe(
      "image/jpeg,image/x-adobe-dng,.dng,.cr2,.cr3,.nef,.nrw,.arw,.raf,.orf,.rw2,.pef,.srw",
    );
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

  it("RAW の MIME 群は最初の出現位置で単一トークン RAW に集約する", () => {
    expect(
      formatAcceptedTypesLabel([
        "image/jpeg",
        "image/x-adobe-dng",
        "image/x-canon-cr2",
        "image/x-nikon-nef",
        "image/png",
      ]),
    ).toBe("JPG, RAW, PNG");
  });
});

describe("getFileTypeBadgeLabel (RAW)", () => {
  it("RAW は MIME が特定できていても拡張子で表示する", () => {
    // MIME 由来だと "X-ADOBE-DNG" のような冗長ラベルになるため
    expect(
      getFileTypeBadgeLabel(createFile("photo.dng", 10, "image/x-adobe-dng")),
    ).toBe("DNG");
    expect(
      getFileTypeBadgeLabel(createFile("photo.nef", 10, "image/tiff")),
    ).toBe("NEF");
    expect(getFileTypeBadgeLabel(createFile("photo.cr2", 10, ""))).toBe("CR2");
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
