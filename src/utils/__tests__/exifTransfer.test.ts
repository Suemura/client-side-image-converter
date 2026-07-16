import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { buildSyntheticJpegFromTiff, piexifDumpToTiff } from "../exifBinary";
import {
  exifWritableFormat,
  normalizeExifForBakedImage,
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

    const normalized = normalizeExifForBakedImage(tiff, 100, 200);
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
    const normalized = normalizeExifForBakedImage(tiff, 100, 200);
    const ifd = load0thIfd(normalized);
    // Make は保持され、Orientation は 1 が付与される
    expect(ifd[piexif.ImageIFD.Make]).toBe("NoOrientation");
    expect(ifd[piexif.ImageIFD.Orientation]).toBe(1);
  });

  it("実ピクセル寸法タグが存在する場合は焼き込み後の実寸へ更新する", () => {
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

    const normalized = normalizeExifForBakedImage(tiff, 3000, 4000);
    const exifIfd = loadExifIfd(normalized);
    expect(exifIfd[piexif.ExifIFD.PixelXDimension]).toBe(3000);
    expect(exifIfd[piexif.ExifIFD.PixelYDimension]).toBe(4000);
    // Orientation も併せて 1 に揃う
    expect(load0thIfd(normalized)[piexif.ImageIFD.Orientation]).toBe(1);
  });

  it("実ピクセル寸法タグが無い画像には寸法タグを新規追加しない", () => {
    const tiff = piexifDumpToTiff(
      piexif.dump({
        "0th": { [piexif.ImageIFD.Orientation]: 1 },
        Exif: {},
        GPS: {},
      }),
    );

    const normalized = normalizeExifForBakedImage(tiff, 300, 400);
    const exifIfd = loadExifIfd(normalized);
    expect(piexif.ExifIFD.PixelXDimension in exifIfd).toBe(false);
    expect(piexif.ExifIFD.PixelYDimension in exifIfd).toBe(false);
  });

  describe("stripThumbnail オプション（レタッチ経路の未編集画像リーク防止）", () => {
    // 1x1 ピクセルの最小 JPEG（e2e/helpers/fixtures.ts の BASE_JPEG_BASE64 と同一）。
    // piexif.dump はサムネイルの JPEG セグメントを実際にパースするため実在する JPEG が必要
    const THUMBNAIL_JPEG_BASE64 =
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";
    const FAKE_THUMBNAIL = atob(THUMBNAIL_JPEG_BASE64);

    /** IFD1 + サムネイル入りの純 TIFF を生成する */
    const buildTiffWithThumbnail = (): Uint8Array =>
      piexifDumpToTiff(
        piexif.dump({
          "0th": {
            [piexif.ImageIFD.Orientation]: 6,
            [piexif.ImageIFD.Make]: "TestMake",
          },
          Exif: {},
          GPS: {},
          // IFD1 のタグ（256 = ImageWidth / 257 = ImageLength。型定義に無いため生番号で指定）
          "1st": {
            256: 160,
            257: 120,
          },
          thumbnail: FAKE_THUMBNAIL,
        }),
      );

    it("IFD1（EXIF サムネイル）を除去し、他のタグは保持する", () => {
      const tiff = buildTiffWithThumbnail();
      // 前提: 元の TIFF はサムネイルを持つ
      const before = loadExif(tiff);
      expect(before.thumbnail).toBeTruthy();

      const normalized = normalizeExifForBakedImage(tiff, 100, 200, {
        stripThumbnail: true,
      });
      const after = loadExif(normalized);
      // サムネイルと IFD1 が除去されている（レタッチ前画像が残らない）
      expect(after.thumbnail ?? null).toBeNull();
      expect(Object.keys(after["1st"] ?? {})).toHaveLength(0);
      // 0th のタグと Orientation 正規化は通常どおり
      expect(after["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
      expect(after["0th"]?.[piexif.ImageIFD.Orientation]).toBe(1);
    });

    it("stripThumbnail なしではサムネイルが保持される（既存経路の互換）", () => {
      const tiff = buildTiffWithThumbnail();
      const normalized = normalizeExifForBakedImage(tiff, 100, 200);
      expect(loadExif(normalized).thumbnail).toBeTruthy();
    });

    it("サムネイルが無い TIFF でも例外を投げず正常に処理する", () => {
      const tiff = piexifDumpToTiff(
        piexif.dump({
          "0th": { [piexif.ImageIFD.Make]: "NoThumb" },
          Exif: {},
          GPS: {},
        }),
      );
      const normalized = normalizeExifForBakedImage(tiff, 100, 200, {
        stripThumbnail: true,
      });
      expect(load0thIfd(normalized)[piexif.ImageIFD.Make]).toBe("NoThumb");
    });

    it("正規化に失敗した場合、stripThumbnail 指定時は元 TIFF を返さず例外を投げる", () => {
      // パース不能な壊れた TIFF。通常経路は「EXIF 保持を優先」して元 TIFF を返すが、
      // stripThumbnail 指定時は未編集サムネイルが残り得るため失敗させる
      const broken = new Uint8Array([1, 2, 3, 4]);
      expect(normalizeExifForBakedImage(broken, 100, 200)).toBe(broken);
      expect(() =>
        normalizeExifForBakedImage(broken, 100, 200, { stripThumbnail: true }),
      ).toThrow();
    });
  });
});
