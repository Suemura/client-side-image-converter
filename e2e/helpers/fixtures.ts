import piexif from "piexifjs";
import {
  buildSyntheticJpegFromTiff,
  crc32,
  extractPngExif,
  extractWebpExif,
  insertPngExif,
  insertWebpExif,
  piexifDumpToTiff,
} from "../../src/utils/exifBinary";

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

// 1x1 ピクセルの最小 HEIC（macOS で `sips -s format heic tiny.png --out tiny.heic` により生成）
const HEIC_1PX_BASE64 =
  "AAAAGGZ0eXBoZWljAAAAAGhlaWNtaWYxAAACrG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABodmMxAAAAABVpbmZlAgAAAQACAABodmMxAAAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAABz2lwcnAAAAGkaXBjbwAAABNjb2xybmNseAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAACAAAAAgAAAChjbGFwAAAAAQAAAAEAAAABAAAAAf/AAAAAgAAA/8AAAACAAAAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAADnBpeGkAAAAAAQgAAAA3YXV4QwAAAAB1cm46bXBlZzpoZXZjOjIwMTU6YXV4aWQ6MQAAAAAMAAAACE4BpQQAAf5AAAAAcmh2Y0MBA3AAAACwAAAAAAAe8AD8/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAJEIBAQNwAAADALAAAAMAAAMAHqAUIEHAoQQYh7kWVTcCAgYAgKIAAQAJRAHAYXLIQFMkAAAAcWh2Y0MBBAgAAAC/yAAAAAAe8AD8/Pj4AAALA6AAAQAXQAEMAf//BAgAAAMAv8gAAAMAAB4XAkChAAEAI0IBAQQIAAADAL/IAAADAAAewFCBBwE/B/iBe5FlU3AgICAIogABAAlEAcBh0shAUyQAAAAjaXBtYQAAAAAAAAACAAEHgQIDBomEhQACBgMHiIqEhQAAACxpbG9jAAAAAEQAAAIAAQAAAAEAAALUAAAAWAACAAAAAQAAAywAAAAoAAAAAW1kYXQAAAAAAAAAkAAAAFQoAa+jxoAQ1IzpAign/oAc1pyp+Fkfh9paeP//r2oQCawhb9NlmdTLPkgjyxLX/8pqgBwbwplJwUJe9mqeSeq1cX2w8X33elooWaL8YDOjoDWXvGAAAAAkKAGvRcwnHh7FsjO1L5CbgJP3cRg1fD9WFr8lfuzSLFVT9sBw";

/**
 * setInputFiles に渡せる 1x1 HEIC ファイル
 * mimeType に空文字を渡すと Playwright が拡張子から推測するため、
 * MIME 不明ケースは "application/octet-stream" を明示的に指定する
 */
export const heicFile = (name = "sample.heic", mimeType = "image/heic") => ({
  name,
  mimeType,
  buffer: Buffer.from(HEIC_1PX_BASE64, "base64"),
});

// 1x1 ピクセルの非圧縮 TIFF（macOS で `sips -s format tiff tiny.png --out tiny.tiff` により生成）
const TIFF_1PX_BASE64 =
  "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";

/**
 * setInputFiles に渡せる 1x1 TIFF ファイル
 * MIME 不明ケースは "application/octet-stream" を明示的に指定する（heicFile と同様）
 */
export const tiffFile = (name = "sample.tiff", mimeType = "image/tiff") => ({
  name,
  mimeType,
  buffer: Buffer.from(TIFF_1PX_BASE64, "base64"),
});

// 1x1 ピクセルの BMP（macOS で `sips -s format bmp tiny.png --out tiny.bmp` により生成）
const BMP_1PX_BASE64 =
  "Qk2OAAAAAAAAAIoAAAB8AAAAAQAAAP////8BACAAAwAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AAD/AAD/AAAAAAAA/0JHUnMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAfw==";

/** setInputFiles に渡せる 1x1 BMP ファイル */
export const bmpFile = (name = "sample.bmp") => ({
  name,
  mimeType: "image/bmp",
  buffer: Buffer.from(BMP_1PX_BASE64, "base64"),
});

