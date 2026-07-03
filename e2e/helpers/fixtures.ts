import piexif from "piexifjs";

/**
 * E2E テスト用の画像フィクスチャ生成ヘルパー
 * Playwright の setInputFiles にはファイルパスの代わりに
 * { name, mimeType, buffer } を渡せるため、バイナリをリポジトリに置かず実行時に生成する
 */

// 1x1 ピクセルの PNG
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// 1x1 ピクセルの最小 JPEG（EXIF なし）
const BASE_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

/** setInputFiles に渡せる 1x1 PNG ファイル */
export const pngFile = (name = "sample.png") => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(PNG_1PX_BASE64, "base64"),
});

/** GPS・カメラ情報入りの EXIF を埋め込んだ JPEG ファイル */
export const jpegFileWithExif = (name = "with-exif.jpg") => {
  const exifObj = {
    "0th": {
      [piexif.ImageIFD.Make]: "TestMake",
      [piexif.ImageIFD.Model]: "TestModel",
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: "2024:01:01 00:00:00",
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [
        [35, 1],
        [40, 1],
        [0, 1],
      ] as unknown as number[],
      [piexif.GPSIFD.GPSLongitudeRef]: "E",
      [piexif.GPSIFD.GPSLongitude]: [
        [139, 1],
        [45, 1],
        [0, 1],
      ] as unknown as number[],
    },
  };
  const exifBytes = piexif.dump(exifObj);
  const dataUrl = piexif.insert(
    exifBytes,
    `data:image/jpeg;base64,${BASE_JPEG_BASE64}`,
  );
  return {
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  };
};

/** ダウンロードした JPEG バイナリから EXIF を読み出す */
export const loadExifFromBuffer = (buf: Buffer) => {
  return piexif.load(`data:image/jpeg;base64,${buf.toString("base64")}`);
};

/** バイナリの先頭がフォーマットのマジックナンバーと一致するか */
export const magicNumber = {
  isJpeg: (buf: Buffer) =>
    buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  isPng: (buf: Buffer) =>
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
  isWebp: (buf: Buffer) =>
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP",
};
