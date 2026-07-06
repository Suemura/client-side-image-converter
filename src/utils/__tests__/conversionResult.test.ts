import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildConversionResult } from "../conversionResult";

// URL.createObjectURL はブラウザ API のため、返り値を固定してオブジェクト生成分岐を安定的に検証する
// （ファイル名生成・サイズ・File 化などの純ロジック部分を対象とする）
beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 指定バイト数のダミー Blob を生成する（ascii 1 文字 = 1 バイト） */
const blobOfSize = (bytes: number, type: string): Blob =>
  new Blob(["x".repeat(bytes)], { type });

describe("buildConversionResult", () => {
  it("拡張子を出力フォーマットに置き換えたファイル名を生成する", () => {
    const original = new File(["src"], "photo.jpg", { type: "image/jpeg" });
    const blob = blobOfSize(10, "image/png");
    const result = buildConversionResult(original, blob, "png");

    expect(result.filename).toBe("photo.png");
    expect(result.originalFilename).toBe("photo.jpg");
    expect(result.file.name).toBe("photo.png");
    expect(result.file.type).toBe("image/png");
  });

  it("拡張子がないファイル名は末尾にフォーマットを付与する", () => {
    const original = new File(["src"], "photo", { type: "image/jpeg" });
    const blob = blobOfSize(5, "image/webp");
    const result = buildConversionResult(original, blob, "webp");

    // lastIndexOf(".") が -1 → substring が "" になり || フォールバックで元の名前を使う
    expect(result.filename).toBe("photo.webp");
  });

  it("複数のドットを含む場合は最後のドット以降だけを置き換える", () => {
    const original = new File(["src"], "my.photo.image.jpeg", {
      type: "image/jpeg",
    });
    const blob = blobOfSize(8, "image/avif");
    const result = buildConversionResult(original, blob, "avif");

    expect(result.filename).toBe("my.photo.image.avif");
  });

  it("先頭ドットのみのファイル名（ドットファイル）はフォールバックで元名 + 拡張子になる", () => {
    const original = new File(["src"], ".gitignore", {
      type: "application/octet-stream",
    });
    const blob = blobOfSize(3, "image/png");
    const result = buildConversionResult(original, blob, "png");

    // lastIndexOf(".") が 0 → substring(0, 0) が "" になり || フォールバックが働く
    expect(result.filename).toBe(".gitignore.png");
  });

  it("元サイズ・変換後サイズ・URL・targetSizeAchieved を結果に含める", () => {
    const original = new File(["source-bytes"], "a.jpg", {
      type: "image/jpeg",
    });
    const blob = blobOfSize(20, "image/jpeg");
    const result = buildConversionResult(original, blob, "jpeg", true);

    expect(result.originalSize).toBe(original.size);
    expect(result.convertedSize).toBe(blob.size);
    expect(result.blob).toBe(blob);
    expect(result.url).toBe("blob:mock-url");
    expect(result.targetSizeAchieved).toBe(true);
  });

  it("targetSizeAchieved を渡さない場合は undefined になる", () => {
    const original = new File(["src"], "a.png", { type: "image/png" });
    const blob = blobOfSize(5, "image/webp");
    const result = buildConversionResult(original, blob, "webp");

    expect(result.targetSizeAchieved).toBeUndefined();
  });
});
