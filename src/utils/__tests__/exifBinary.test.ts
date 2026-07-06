import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import {
  addExifIdentifier,
  binaryStringToUint8Array,
  buildSyntheticJpegFromTiff,
  crc32,
  extractPngExif,
  extractWebpExif,
  insertPngExif,
  insertWebpExif,
  piexifDumpToTiff,
  stripExifIdentifier,
  tiffToPiexifDump,
  uint8ArrayToBinaryString,
} from "../exifBinary";

// 1x1 ピクセルの PNG（e2e/helpers/fixtures.ts と同じ実データ）
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const pngBytes = (): Uint8Array =>
  new Uint8Array(Buffer.from(PNG_1PX_BASE64, "base64"));

/** テスト用の TIFF（純 TIFF、識別子なし）を piexif で生成する */
const sampleTiff = (): Uint8Array => {
  const exifObj = {
    "0th": {
      [piexif.ImageIFD.Make]: "TestMake",
      [piexif.ImageIFD.Model]: "TestModel",
    },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [
        [35, 1],
        [40, 1],
        [0, 1],
      ] as unknown as number[],
    },
  };
  return piexifDumpToTiff(piexif.dump(exifObj));
};

/**
 * 構造上妥当な最小の WebP（RIFF/WEBP + 単純 VP8 チャンク）を組み立てる。
 * VP8 ビットストリームは検証されないためダミーバイトで良い（RIFF パーサの検証用）。
 */
const fakeSimpleWebp = (payloadLen = 10): Uint8Array => {
  const vp8Payload = new Uint8Array(payloadLen).fill(0xaa);
  const chunkSize = 8 + vp8Payload.length;
  const riffSize = 4 + chunkSize; // "WEBP" + VP8 チャンク
  const buf = new Uint8Array(8 + riffSize);
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  buf[4] = riffSize & 0xff;
  buf[5] = (riffSize >>> 8) & 0xff;
  buf[6] = (riffSize >>> 16) & 0xff;
  buf[7] = (riffSize >>> 24) & 0xff;
  buf.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  buf.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  buf[16] = vp8Payload.length & 0xff;
  buf[17] = (vp8Payload.length >>> 8) & 0xff;
  buf[18] = (vp8Payload.length >>> 16) & 0xff;
  buf[19] = (vp8Payload.length >>> 24) & 0xff;
  buf.set(vp8Payload, 20);
  return buf;
};

describe("crc32", () => {
  it('既知ベクトル crc32("123456789") = 0xCBF43926 を返す', () => {
    const bytes = new Uint8Array([
      ..."123456789".split("").map((c) => c.charCodeAt(0)),
    ]);
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});

describe("EXIF 識別子の付け外し", () => {
  it("addExifIdentifier / stripExifIdentifier は往復で一致する", () => {
    const tiff = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x01, 0x02]);
    const withId = addExifIdentifier(tiff);
    expect(Array.from(withId.subarray(0, 6))).toEqual([
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ]);
    expect(Array.from(stripExifIdentifier(withId))).toEqual(Array.from(tiff));
  });

  it("addExifIdentifier は冪等（既に識別子付きなら二重付与しない）", () => {
    const tiff = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]);
    const once = addExifIdentifier(tiff);
    const twice = addExifIdentifier(once);
    expect(Array.from(twice)).toEqual(Array.from(once));
  });

  it("識別子なしの純 TIFF に stripExifIdentifier を適用しても変化しない", () => {
    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
    expect(Array.from(stripExifIdentifier(tiff))).toEqual(Array.from(tiff));
  });
});

describe("バイナリ文字列変換 / piexif 相互運用", () => {
  it("uint8ArrayToBinaryString / binaryStringToUint8Array は往復で一致する", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 0x45]);
    expect(
      Array.from(binaryStringToUint8Array(uint8ArrayToBinaryString(bytes))),
    ).toEqual(Array.from(bytes));
  });

  it("piexifDumpToTiff / tiffToPiexifDump で piexif dump 文字列と往復できる", () => {
    const dump = piexif.dump({
      "0th": { [piexif.ImageIFD.Make]: "TestMake" },
    });
    const tiff = piexifDumpToTiff(dump);
    // 純 TIFF には "Exif\0\0" 識別子が付かない
    expect(Array.from(tiff.subarray(0, 6))).not.toEqual([
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ]);
    // 復元した dump 文字列を piexif.insert が受理できる（識別子が復活している）
    expect(tiffToPiexifDump(tiff).slice(0, 6)).toBe("Exif\x00\x00");
  });
});

