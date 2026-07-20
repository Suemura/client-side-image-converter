import { describe, expect, it } from "vitest";
import {
  buildRenamedFileNames,
  createRenameUniquifier,
  expandRenamePattern,
  formatDateYyyymmdd,
  hasRenamePattern,
  parseExifDateTime,
  RENAME_TOKENS,
  type RenameContext,
  resolveSeqPadding,
  sanitizeFileName,
  stripExtension,
} from "../renamePattern";

const baseContext: RenameContext = {
  name: "IMG_2451",
  seq: 1,
  total: 2,
  width: 1920,
  height: 1080,
  date: new Date(2026, 6, 20, 12, 34, 56),
};

describe("hasRenamePattern", () => {
  it("空欄・空白のみは false（従来命名フォールバック）", () => {
    expect(hasRenamePattern("")).toBe(false);
    expect(hasRenamePattern("   ")).toBe(false);
    expect(hasRenamePattern("\t")).toBe(false);
  });

  it("トークンやリテラルを含む場合は true", () => {
    expect(hasRenamePattern("{name}_{seq}")).toBe(true);
    expect(hasRenamePattern("photo")).toBe(true);
  });
});

describe("stripExtension", () => {
  it("拡張子を除いたベース名を返す", () => {
    expect(stripExtension("IMG_2451.jpg")).toBe("IMG_2451");
    expect(stripExtension("archive.tar.gz")).toBe("archive.tar");
  });

  it("拡張子がない・ドット開始のファイル名はそのまま", () => {
    expect(stripExtension("README")).toBe("README");
    expect(stripExtension(".hidden")).toBe(".hidden");
  });
});

describe("sanitizeFileName", () => {
  it("OS 禁止文字を _ に置換する", () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(
      "a_b_c_d_e_f_g_h_i_j",
    );
  });

  it("制御文字も _ に置換する", () => {
    expect(sanitizeFileName("a\u0000b\tc")).toBe("a_b_c");
  });

  it("通常の文字・日本語・スペースは維持する", () => {
    expect(sanitizeFileName("写真 2026 (1)")).toBe("写真 2026 (1)");
  });
});

describe("resolveSeqPadding", () => {
  it("最低 2 桁", () => {
    expect(resolveSeqPadding(1)).toBe(2);
    expect(resolveSeqPadding(99)).toBe(2);
  });

  it("総枚数 100 以上で桁数を自動拡張する", () => {
    expect(resolveSeqPadding(100)).toBe(3);
    expect(resolveSeqPadding(999)).toBe(3);
    expect(resolveSeqPadding(1000)).toBe(4);
  });
});

describe("formatDateYyyymmdd", () => {
  it("YYYYMMDD にゼロ埋め整形する", () => {
    expect(formatDateYyyymmdd(new Date(2026, 0, 5))).toBe("20260105");
    expect(formatDateYyyymmdd(new Date(2026, 11, 31))).toBe("20261231");
  });
});

describe("parseExifDateTime", () => {
  it("EXIF 形式（YYYY:MM:DD HH:MM:SS）を解析する", () => {
    const date = parseExifDateTime("2024:05/01 12:34:56".replace("/", ":"));
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(1);
  });

  it("不正な形式・暦として不正な値は null", () => {
    expect(parseExifDateTime("not a date")).toBeNull();
    expect(parseExifDateTime("2024:13:40 00:00:00")).toBeNull();
    expect(parseExifDateTime("")).toBeNull();
  });
});

describe("expandRenamePattern", () => {
  it("全トークンを仕様どおり展開する", () => {
    expect(
      expandRenamePattern("{name}_{seq}_{width}x{height}_{date}", baseContext),
    ).toBe("IMG_2451_01_1920x1080_20260720");
  });

  it("{seq} は 1 起点ゼロ埋め・総枚数 100 以上で桁拡張", () => {
    expect(expandRenamePattern("{seq}", { ...baseContext, seq: 3 })).toBe("03");
    expect(
      expandRenamePattern("{seq}", { ...baseContext, seq: 7, total: 150 }),
    ).toBe("007");
  });

  it("未知のトークンはリテラルのまま残す", () => {
    expect(expandRenamePattern("{name}_{foo}", baseContext)).toBe(
      "IMG_2451_{foo}",
    );
  });

  it("width / height 未確定時はトークンをリテラルのまま残す", () => {
    expect(
      expandRenamePattern("{width}x{height}", {
        ...baseContext,
        width: undefined,
        height: undefined,
      }),
    ).toBe("{width}x{height}");
  });

  it("同一トークンの複数回使用も展開する", () => {
    expect(expandRenamePattern("{name}-{name}", baseContext)).toBe(
      "IMG_2451-IMG_2451",
    );
  });
});

describe("createRenameUniquifier", () => {
  it("初出はそのまま・衝突は ' (1)' 等を付与して一意化する", () => {
    const uniquify = createRenameUniquifier();
    expect(uniquify("photo")).toBe("photo");
    expect(uniquify("photo")).toBe("photo (1)");
    expect(uniquify("photo")).toBe("photo (2)");
    expect(uniquify("other")).toBe("other");
  });

  it("連番候補が既出の名前と衝突する場合はさらに繰り上げる", () => {
    const uniquify = createRenameUniquifier();
    expect(uniquify("photo (1)")).toBe("photo (1)");
    expect(uniquify("photo")).toBe("photo");
    // "photo (1)" は既出のため "photo (2)" へ
    expect(uniquify("photo")).toBe("photo (2)");
  });
});

describe("buildRenamedFileNames", () => {
  const contexts: RenameContext[] = [
    { ...baseContext, name: "IMG_2451", seq: 1 },
    { ...baseContext, name: "IMG_2452", seq: 2 },
  ];

  it("展開 → 拡張子付与でファイル名一覧を作る", () => {
    expect(buildRenamedFileNames("{name}_{seq}", contexts, "jpeg")).toEqual([
      "IMG_2451_01.jpeg",
      "IMG_2452_02.jpeg",
    ]);
  });

  it("展開結果が同名になる場合は ' (1)' で一意化する", () => {
    expect(buildRenamedFileNames("vacation_{date}", contexts, "png")).toEqual([
      "vacation_20260720.png",
      "vacation_20260720 (1).png",
    ]);
  });

  it("禁止文字を含むパターンはサニタイズされる", () => {
    expect(buildRenamedFileNames("a/b:{seq}", contexts, "webp")).toEqual([
      "a_b_01.webp",
      "a_b_02.webp",
    ]);
  });

  it("展開結果が空になる場合は元名へフォールバックする", () => {
    const spaceContexts = [{ ...baseContext, name: "IMG_2451", seq: 1 }];
    expect(buildRenamedFileNames("   ", spaceContexts, "jpeg")).toEqual([
      "IMG_2451.jpeg",
    ]);
  });
});

describe("RENAME_TOKENS", () => {
  it("チップ表示用のトークン一覧を提供する", () => {
    expect(RENAME_TOKENS).toContain("{name}");
    expect(RENAME_TOKENS).toContain("{seq}");
    expect(RENAME_TOKENS).toContain("{width}");
    expect(RENAME_TOKENS).toContain("{height}");
    expect(RENAME_TOKENS).toContain("{date}");
  });
});