/**
 * 目標ファイルサイズ探索の検証用に、圧縮しにくい高周波パターンの 24bit BMP を実行時生成する。
 * 乱数を使わず決定論的なハッシュでピクセルを塗るため、生成結果とエンコード後サイズが安定する
 * （品質を下げると顕著にサイズが縮むので二分探索が意味を持つ大きさになる）。
 */
export const noisyBmpFile = (name = "noisy.bmp", width = 400, height = 400) => {
  // 24bit BMP の各行は 4 バイト境界にパディングされる
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);

  // BMP ファイルヘッダー（14 バイト）
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // ピクセルデータ開始オフセット

  // DIB ヘッダー（BITMAPINFOHEADER、40 バイト）
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // プレーン数
  buf.writeUInt16LE(24, 28); // ビット深度（24bit）
  buf.writeUInt32LE(0, 30); // BI_RGB（無圧縮）
  buf.writeUInt32LE(pixelDataSize, 34);

  // 決定論的ハッシュで各ピクセルを塗る（ノイズ状で JPEG/WebP が圧縮しにくい）
  for (let y = 0; y < height; y++) {
    const rowStart = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const h = (x * 374761393 + y * 668265263) >>> 0;
      const n = (h ^ (h >>> 13)) >>> 0;
      const p = rowStart + x * 3;
      buf[p] = n & 0xff; // B
      buf[p + 1] = (n >>> 8) & 0xff; // G
      buf[p + 2] = (n >>> 16) & 0xff; // R
    }
  }

  return { name, mimeType: "image/bmp", buffer: buf };
};

/** TIFF データ型のバイトサイズ（1=BYTE, 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 10=SRATIONAL） */
const TIFF_TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  10: 8,
};

/** DNG フィクスチャ生成用の IFD エントリ定義 */
interface DngTag {
  tag: number;
  type: number;
  /** RATIONAL / SRATIONAL は [分子, 分母] のペア列、ASCII は文字列 */
  values: number[] | Array<[number, number]> | string;
}

/** IFD エントリの値部分をリトルエンディアンでエンコードする */
const encodeTiffValues = (
  type: number,
  values: DngTag["values"],
): { bytes: Buffer; count: number } => {
  if (typeof values === "string") {
    const bytes = Buffer.from(`${values}\0`, "ascii");
    return { bytes, count: bytes.length };
  }
  if (type === 5 || type === 10) {
    const pairs = values as Array<[number, number]>;
    const bytes = Buffer.alloc(pairs.length * 8);
    pairs.forEach(([numerator, denominator], i) => {
      if (type === 5) {
        bytes.writeUInt32LE(numerator, i * 8);
        bytes.writeUInt32LE(denominator, i * 8 + 4);
      } else {
        bytes.writeInt32LE(numerator, i * 8);
        bytes.writeInt32LE(denominator, i * 8 + 4);
      }
    });
    return { bytes, count: pairs.length };
  }
  const nums = values as number[];
  const size = TIFF_TYPE_SIZES[type];
  const bytes = Buffer.alloc(nums.length * size);
  nums.forEach((value, i) => {
    if (type === 1) {
      bytes.writeUInt8(value, i);
    } else if (type === 3) {
      bytes.writeUInt16LE(value, i * 2);
    } else {
      bytes.writeUInt32LE(value, i * 4);
    }
  });
  return { bytes, count: nums.length };
};

/**
 * 最小構成の非圧縮ベイヤー CFA DNG（リトルエンディアン TIFF）を実行時生成する。
 * LibRaw が必要とするタグ（DNGVersion / CFAPattern / ColorMatrix1 / AsShotNeutral /
 * BlackLevel / WhiteLevel 等）を単一 IFD に持つ 16bit RGGB モザイクで、
 * RAW 入力対応の E2E 検証（LibRaw の実デコード）に使う。
 */