describe("PNG eXIf チャンク", () => {
  it("EXIF なしの PNG からは null を返す", () => {
    expect(extractPngExif(pngBytes())).toBeNull();
  });

  it("insertPngExif → extractPngExif で TIFF が往復一致する", () => {
    const tiff = sampleTiff();
    const withExif = insertPngExif(pngBytes(), tiff);
    // PNG シグネチャは保持される
    expect(Array.from(withExif.subarray(0, 4))).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    const extracted = extractPngExif(withExif);
    expect(extracted).not.toBeNull();
    expect(Array.from(extracted as Uint8Array)).toEqual(Array.from(tiff));
  });

  it("再挿入しても eXIf チャンクは重複せず置換される", () => {
    const first = insertPngExif(pngBytes(), sampleTiff());
    const second = insertPngExif(first, sampleTiff());
    // eXIf の出現回数が 1 であることをバイト列走査で確認する
    let count = 0;
    for (let i = 0; i + 4 <= second.length; i++) {
      if (
        second[i] === 0x65 &&
        second[i + 1] === 0x58 &&
        second[i + 2] === 0x49 &&
        second[i + 3] === 0x66
      ) {
        count++;
      }
    }
    expect(count).toBe(1);
  });

  it("挿入した EXIF は合成 JPEG 経由で piexif が読める", () => {
    const withExif = insertPngExif(pngBytes(), sampleTiff());
    const tiff = extractPngExif(withExif) as Uint8Array;
    const jpeg = buildSyntheticJpegFromTiff(tiff);
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
    const exif = piexif.load(dataUrl);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
  });
});

describe("WebP EXIF チャンク", () => {
  it("EXIF なしの WebP からは null を返す", () => {
    expect(extractWebpExif(fakeSimpleWebp())).toBeNull();
  });

  it("単純 VP8 形式に挿入すると VP8X へ変換され EXIF フラグが立つ", () => {
    const withExif = insertWebpExif(fakeSimpleWebp(), sampleTiff(), 1, 1);
    // RIFF/WEBP は維持
    expect(String.fromCharCode(...withExif.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...withExif.subarray(8, 12))).toBe("WEBP");
    // 先頭チャンクが VP8X
    expect(String.fromCharCode(...withExif.subarray(12, 16))).toBe("VP8X");
    // VP8X ペイロード先頭バイトに EXIF フラグ(0x08)が立っている
    expect(withExif[20] & 0x08).toBe(0x08);
  });

  it("insertWebpExif → extractWebpExif で TIFF が往復一致する", () => {
    const tiff = sampleTiff();
    const withExif = insertWebpExif(fakeSimpleWebp(), tiff, 2, 3);
    const extracted = extractWebpExif(withExif);
    expect(extracted).not.toBeNull();
    expect(Array.from(extracted as Uint8Array)).toEqual(Array.from(tiff));
  });

  it("奇数長 TIFF でもパディングされ、再パースが破綻しない", () => {
    // 奇数長の TIFF を作る（sampleTiff が偶数ならもう1バイト足す）
    const base = sampleTiff();
    const oddTiff =
      base.length % 2 === 1
        ? base
        : (() => {
            const t = new Uint8Array(base.length + 1);
            t.set(base, 0);
            t[base.length] = 0x00;
            return t;
          })();
    const withExif = insertWebpExif(fakeSimpleWebp(11), oddTiff, 1, 1);
    // パディングされても extractWebpExif は正しいペイロード長を返す
    const extracted = extractWebpExif(withExif) as Uint8Array;
    expect(Array.from(extracted)).toEqual(Array.from(oddTiff));
  });

  it("既に VP8X の WebP はフラグを OR し EXIF を置換する", () => {
    const first = insertWebpExif(fakeSimpleWebp(), sampleTiff(), 4, 5);
    // 一度 VP8X 化したものに再挿入
    const second = insertWebpExif(first, sampleTiff(), 4, 5);
    expect(String.fromCharCode(...second.subarray(12, 16))).toBe("VP8X");
    // EXIF チャンクは 1 つだけ
    const chunks: string[] = [];
    let offset = 12;
    while (offset + 8 <= second.length) {
      const cc = String.fromCharCode(...second.subarray(offset, offset + 4));
      const size =
        second[offset + 4] |
        (second[offset + 5] << 8) |
        (second[offset + 6] << 16) |
        (second[offset + 7] << 24);
      chunks.push(cc);
      offset = offset + 8 + size + (size & 1);
    }
    expect(chunks.filter((c) => c === "EXIF")).toHaveLength(1);
    expect(chunks.filter((c) => c === "VP8X")).toHaveLength(1);
  });

  it("挿入した EXIF は合成 JPEG 経由で piexif が読める", () => {
    const withExif = insertWebpExif(fakeSimpleWebp(), sampleTiff(), 1, 1);
    const tiff = extractWebpExif(withExif) as Uint8Array;
    const jpeg = buildSyntheticJpegFromTiff(tiff);
    const dataUrl = `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`;
    const exif = piexif.load(dataUrl);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
  });
});
