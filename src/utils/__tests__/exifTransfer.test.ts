import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { buildSyntheticJpegFromTiff, piexifDumpToTiff } from "../exifBinary";
import {
  exifWritableFormat,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "../exifTransfer";
import { uint8ArrayToBase64 } from "../imageUtils";

/** 純 TIFF を合成 JPEG に包んで piexif で解釈するヘルパー */
const loadExif = (tiff: Uint8Array) => {
  const jpeg = buildSyntheticJpegFromTiff(tiff);
  return piexif.load(`data:image/jpeg;base64,${uint8ArrayToBase64(jpeg)}`);
};

/** 純 TIFF の 0th IFD を読み出すヘルパー */
const load0thIfd = (tiff: Uint8Array): Record<number, unknown> =>
  (loadExif(tiff)["0th"] ?? {}) as Record<number, unknown>;

/** 純 TIFF の ExifIFD を読み出すヘルパー */
const loadExifIfd = (tiff: Uint8Array): Record<number, unknown> =>
  (loadExif(tiff).Exif ?? {}) as Record<number, unknown>;

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

describe("normalizeExifForBakedImage", () => {
  it("Orientation タグを 1 に正規化し、他のタグは保持する", async () => {
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

    const normalized = await normalizeExifForBakedImage(tiff, 100, 200);
    const ifd = load0thIfd(normalized);
    // Orientation は 1（無回転）へ揃えられる
    expect(ifd[piexif.ImageIFD.Orientation]).toBe(1);
    // 回転以外のタグ（Make）は保持される
    expect(ifd[piexif.ImageIFD.Make]).toBe("TestMake");
  });

  it("Orientation タグが無くても例外を投げずに TIFF を返す", async () => {
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": { [piexif.ImageIFD.Make]: "NoOrientation" },
        Exif: {},
        GPS: {},
      }),
    );
    const normalized = await normalizeExifForBakedImage(tiff, 100, 200);
    const ifd = load0thIfd(normalized);
    // Make は保持され、Orientation は 1 が付与される
    expect(ifd[piexif.ImageIFD.Make]).toBe("NoOrientation");
    expect(ifd[piexif.ImageIFD.Orientation]).toBe(1);
  });

  it("実ピクセル寸法タグが存在する場合は焼き込み後の実寸へ更新する", async () => {
    // 回転で幅・高さが入れ替わったケースを想定（元 4000x3000 → 出力 3000x4000）
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": { [piexif.ImageIFD.Orientation]: 6 },
        Exif: {
          [piexif.ExifIFD.PixelXDimension]: 4000,
          [piexif.ExifIFD.PixelYDimension]: 3000,
        },
        GPS: {},
      }),
    );

    const normalized = await normalizeExifForBakedImage(tiff, 3000, 4000);
    const exifIfd = loadExifIfd(normalized);
    expect(exifIfd[piexif.ExifIFD.PixelXDimension]).toBe(3000);
    expect(exifIfd[piexif.ExifIFD.PixelYDimension]).toBe(4000);
    // Orientation も併せて 1 に揃う
    expect(load0thIfd(normalized)[piexif.ImageIFD.Orientation]).toBe(1);
  });

  it("実ピクセル寸法タグが無い画像には寸法タグを新規追加しない", async () => {
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": { [piexif.ImageIFD.Orientation]: 1 },
        Exif: {},
        GPS: {},
      }),
    );

    const normalized = await normalizeExifForBakedImage(tiff, 300, 400);
    const exifIfd = loadExifIfd(normalized);
    expect(piexif.ExifIFD.PixelXDimension in exifIfd).toBe(false);
    expect(piexif.ExifIFD.PixelYDimension in exifIfd).toBe(false);
  });
});

describe("readExifTiffFromDataUrl", () => {
  it("EXIF 入り JPEG の DataURL から TIFF を読み出せる", async () => {
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": { [piexif.ImageIFD.Make]: "TestMake" },
        Exif: {},
        GPS: {},
      }),
    );
    const jpeg = buildSyntheticJpegFromTiff(tiff);
    const dataUrl = `data:image/jpeg;base64,${uint8ArrayToBase64(jpeg)}`;

    const result = await readExifTiffFromDataUrl(dataUrl, "image/jpeg");
    expect(result).not.toBeNull();
    expect(load0thIfd(result as Uint8Array)[piexif.ImageIFD.Make]).toBe(
      "TestMake",
    );
  });

  it("JPEG として解釈できない DataURL は throw せず null を返す", async () => {
    const result = await readExifTiffFromDataUrl(
      "data:image/jpeg;base64,AAAAAAAA",
      "image/jpeg",
    );
    expect(result).toBeNull();
  });

  it("base64 部の無い DataURL（PNG 経路）は null を返す", async () => {
    const result = await readExifTiffFromDataUrl("data:image/png", "image/png");
    expect(result).toBeNull();
  });
});