const buildMinimalDng = (width: number, height: number): Buffer => {
  // 16bit RGGB ベイヤーモザイク（R が強い一様パターン。デモザイク後も赤みが残る）
  const pixels = Buffer.alloc(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isRed = y % 2 === 0 && x % 2 === 0;
      const isBlue = y % 2 === 1 && x % 2 === 1;
      const value = isRed ? 58000 : isBlue ? 16000 : 32000;
      pixels.writeUInt16LE(value, (y * width + x) * 2);
    }
  }

  const tags: DngTag[] = [
    { tag: 254, type: 4, values: [0] }, // NewSubfileType: 主画像
    { tag: 256, type: 4, values: [width] }, // ImageWidth
    { tag: 257, type: 4, values: [height] }, // ImageLength
    { tag: 258, type: 3, values: [16] }, // BitsPerSample
    { tag: 259, type: 3, values: [1] }, // Compression: 非圧縮
    { tag: 262, type: 3, values: [32803] }, // PhotometricInterpretation: CFA
    { tag: 271, type: 2, values: "TestCam" }, // Make
    { tag: 272, type: 2, values: "DNG Fixture" }, // Model
    { tag: 273, type: 4, values: [0] }, // StripOffsets（レイアウト確定後にパッチする）
    { tag: 274, type: 3, values: [1] }, // Orientation
    { tag: 277, type: 3, values: [1] }, // SamplesPerPixel
    { tag: 278, type: 4, values: [height] }, // RowsPerStrip
    { tag: 279, type: 4, values: [pixels.length] }, // StripByteCounts
    { tag: 284, type: 3, values: [1] }, // PlanarConfiguration
    { tag: 33421, type: 3, values: [2, 2] }, // CFARepeatPatternDim
    { tag: 33422, type: 1, values: [0, 1, 1, 2] }, // CFAPattern: RGGB
    { tag: 50706, type: 1, values: [1, 4, 0, 0] }, // DNGVersion 1.4
    { tag: 50708, type: 2, values: "TestCam DNG" }, // UniqueCameraModel
    { tag: 50714, type: 3, values: [0] }, // BlackLevel
    { tag: 50717, type: 4, values: [65535] }, // WhiteLevel
    {
      // ColorMatrix1: XYZ→カメラ空間の単位行列（テスト用途では色再現精度は不要）
      tag: 50721,
      type: 10,
      values: [
        [1, 1],
        [0, 1],
        [0, 1],
        [0, 1],
        [1, 1],
        [0, 1],
        [0, 1],
        [0, 1],
        [1, 1],
      ],
    },
    {
      // AsShotNeutral: ニュートラル WB（useCameraWb がこの値を使う）
      tag: 50728,
      type: 5,
      values: [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
    },
    { tag: 50778, type: 3, values: [21] }, // CalibrationIlluminant1: D65
  ];

  // IFD エントリはタグ番号昇順が必須
  tags.sort((a, b) => a.tag - b.tag);
  const encoded = tags.map((t) => ({
    ...t,
    ...encodeTiffValues(t.type, t.values),
  }));

  // レイアウト: ヘッダー(8) + エントリ数(2) + エントリ(12*N) + 次IFD(4) + 溢れ値領域 + ピクセル
  const ifdStart = 8;
  const dataStart = ifdStart + 2 + tags.length * 12 + 4;
  let dataOffset = dataStart;
  const overflowOffsets = new Map<number, number>();
  for (const entry of encoded) {
    if (entry.bytes.length > 4) {
      overflowOffsets.set(entry.tag, dataOffset);
      // TIFF の値はワード境界に置く（偶数アライン）
      dataOffset += entry.bytes.length + (entry.bytes.length % 2);
    }
  }
  const pixelOffset = dataOffset;

  const buf = Buffer.alloc(pixelOffset + pixels.length);
  // TIFF ヘッダー（リトルエンディアン "II" + マジック 42 + IFD オフセット）
  buf.write("II", 0, "ascii");
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdStart, 4);
  buf.writeUInt16LE(tags.length, ifdStart);

  encoded.forEach((entry, i) => {
    const entryOffset = ifdStart + 2 + i * 12;
    buf.writeUInt16LE(entry.tag, entryOffset);
    buf.writeUInt16LE(entry.type, entryOffset + 2);
    buf.writeUInt32LE(entry.count, entryOffset + 4);
    // StripOffsets はピクセル領域のオフセットへ差し替える
    const bytes =
      entry.tag === 273
        ? (() => {
            const patched = Buffer.alloc(4);
            patched.writeUInt32LE(pixelOffset, 0);
            return patched;
          })()
        : entry.bytes;
    if (bytes.length > 4) {
      const overflowOffset = overflowOffsets.get(entry.tag);
      if (overflowOffset === undefined) {
        throw new Error(
          `DNG フィクスチャの溢れ値オフセットが未割当: ${entry.tag}`,
        );
      }
      buf.writeUInt32LE(overflowOffset, entryOffset + 8);
      bytes.copy(buf, overflowOffset);
    } else {
      bytes.copy(buf, entryOffset + 8);
    }
  });
  // 次の IFD なし
  buf.writeUInt32LE(0, ifdStart + 2 + tags.length * 12);
  pixels.copy(buf, pixelOffset);
  return buf;
};

