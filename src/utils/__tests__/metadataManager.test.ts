import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "../imageUtils";
import { assessPrivacyRisk, removeMetadataFromImage } from "../metadataManager";

// 1x1 ピクセルの最小 JPEG（EXIF なし）
const BASE_JPEG_DATA_URL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

/** GPS・カメラ情報入りの EXIF を埋め込んだ JPEG ファイルを生成する */
const createJpegFileWithExif = (): File => {
  const exifObj = {
    "0th": {
      [piexif.ImageIFD.Make]: "TestMake",
      [piexif.ImageIFD.Model]: "TestModel",
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: "2024:01:01 00:00:00",
    },
    GPS: {
      // GPSVersionID はタグ ID が 0 のため、truthiness 判定による削除漏れの回帰検知に使う
      [piexif.GPSIFD.GPSVersionID]: [2, 3, 0, 0] as unknown as number[],
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [
        [35, 1],
        [40, 1],
        [0, 1],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: "E",
      [piexif.GPSIFD.GPSLongitude]: [
        [139, 1],
        [45, 1],
        [0, 1],
      ],
    },
  };
  const exifBytes = piexif.dump(exifObj);
  const dataUrlWithExif = piexif.insert(exifBytes, BASE_JPEG_DATA_URL);
  const blob = dataUrlToBlob(dataUrlWithExif, "image/jpeg");
  return new File([blob], "test.jpg", { type: "image/jpeg" });
};

/** File を DataURL に変換して EXIF を読み出す */
const loadExifFromFile = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return piexif.load(`data:image/jpeg;base64,${base64}`);
};

describe("assessPrivacyRisk", () => {
  it("GPS 情報があれば高リスクと判定する", () => {
    expect(assessPrivacyRisk({ GPSLatitude: "35.66" })).toBe("high");
    expect(assessPrivacyRisk({ gpsAltitude: "100" })).toBe("high");
  });

  it("日時・機器情報があれば中リスクと判定する", () => {
    expect(assessPrivacyRisk({ Make: "Canon" })).toBe("medium");
    expect(assessPrivacyRisk({ DateTimeOriginal: "2024:01:01" })).toBe(
      "medium",
    );
  });

  it("リスクのあるタグがなければ低リスクと判定する", () => {
    expect(assessPrivacyRisk({ ImageWidth: 100, Orientation: 1 })).toBe("low");
    expect(assessPrivacyRisk({})).toBe("low");
  });
});

describe("removeMetadataFromImage", () => {
  it("フィクスチャの JPEG に EXIF が正しく埋め込まれている", async () => {
    const file = createJpegFileWithExif();
    const exif = await loadExifFromFile(file);

    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
    expect(exif.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBe(
      "2024:01:01 00:00:00",
    );
  });

  it("GPS を指定すると GPS 情報のみ削除され、他のタグは残る", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(file, ["GPS"]);
    const exif = await loadExifFromFile(result);

    expect(Object.keys(exif.GPS ?? {})).toHaveLength(0);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
    expect(exif["0th"]?.[piexif.ImageIFD.Model]).toBe("TestModel");
    expect(exif.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBe(
      "2024:01:01 00:00:00",
    );
  });

  it("Make を指定すると Make のみ削除され、Model や GPS は残る", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(file, ["Make"]);
    const exif = await loadExifFromFile(result);

    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBeUndefined();
    expect(exif["0th"]?.[piexif.ImageIFD.Model]).toBe("TestModel");
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
  });

  it("複数タグを同時に削除できる", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(file, [
      "GPS",
      "Make",
      "DateTimeOriginal",
    ]);
    const exif = await loadExifFromFile(result);

    expect(Object.keys(exif.GPS ?? {})).toHaveLength(0);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBeUndefined();
    expect(exif.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBeUndefined();
    expect(exif["0th"]?.[piexif.ImageIFD.Model]).toBe("TestModel");
  });

  it("GPSLatitudeRef / GPSLongitudeRef など Ref 系の GPS タグも個別削除できる", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(file, [
      "GPSVersionID",
      "GPSLatitude",
      "GPSLatitudeRef",
      "GPSLongitude",
      "GPSLongitudeRef",
    ]);
    const exif = await loadExifFromFile(result);

    // Ref 系タグの取りこぼしがないこと（過去に GPSLatitudeRef 等が残存するバグがあった）
    // GPSVersionID（タグ ID = 0）も削除され、GPS IFD が完全に空になること
    expect(Object.keys(exif.GPS ?? {})).toHaveLength(0);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
  });

  it("削除対象タグが空の場合は元のファイルをそのまま返す", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(file, []);
    expect(result).toBe(file);
  });

  it("ファイル名と MIME タイプは削除後も維持される", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(file, ["GPS"]);
    expect(result.name).toBe("test.jpg");
    expect(result.type).toBe("image/jpeg");
  });
});
