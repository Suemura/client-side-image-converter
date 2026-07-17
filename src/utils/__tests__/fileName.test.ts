import { describe, expect, it } from "vitest";
import {
  appendFileNameSuffix,
  createFileNameUniquifier,
  formatFileSize,
  truncateFileName,
} from "../fileName";

describe("appendFileNameSuffix", () => {
  it("拡張子の直前へサフィックスを挿入する", () => {
    expect(appendFileNameSuffix("photo.png", "_redacted")).toBe(
      "photo_redacted.png",
    );
  });

  it("多重ドットは最後の拡張子の前へ挿入する", () => {
    expect(appendFileNameSuffix("archive.backup.jpeg", "_redacted")).toBe(
      "archive.backup_redacted.jpeg",
    );
  });

  it("拡張子がない場合は末尾へ付与する", () => {
    expect(appendFileNameSuffix("photo", "_redacted")).toBe("photo_redacted");
  });

  it("ドットで始まる名前（隠しファイル）は末尾へ付与する", () => {
    expect(appendFileNameSuffix(".gitignore", "_redacted")).toBe(
      ".gitignore_redacted",
    );
  });
});

describe("createFileNameUniquifier", () => {
  it("初出のファイル名はそのまま返す", () => {
    const uniquify = createFileNameUniquifier();
    expect(uniquify("photo.jpg")).toBe("photo.jpg");
    expect(uniquify("logo.png")).toBe("logo.png");
  });

  it("同名衝突は拡張子の前に _2, _3, ... を付けて一意化する", () => {
    const uniquify = createFileNameUniquifier();
    expect(uniquify("photo.webp")).toBe("photo.webp");
    expect(uniquify("photo.webp")).toBe("photo_2.webp");
    expect(uniquify("photo.webp")).toBe("photo_3.webp");
  });

  it("連番候補が既出の実ファイル名と衝突する場合は一意になるまで進める", () => {
    // photo.png / photo_2.png / photo.webp を JPEG 変換したバッチを想定:
    // 3 件目の photo.jpeg の連番候補 photo_2.jpeg は 2 件目の実名と衝突する
    const uniquify = createFileNameUniquifier();
    expect(uniquify("photo.jpeg")).toBe("photo.jpeg");
    expect(uniquify("photo_2.jpeg")).toBe("photo_2.jpeg");
    expect(uniquify("photo.jpeg")).toBe("photo_3.jpeg");
  });

  it("採番後に同じ元名が来たら前回の連番の続きから探索する", () => {
    const uniquify = createFileNameUniquifier();
    expect(uniquify("a.png")).toBe("a.png");
    expect(uniquify("a.png")).toBe("a_2.png");
    expect(uniquify("a_3.png")).toBe("a_3.png");
    expect(uniquify("a.png")).toBe("a_4.png");
  });

  it("拡張子なしのファイル名は末尾に連番を付ける", () => {
    const uniquify = createFileNameUniquifier();
    expect(uniquify("README")).toBe("README");
    expect(uniquify("README")).toBe("README_2");
  });

  it("先頭ドットの隠しファイル名は全体を名前として扱う", () => {
    const uniquify = createFileNameUniquifier();
    expect(uniquify(".hidden")).toBe(".hidden");
    expect(uniquify(".hidden")).toBe(".hidden_2");
  });

  it("初期使用済み名と衝突する入力は初出でも連番へ回る", () => {
    const uniquify = createFileNameUniquifier(["photo.png", "logo.png"]);
    expect(uniquify("photo.png")).toBe("photo_2.png");
    expect(uniquify("other.png")).toBe("other.png");
  });

  it("初期使用済み名は連番候補との衝突チェックにも使われる", () => {
    const uniquify = createFileNameUniquifier(["photo.png", "photo_2.png"]);
    expect(uniquify("photo.png")).toBe("photo_3.png");
  });

  it("生成した関数ごとに採番状態は独立している", () => {
    const first = createFileNameUniquifier();
    const second = createFileNameUniquifier();
    expect(first("photo.jpg")).toBe("photo.jpg");
    expect(second("photo.jpg")).toBe("photo.jpg");
  });
});

describe("truncateFileName", () => {
  it("最大長以下のファイル名はそのまま返す", () => {
    expect(truncateFileName("short.jpg")).toBe("short.jpg");
    expect(truncateFileName("exactly12.jp")).toBe("exactly12.jp");
  });

  it("長いファイル名は中間を省略して start...end.ext 形式にする", () => {
    // maxLength=12, 拡張子".jpg"(4文字) → 名前部分に使えるのは 12-4-3=5文字（前3+後2）
    expect(truncateFileName("very-long-file-name.jpg")).toBe("ver...me.jpg");
  });

  it("省略後の文字列長は最大長と一致する", () => {
    const result = truncateFileName("very-long-file-name.jpg");
    expect(result.length).toBe(12);
  });

  it("拡張子がないファイル名も中間省略される", () => {
    expect(truncateFileName("abcdefghijklmnop")).toBe("abcde...mnop");
  });

  it("拡張子が長すぎる場合は末尾省略に切り替わる", () => {
    expect(truncateFileName("abcdefghijklm.verylongext")).toBe("abcdefghi...");
  });

  it("maxLength を指定できる", () => {
    expect(truncateFileName("short.jpg", 5)).toBe("sh...");
  });
});

describe("formatFileSize", () => {
  it("0 バイトは '0 Bytes' を返す", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("1024 未満は Bytes 単位で返す", () => {
    expect(formatFileSize(500)).toBe("500 Bytes");
    expect(formatFileSize(1023)).toBe("1023 Bytes");
  });

  it("KB / MB / GB 単位に変換する", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1048576)).toBe("1 MB");
    expect(formatFileSize(1073741824)).toBe("1 GB");
  });

  it("小数第2位までに丸める", () => {
    expect(formatFileSize(1234567)).toBe("1.18 MB");
  });
});