/**
 * setInputFiles に渡せる 32x32 の最小 DNG（RAW）ファイル
 * LibRaw（dcraw 由来）は幅・高さ 22px 未満を RAW と認識しないため 32x32 とする。
 * MIME 不明ケースは "application/octet-stream" を明示的に指定する（heicFile と同様）
 */
export const dngFile = (
  name = "sample.dng",
  mimeType = "image/x-adobe-dng",
) => ({
  name,
  mimeType,
  buffer: buildMinimalDng(32, 32),
});

/** zlib（stored ブロック）用の adler32 チェックサム */
const adler32 = (data: Uint8Array): number => {
  const MOD = 65521;
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
};

/** PNG チャンク（length + type + data + crc32）を組み立てる */
const buildPngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = Uint8Array.from(type, (c) => c.charCodeAt(0));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(4 + body.length, crc32(body));
  return out;
};

/**
 * 幅・高さと「ピクセルごとの色を返す関数」から、外部ライブラリなしで有効な PNG を組み立てる。
 * 圧縮は zlib の stored（無圧縮）ブロックで行う。単色・二色・透過などの検証用画像生成の共通土台。
 * カラータイプ 2（RGB、3 チャンネル）と 6（RGBA、4 チャンネル）に対応する。
 */
const buildPng = (
  width: number,
  height: number,
  colorType: 2 | 6,
  colorAt: (x: number, y: number) => number[],
): Uint8Array => {
  const channels = colorType === 6 ? 4 : 3;

  // IHDR: 幅・高さ・ビット深度 8・カラータイプ
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;

  // 各行の先頭にフィルタバイト 0 を付けた生ピクセル列
  const rowLength = 1 + width * channels;
  const raw = new Uint8Array(rowLength * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * channels;
      const color = colorAt(x, y);
      for (let c = 0; c < channels; c++) {
        raw[p + c] = color[c];
      }
    }
  }

  // zlib（0x78 0x01）+ stored ブロック（無圧縮）+ adler32
  const stream: number[] = [0x78, 0x01];
  let offset = 0;
  while (offset < raw.length || raw.length === 0) {
    const len = Math.min(65535, raw.length - offset);
    const isFinal = offset + len >= raw.length;
    stream.push(isFinal ? 0x01 : 0x00);
    stream.push(len & 0xff, (len >> 8) & 0xff);
    const nlen = ~len & 0xffff;
    stream.push(nlen & 0xff, (nlen >> 8) & 0xff);
    for (let i = 0; i < len; i++) {
      stream.push(raw[offset + i]);
    }
    offset += len;
    if (isFinal) break;
  }
  const adler = adler32(raw);
  stream.push(
    (adler >>> 24) & 0xff,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  );

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    signature,
    buildPngChunk("IHDR", ihdr),
    buildPngChunk("IDAT", new Uint8Array(stream)),
    buildPngChunk("IEND", new Uint8Array(0)),
  ];
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const png = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    png.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return png;
};

/**
 * 指定サイズ・単色の RGB PNG を実行時生成する（非正方形の検証用）。
 * 回転で縦横が入れ替わること・アスペクト比プリセットで正方形に切り出せることの検証に使う。
 */
export const rectPngFile = (
  name = "rect.png",
  width = 40,
  height = 20,
  color: [number, number, number] = [200, 60, 40],
) => {
  const png = buildPng(width, height, 2, () => color);
  return { name, mimeType: "image/png", buffer: Buffer.from(png) };
};

/**
 * 上半分と下半分で色が異なる二色の RGB PNG を実行時生成する。
 * 画像編集の描画パイプライン（WebGL の Y 反転など）で上下が入れ替わらないことの検証に使う。
 */
