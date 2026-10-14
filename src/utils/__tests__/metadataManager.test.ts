import piexif from "piexifjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dataUrlToBlob } from "../imageUtils";
import {
  assessPrivacyRisk,
  decimalToGpsRationals,
  gpsRationalsToDecimal,
  removeMetadataFromImage,
} from "../metadataManager";

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
      // 緯度・経度以外の GPS サブタグ（標高・撮影時刻・撮影方向）。
      // 丸めモードでこれらが削除されることの検証に使う
      [piexif.GPSIFD.GPSAltitudeRef]: 0,
      [piexif.GPSIFD.GPSAltitude]: [100, 1] as unknown as number[],
      [piexif.GPSIFD.GPSTimeStamp]: [
        [12, 1],
        [30, 1],
        [0, 1],
      ],
      [piexif.GPSIFD.GPSDateStamp]: "2024:01:01",
      [piexif.GPSIFD.GPSImgDirection]: [90, 1] as unknown as number[],
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
      "GPSAltitudeRef",
      "GPSAltitude",
      "GPSTimeStamp",
      "GPSDateStamp",
      "GPSImgDirection",
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

  it("GPS 丸めモードでは緯度・経度は丸めて残し、副次 GPS タグと非 GPS タグは削除される", async () => {
    const file = createJpegFileWithExif();
    const result = await removeMetadataFromImage(
      file,
      [
        "GPSLatitude",
        "GPSLatitudeRef",
        "GPSLongitude",
        "GPSLongitudeRef",
        "GPSAltitude",
        "GPSTimeStamp",
        "GPSDateStamp",
        "GPSImgDirection",
        "Make",
      ],
      {
        roundGpsInsteadOfRemove: true,
      },
    );
    const exif = await loadExifFromFile(result);

    // 緯度・経度（と Ref）は残っている（完全削除されていない）
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitude]).toBeDefined();
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
    expect(exif.GPS?.[piexif.GPSIFD.GPSLongitude]).toBeDefined();
    // 緯度は元の 35.6667 が 2 桁（35.67）に丸められている
    const lat = gpsRationalsToDecimal(
      exif.GPS?.[piexif.GPSIFD.GPSLatitude] as unknown as number[][],
      exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef] as string,
    );
    expect(lat).toBeCloseTo(35.67, 2);
    // 緯度・経度以外の GPS サブタグ（標高・撮影時刻・日付・撮影方向）は
    // 丸めモードでも削除され、位置以外の情報が残存しない
    expect(exif.GPS?.[piexif.GPSIFD.GPSAltitude]).toBeUndefined();
    expect(exif.GPS?.[piexif.GPSIFD.GPSTimeStamp]).toBeUndefined();
    expect(exif.GPS?.[piexif.GPSIFD.GPSDateStamp]).toBeUndefined();
    expect(exif.GPS?.[piexif.GPSIFD.GPSImgDirection]).toBeUndefined();
    // 非 GPS タグ（Make）は削除されている
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBeUndefined();
    // 選択されていない Model は残る
    expect(exif["0th"]?.[piexif.ImageIFD.Model]).toBe("TestModel");
  });
});

describe("analyzeMetadata の失敗記録", () => {
  afterEach(() => {
    vi.doUnmock("exif-js");
    vi.resetModules();
  });

  /** ファイル読み取り（arrayBuffer）が失敗する WebP ファイルを作る（解析失敗の再現用） */
  const createUnreadableWebpFile = (name: string): File => {
    const file = new File(["x"], name, { type: "image/webp" });
    Object.defineProperty(file, "arrayBuffer", {
      value: () => Promise.reject(new Error("read failed")),
    });
    return file;
  };

  it("exif-js の読み込みに失敗した場合、reject せず analysisFailures に記録する", async () => {
    // 動的 import の失敗（デプロイ直後のチャンクハッシュ入れ替わり等）を再現する。
    // vitest のモジュールモックは並列の動的 import と競合するため 1 ファイルで検証する
    vi.doMock("exif-js", () => {
      throw new Error("chunk load failed");
    });
    vi.resetModules();
    const { analyzeMetadata } = await import("../metadataManager");

    const result = await analyzeMetadata([
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
    ]);

    expect(result.analysisFailures).toEqual(["a.jpg"]);
    // 失敗ファイルも fileMetadata に残る（後段の削除処理の対象から外さない）
    expect(result.fileMetadata).toHaveLength(1);
    expect(result.fileMetadata[0].exifData).toEqual({});
    expect(result.allTags.size).toBe(0);
  });

  it("一部ファイルのみ解析に失敗した場合、成功分の結果と失敗ファイル名の両方を返す", async () => {
    const { analyzeMetadata } = await import("../metadataManager");

    const files = [
      createJpegFileWithExif(),
      createUnreadableWebpFile("bad.webp"),
    ];
    const result = await analyzeMetadata(files);

    expect(result.analysisFailures).toEqual(["bad.webp"]);
    expect(result.fileMetadata).toHaveLength(2);
    expect(
      result.fileMetadata.find((fm) => fm.file.name === "bad.webp")?.exifData,
    ).toEqual({});
  });

  it("全ファイルの解析に成功した場合、analysisFailures は空になる", async () => {
    const { analyzeMetadata } = await import("../metadataManager");

    const result = await analyzeMetadata([
      createJpegFileWithExif(),
      createJpegFileWithExif(),
    ]);

    expect(result.analysisFailures).toEqual([]);
    expect(result.fileMetadata).toHaveLength(2);
  });
});

describe("GPS 座標の十進変換", () => {
  it("度分秒と Ref から十進度に変換する（N は正、S/W は負）", () => {
    expect(
      gpsRationalsToDecimal(
        [
          [35, 1],
          [40, 1],
          [0, 1],
        ],
        "N",
      ),
    ).toBeCloseTo(35.6667, 3);
    expect(
      gpsRationalsToDecimal(
        [
          [139, 1],
          [45, 1],
          [0, 1],
        ],
        "W",
      ),
    ).toBeCloseTo(-139.75, 3);
  });

  it("十進度→度分秒→十進度の往復で値が保持される", () => {
    const dms = decimalToGpsRationals(35.67);
    expect(gpsRationalsToDecimal(dms, "N")).toBeCloseTo(35.67, 4);
  });
});
