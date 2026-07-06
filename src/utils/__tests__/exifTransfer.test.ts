import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { buildSyntheticJpegFromTiff, piexifDumpToTiff } from "../exifBinary";
import { exifWritableFormat, normalizeExifOrientation } from "../exifTransfer";
import { uint8ArrayToBase64 } from "../imageUtils";

/** 純 TIFF の 0th IFD を読み出すヘルパー（合成 JPEG に包んで piexif で解釈する） */
const load0thIfd = (tiff: Uint8Array): Record<number, unknown> => {
  const jpeg = buildSyntheticJpegFromTiff(tiff);
  const exif = piexif.load(
    `data:image/jpeg;base64,${uint8ArrayToBase64(jpeg)}`,
  );
  return (exif["0th"] ?? {}) as Record<number, unknown>;
};

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

describe("normalizeExifOrientation", () => {
  it("Orientation タグを 1 に正規化し、他のタグは保持する", () => {
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": {
          [piexif.ImageIFD.Orientation]: 6,
          [piexif.ImageIFD.Make]: "TestMake",
        },
        Exif: {},
        GPS: {},
      }),
    );
    // 前提: 元の TIFF は Orientation=6 を持つ
    expect(load0thIfd(tiff)[piexif.ImageIFD.Orientation]).toBe(6);

    const normalized = normalizeExifOrientation(tiff);
    const ifd = load0thIfd(normalized);
    // Orientation は 1（無回転）へ揃えられる
    expect(ifd[piexif.ImageIFD.Orientation]).toBe(1);
    // 回転以外のタグ（Make）は保持される
    expect(ifd[piexif.ImageIFD.Make]).toBe("TestMake");
  });

  it("Orientation タグが無くても例外を投げずに TIFF を返す", () => {
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": { [piexif.ImageIFD.Make]: "NoOrientation" },
        Exif: {},
        GPS: {},
      }),
    );
    const normalized = normalizeExifOrientation(tiff);
    const ifd = load0thIfd(normalized);
    // Make は保持され、Orientation は 1 が付与される
    expect(ifd[piexif.ImageIFD.Make]).toBe("NoOrientation");
    expect(ifd[piexif.ImageIFD.Orientation]).toBe(1);
  });
});