export const twoToneVerticalPngFile = (
  name = "twotone.png",
  width = 16,
  height = 16,
  top: [number, number, number] = [230, 230, 230],
  bottom: [number, number, number] = [20, 20, 20],
) => {
  const png = buildPng(width, height, 2, (_x, y) =>
    y < height / 2 ? top : bottom,
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(png) };
};

/**
 * 左半分が不透明の赤・右半分が完全透過の RGBA PNG を実行時生成する。
 * アルファ非対応形式（JPEG）への変換で透過部分が白背景に合成されることの検証に使う。
 */
export const transparentPngFile = (
  name = "transparent.png",
  width = 64,
  height = 64,
) => {
  const png = buildPng(width, height, 6, (x) =>
    x < width / 2 ? [255, 0, 0, 255] : [0, 0, 0, 0],
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(png) };
};

/**
 * 左半分が 1px の赤/青チェッカーボード・右半分が白の RGB PNG を実行時生成する。
 * 高周波パターンのため、モザイク / ぼかしで「判読不能に均された」ことを
 * ピクセル値（赤とも青とも異なる混合色になる）で証明できる（/redact の E2E に使う）。
 */
export const checkerPngFile = (
  name = "checker.png",
  width = 200,
  height = 200,
) => {
  const png = buildPng(width, height, 2, (x, y) => {
    if (x >= width / 2) {
      return [255, 255, 255];
    }
    return (x + y) % 2 === 0 ? [255, 0, 0] : [0, 0, 255];
  });
  return { name, mimeType: "image/png", buffer: Buffer.from(png) };
};

/**
 * 明るい背景の中央に暗い矩形（顕著物体）を置いた RGB PNG を実行時生成する。
 * 背景除去（/remove-bg）のサリエンシー検出が「中央 = 前景・隅 = 背景」と
 * 判定しやすい高コントラストな構図にしてある。
 */
export const salientRectPngFile = (
  name = "salient.png",
  width = 320,
  height = 320,
) => {
  const x0 = Math.floor(width * 0.3);
  const x1 = Math.floor(width * 0.7);
  const y0 = Math.floor(height * 0.3);
  const y1 = Math.floor(height * 0.7);
  const png = buildPng(width, height, 2, (x, y) =>
    x >= x0 && x < x1 && y >= y0 && y < y1 ? [140, 30, 30] : [235, 235, 235],
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(png) };
};

/** PNG を装った破損ファイル（デコード失敗時の通知表示の検証に使用） */
export const brokenImageFile = (name = "broken.png") => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from("this is not an image", "utf-8"),
});

/**
 * R↔B を入れ替える 2^3 の 3D LUT（.cube テキスト）。線形変換なのでトライリニアで厳密に
 * 入替が再現でき、既知 LUT の出力ピクセル検証に使う。
 * データ順は R 最速（(r,g,b) の r が最初に変化する）。
 */
export const SWAP_RB_CUBE_TEXT = `TITLE "Swap RB"
LUT_3D_SIZE 2
0 0 0
0 0 1
0 1 0
0 1 1
1 0 0
1 0 1
1 1 0
1 1 1
`;

/** setInputFiles に渡せる .cube LUT ファイル（テキストを実行時にバッファ化） */
export const cubeLutFile = (name = "lut.cube", text = SWAP_RB_CUBE_TEXT) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(text, "utf-8"),
});

/** 不正な .cube（サイズ宣言なし）。読み込み失敗のエラー通知検証に使う */
export const invalidCubeFile = (name = "broken.cube") => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from("not a valid cube file\n0 0 0\n", "utf-8"),
});

// cwebp で生成した 1x1 ピクセルの WebP（VP8X 形式。EXIF 埋め込みのベースに使う）
const BASE_WEBP_BASE64 =
  "UklGRlQAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAf1ZQOCAsAAAAkAEAnQEqAQABAAIANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=";

/** GPS・カメラ情報入りの EXIF オブジェクト（各フィクスチャで共用） */
const sampleExifObj = {
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
    ] as unknown as number[],
    [piexif.GPSIFD.GPSLongitudeRef]: "E",
    [piexif.GPSIFD.GPSLongitude]: [
      [139, 1],
      [45, 1],
      [0, 1],
    ] as unknown as number[],
  },
};

