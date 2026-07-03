import { describe, expect, it } from "vitest";
import { formatFileSize, truncateFileName } from "../fileName";

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
