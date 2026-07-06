import { describe, expect, it } from "vitest";
import { exifWritableFormat } from "../exifTransfer";

describe("exifWritableFormat", () => {
  it("JPEG（image/jpeg・image/jpg）は 'jpeg' を返す", () => {
    expect(exifWritableFormat("image/jpeg")).toBe("jpeg");
    expect(exifWritableFormat("image/jpg")).toBe("jpeg");
  });

  it("PNG は 'png' を返す", () => {
    expect(exifWritableFormat("image/png")).toBe("png");
  });

  it("WebP は 'webp' を返す", () => {
    expect(exifWritableFormat("image/webp")).toBe("webp");
  });

  it("EXIF 書き込み非対応の形式は null を返す", () => {
    // AVIF は Canvas ネイティブ非対応かつメタデータ書き込み未対応
    expect(exifWritableFormat("image/avif")).toBeNull();
    // 入力のみ対応の HEIC / TIFF も書き込みは非対応
    expect(exifWritableFormat("image/heic")).toBeNull();
    expect(exifWritableFormat("image/heif")).toBeNull();
    expect(exifWritableFormat("image/tiff")).toBeNull();
    // その他の形式・空文字も null
    expect(exifWritableFormat("image/bmp")).toBeNull();
    expect(exifWritableFormat("image/gif")).toBeNull();
    expect(exifWritableFormat("")).toBeNull();
  });
});