/** GPS・カメラ情報入りの EXIF を埋め込んだ JPEG ファイル */
export const jpegFileWithExif = (name = "with-exif.jpg") => {
  const exifBytes = piexif.dump(sampleExifObj);
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

/**
 * GPS・カメラ情報入りの EXIF を埋め込んだ PNG ファイル。
 * ベース PNG に insertPngExif で eXIf チャンクを付与する（PNG 読み取りの E2E に使う）
 */
export const pngFileWithExif = (name = "with-exif.png") => {
  const tiff = piexifDumpToTiff(piexif.dump(sampleExifObj));
  const base = new Uint8Array(Buffer.from(PNG_1PX_BASE64, "base64"));
  const png = insertPngExif(base, tiff);
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(png),
  };
};

/**
 * GPS・カメラ情報入りの EXIF を埋め込んだ WebP ファイル。
 * ベース WebP に insertWebpExif で EXIF チャンクを付与する（WebP 読み取りの E2E に使う）
 */
export const webpFileWithExif = (name = "with-exif.webp") => {
  const tiff = piexifDumpToTiff(piexif.dump(sampleExifObj));
  const base = new Uint8Array(Buffer.from(BASE_WEBP_BASE64, "base64"));
  const webp = insertWebpExif(base, tiff, 1, 1);
  return {
    name,
    mimeType: "image/webp",
    buffer: Buffer.from(webp),
  };
};

/** ダウンロードした JPEG バイナリから EXIF を読み出す */
export const loadExifFromBuffer = (buf: Buffer) => {
  return piexif.load(`data:image/jpeg;base64,${buf.toString("base64")}`);
};

/**
 * JPEG バイナリに EXIF Orientation タグを埋め込む（最適化時の向き焼き込み検証用）。
 * 例: Orientation=6 は「右 90° 回転して表示」を意味する。
 */
export const insertJpegOrientation = (
  jpeg: Buffer,
  orientation: number,
): Buffer => {
  const exif = piexif.dump({
    "0th": { [piexif.ImageIFD.Orientation]: orientation },
  });
  const dataUrl = piexif.insert(
    exif,
    `data:image/jpeg;base64,${jpeg.toString("base64")}`,
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
};

/** ダウンロードした PNG バイナリの eXIf チャンクから EXIF を読み出す */
export const loadExifFromPngBuffer = (
  buf: Buffer,
): ReturnType<typeof piexif.load> => {
  const tiff = extractPngExif(new Uint8Array(buf));
  if (!tiff) {
    return {} as ReturnType<typeof piexif.load>;
  }
  const jpeg = buildSyntheticJpegFromTiff(tiff);
  return piexif.load(
    `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`,
  );
};

/** ダウンロードした WebP バイナリの EXIF チャンクから EXIF を読み出す */
export const loadExifFromWebpBuffer = (
  buf: Buffer,
): ReturnType<typeof piexif.load> => {
  const tiff = extractWebpExif(new Uint8Array(buf));
  if (!tiff) {
    return {} as ReturnType<typeof piexif.load>;
  }
  const jpeg = buildSyntheticJpegFromTiff(tiff);
  return piexif.load(
    `data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`,
  );
};

/** PNG バイナリの IHDR から幅・高さ（px）を読み出す */
export const pngSize = (buf: Buffer): { width: number; height: number } => ({
  // 8 バイトのシグネチャ + 4 バイト長 + 4 バイト "IHDR" の後に幅・高さ（BE32）が並ぶ
  width: buf.readUInt32BE(16),
  height: buf.readUInt32BE(20),
});

/** バイナリの先頭がフォーマットのマジックナンバーと一致するか */
export const magicNumber = {
  isJpeg: (buf: Buffer) =>
    buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  isPng: (buf: Buffer) =>
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
  isWebp: (buf: Buffer) =>
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP",
  // ISOBMFF コンテナの ftyp ボックス（オフセット 4-12 が "ftypavif"）
  isAvif: (buf: Buffer) => buf.subarray(4, 12).toString("ascii") === "ftypavif",
  // JPEG XL は裸コードストリーム（FF 0A）と ISOBMFF コンテナ
  // （12 バイトのシグネチャボックス 00 00 00 0C "JXL " 0D 0A 87 0A）の 2 形態がある
  isJxl: (buf: Buffer) =>
    (buf[0] === 0xff && buf[1] === 0x0a) ||
    buf.subarray(4, 8).toString("ascii") === "JXL ",
};
