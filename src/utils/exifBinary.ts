/**
 * EXIF バイナリ操作の純粋ロジック群
 *
 * Canvas / WASM / ブラウザ API（atob 等）に非依存で、Uint8Array のみで完結する。
 * これにより happy-dom での単体テスト・Node（Playwright E2E ヘルパー）の双方から利用できる。
 *
 * EXIF ペイロードは JPEG の APP1 セグメントと同じ TIFF 構造だが、コンテナごとに
 * 先頭の識別子 "Exif\0\0" の有無が異なる:
 * - JPEG APP1 / piexifjs の dump: 先頭に "Exif\0\0" が付く
 * - PNG eXIf チャンク / WebP EXIF チャンク: 識別子なしの純 TIFF
 *
 * そのため本モジュールでは「識別子なしの純 TIFF（Uint8Array）」を正準表現とし、
 * 各コンテナへの出し入れ時に stripExifIdentifier / addExifIdentifier で正規化する。
 */

// "Exif\0\0"（EXIF 識別子）
const EXIF_IDENTIFIER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

/**
 * Uint8Array をバイナリ文字列（各文字コードが 1 バイト）に変換する。
 * piexifjs の dump/insert はバイナリ文字列を扱うため、その相互運用に使う。
 * 巨大配列で String.fromCharCode の引数展開がスタックを溢れさせないよう分割処理する。
 */
export const uint8ArrayToBinaryString = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000;
  let result = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    result += String.fromCharCode(...slice);
  }
  return result;
};

/** バイナリ文字列を Uint8Array に変換する（uint8ArrayToBinaryString の逆） */
export const binaryStringToUint8Array = (
  str: string,
): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
};

/** 先頭が "Exif\0\0" 識別子で始まるか */
const hasExifIdentifier = (bytes: Uint8Array): boolean => {
  if (bytes.length < EXIF_IDENTIFIER.length) {
    return false;
  }
  return EXIF_IDENTIFIER.every((b, i) => bytes[i] === b);
};

/** 先頭の "Exif\0\0" 識別子を剥がして純 TIFF を返す（無ければそのまま返す） */
export const stripExifIdentifier = (bytes: Uint8Array): Uint8Array => {
  return hasExifIdentifier(bytes)
    ? bytes.subarray(EXIF_IDENTIFIER.length)
    : bytes;
};

/** 純 TIFF に "Exif\0\0" 識別子を前置する（既に付いていれば冪等） */
export const addExifIdentifier = (tiff: Uint8Array): Uint8Array => {
  if (hasExifIdentifier(tiff)) {
    return tiff;
  }
  const result = new Uint8Array(EXIF_IDENTIFIER.length + tiff.length);
  result.set(EXIF_IDENTIFIER, 0);
  result.set(tiff, EXIF_IDENTIFIER.length);
  return result;
};

/**
 * piexifjs の dump 文字列（"Exif\0\0" + TIFF）から純 TIFF（Uint8Array）を取り出す
 */
export const piexifDumpToTiff = (dump: string): Uint8Array => {
  return stripExifIdentifier(binaryStringToUint8Array(dump));
};

/**
 * 純 TIFF（Uint8Array）を piexifjs の insert が要求する dump 文字列
 * （"Exif\0\0" + TIFF のバイナリ文字列）に変換する
 */
export const tiffToPiexifDump = (tiff: Uint8Array): string => {
  return uint8ArrayToBinaryString(addExifIdentifier(tiff));
};

// ---- CRC32（PNG チャンク用） ----

// CRC32 テーブル（多項式 0xEDB88320）を一度だけ構築する
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * PNG チャンクの CRC32 を計算する（既知ベクトル crc32("123456789") = 0xCBF43926）
 */
export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// ---- 数値の読み書きヘルパー ----

const readUint32BE = (bytes: Uint8Array, offset: number): number => {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
};

const writeUint32BE = (
  bytes: Uint8Array,
  offset: number,
  value: number,
): void => {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
};

const readUint32LE = (bytes: Uint8Array, offset: number): number => {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
};

const writeUint32LE = (
  bytes: Uint8Array,
  offset: number,
  value: number,
): void => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
};

const fourCC = (bytes: Uint8Array, offset: number): string => {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
};

// ---- PNG ----

// PNG シグネチャ（8 バイト）
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

/** PNG のシグネチャを検証する */
const isPng = (png: Uint8Array): boolean => {
  if (png.length < PNG_SIGNATURE.length) {
    return false;
  }
  return PNG_SIGNATURE.every((b, i) => png[i] === b);
};

/** PNG をチャンク列にパースする（不正な PNG の場合は null） */
export const parsePngChunks = (png: Uint8Array): PngChunk[] | null => {
  if (!isPng(png)) {
    return null;
  }
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= png.length) {
    const length = readUint32BE(png, offset);
    const type = fourCC(png, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    // CRC 4 バイトを含めた終端が範囲外なら破損とみなす
    if (dataEnd + 4 > png.length) {
      return null;
    }
    chunks.push({ type, data: png.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
};

/** チャンク列から PNG バイナリを再構築する */
export const assemblePng = (chunks: PngChunk[]): Uint8Array<ArrayBuffer> => {
  let total = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    total += 12 + chunk.data.length; // length(4) + type(4) + data + crc(4)
  }
  const result = new Uint8Array(total);
  result.set(PNG_SIGNATURE, 0);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    writeUint32BE(result, offset, chunk.data.length);
    const typeBytes = new Uint8Array([
      chunk.type.charCodeAt(0),
      chunk.type.charCodeAt(1),
      chunk.type.charCodeAt(2),
      chunk.type.charCodeAt(3),
    ]);
    result.set(typeBytes, offset + 4);
    result.set(chunk.data, offset + 8);
    // CRC は type + data に対して計算する
    const crcInput = new Uint8Array(4 + chunk.data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(chunk.data, 4);
    writeUint32BE(result, offset + 8 + chunk.data.length, crc32(crcInput));
    offset += 12 + chunk.data.length;
  }
  return result;
};

/**
 * PNG の eXIf チャンクから EXIF（純 TIFF）を取り出す。無ければ null。
 */
export const extractPngExif = (png: Uint8Array): Uint8Array | null => {
  const chunks = parsePngChunks(png);
  if (!chunks) {
    return null;
  }
  const exifChunk = chunks.find((c) => c.type === "eXIf");
  if (!exifChunk) {
    return null;
  }
  // eXIf チャンクは識別子なしの純 TIFF だが、念のため付いていれば剥がす
  return stripExifIdentifier(exifChunk.data);
};

/**
 * PNG に EXIF（純 TIFF）を eXIf チャンクとして書き込む。
 * 既存の eXIf は置換し、最初の IDAT の直前に挿入する（PNG 仕様の推奨位置）。
 * 不正な PNG の場合は元のバイナリをそのまま返す。
 */
export const insertPngExif = (
  png: Uint8Array,
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> => {
  const chunks = parsePngChunks(png);
  if (!chunks) {
    // 不正な PNG はそのまま返す（Blob 生成のため ArrayBuffer 裏付けを保証して複製する）
    return new Uint8Array(png);
  }
  // eXIf チャンクは識別子なしの純 TIFF を格納する
  const exifData = stripExifIdentifier(tiff);
  const newChunks = chunks.filter((c) => c.type !== "eXIf");
  const idatIndex = newChunks.findIndex((c) => c.type === "IDAT");
  const insertAt = idatIndex === -1 ? newChunks.length : idatIndex;
  newChunks.splice(insertAt, 0, { type: "eXIf", data: exifData });
  return assemblePng(newChunks);
};

// ---- WebP（RIFF） ----

export interface RiffChunk {
  fourCC: string;
  payload: Uint8Array;
}

/** WebP（RIFF/WEBP）コンテナか検証する */
const isWebp = (webp: Uint8Array): boolean => {
  return (
    webp.length >= 12 &&
    fourCC(webp, 0) === "RIFF" &&
    fourCC(webp, 8) === "WEBP"
  );
};

/** WebP をチャンク列にパースする（不正な場合は null） */
export const parseWebpChunks = (webp: Uint8Array): RiffChunk[] | null => {
  if (!isWebp(webp)) {
    return null;
  }
  const chunks: RiffChunk[] = [];
  let offset = 12; // "RIFF"(4) + size(4) + "WEBP"(4)
  while (offset + 8 <= webp.length) {
    const cc = fourCC(webp, offset);
    const size = readUint32LE(webp, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > webp.length) {
      return null;
    }
    chunks.push({ fourCC: cc, payload: webp.subarray(dataStart, dataEnd) });
    // RIFF チャンクは偶数境界。奇数サイズなら 1 バイトのパディングが続く
    offset = dataEnd + (size & 1);
  }
  return chunks;
};

/** 単一の RIFF チャンク（fourCC + size + payload + 奇数長パディング）を組み立てる */
const buildRiffChunk = (chunk: RiffChunk): Uint8Array => {
  const size = chunk.payload.length;
  const padded = size + (size & 1);
  const result = new Uint8Array(8 + padded);
  result[0] = chunk.fourCC.charCodeAt(0);
  result[1] = chunk.fourCC.charCodeAt(1);
  result[2] = chunk.fourCC.charCodeAt(2);
  result[3] = chunk.fourCC.charCodeAt(3);
  writeUint32LE(result, 4, size);
  result.set(chunk.payload, 8);
  return result;
};

/** チャンク列から WebP（RIFF/WEBP）バイナリを再構築する */
export const assembleWebp = (chunks: RiffChunk[]): Uint8Array<ArrayBuffer> => {
  const chunkBytes = chunks.map(buildRiffChunk);
  const bodySize = chunkBytes.reduce((sum, c) => sum + c.length, 0);
  // RIFF サイズは "WEBP"(4) + 全チャンク
  const riffSize = 4 + bodySize;
  const result = new Uint8Array(8 + riffSize);
  result[0] = 0x52; // R
  result[1] = 0x49; // I
  result[2] = 0x46; // F
  result[3] = 0x46; // F
  writeUint32LE(result, 4, riffSize);
  result[8] = 0x57; // W
  result[9] = 0x45; // E
  result[10] = 0x42; // B
  result[11] = 0x50; // P
  let offset = 12;
  for (const bytes of chunkBytes) {
    result.set(bytes, offset);
    offset += bytes.length;
  }
  return result;
};

/**
 * WebP の EXIF チャンクから EXIF（純 TIFF）を取り出す。無ければ null。
 */
export const extractWebpExif = (webp: Uint8Array): Uint8Array | null => {
  const chunks = parseWebpChunks(webp);
  if (!chunks) {
    return null;
  }
  const exifChunk = chunks.find((c) => c.fourCC === "EXIF");
  if (!exifChunk) {
    return null;
  }
  // WebP の EXIF チャンクは通常識別子なしの純 TIFF だが、付いていれば剥がして正規化する
  return stripExifIdentifier(exifChunk.payload);
};

// VP8X フラグバイトの EXIF メタデータビット（0x08）
const VP8X_EXIF_FLAG = 0x08;

/** VP8X チャンクのペイロード（10 バイト）を生成する */
const buildVp8xPayload = (
  width: number,
  height: number,
  flags: number,
): Uint8Array => {
  const payload = new Uint8Array(10);
  payload[0] = flags;
  // payload[1..3] は予約（0）
  // Canvas Width Minus One / Height Minus One を LE24 で格納する
  const w = Math.max(0, width - 1);
  const h = Math.max(0, height - 1);
  payload[4] = w & 0xff;
  payload[5] = (w >>> 8) & 0xff;
  payload[6] = (w >>> 16) & 0xff;
  payload[7] = h & 0xff;
  payload[8] = (h >>> 8) & 0xff;
  payload[9] = (h >>> 16) & 0xff;
  return payload;
};

/**
 * WebP に EXIF（純 TIFF）を書き込む。
 *
 * 単純な VP8 / VP8L 形式は拡張形式（VP8X）へラップし直し、VP8X の EXIF フラグを立てて
 * EXIF チャンクを付与する。既に VP8X ならフラグを OR し、既存 EXIF チャンクを置換する。
 * VP8 ビットストリームの寸法パースを避けるため、キャンバス寸法を引数で受け取る。
 *
 * @param width - 出力画像の幅（VP8X の Canvas Width に使用）
 * @param height - 出力画像の高さ（VP8X の Canvas Height に使用）
 */
export const insertWebpExif = (
  webp: Uint8Array,
  tiff: Uint8Array,
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> => {
  const chunks = parseWebpChunks(webp);
  if (!chunks || chunks.length === 0) {
    // 不正な WebP はそのまま返す（Blob 生成のため ArrayBuffer 裏付けを保証して複製する）
    return new Uint8Array(webp);
  }
  // WebP の EXIF チャンクは識別子なしの純 TIFF を格納する
  const exifData = stripExifIdentifier(tiff);
  const exifChunk: RiffChunk = { fourCC: "EXIF", payload: exifData };

  const first = chunks[0].fourCC;
  if (first === "VP8X") {
    // 既に拡張形式: フラグに EXIF ビットを立て、既存 EXIF を置換して挿入する
    const vp8x = chunks[0];
    if (vp8x.payload.length >= 1) {
      // subarray はビューのため元 webp を書き換えないよう複製してから更新する
      const newPayload = new Uint8Array(vp8x.payload);
      newPayload[0] |= VP8X_EXIF_FLAG;
      chunks[0] = { fourCC: "VP8X", payload: newPayload };
    }
    const withoutExif = chunks.filter((c) => c.fourCC !== "EXIF");
    // WebP 仕様では EXIF は XMP チャンクより前が推奨。XMP があればその直前に、
    // 無ければ末尾に挿入して順序の逆転を防ぐ（fourCC は末尾スペース込みの "XMP "）
    const xmpIndex = withoutExif.findIndex((c) => c.fourCC === "XMP ");
    const insertAt = xmpIndex === -1 ? withoutExif.length : xmpIndex;
    withoutExif.splice(insertAt, 0, exifChunk);
    return assembleWebp(withoutExif);
  }

  // 単純形式（VP8 / VP8L）: VP8X を先頭に追加して拡張形式へ変換する。
  // アルファ(0x10)フラグはビットストリームを解析しないと判定できないため立てない
  // （設計上ビットストリームは解釈しない。透過の有無は libwebp / ブラウザが
  // ビットストリーム側から復元するため、EXIF 付与のみが目的の本処理では実害はない）
  const vp8xChunk: RiffChunk = {
    fourCC: "VP8X",
    payload: buildVp8xPayload(width, height, VP8X_EXIF_FLAG),
  };
  // VP8X → 画像データ（既存チャンク）→ EXIF の順に再構成する
  const imageChunks = chunks.filter((c) => c.fourCC !== "EXIF");
  return assembleWebp([vp8xChunk, ...imageChunks, exifChunk]);
};

// ---- 合成 JPEG（EXIF 読み取り用） ----

/**
 * 純 TIFF から、APP1(Exif) セグメントだけを持つ最小の JPEG バイナリを合成する。
 *
 * piexifjs / exif-js は JPEG の APP1 セグメントから EXIF を解釈するため、
 * PNG / WebP から取り出した TIFF をこの合成 JPEG に包むことで既存の EXIF 読み取り経路を再利用できる。
 * APP1 の長さフィールドは 16bit のため、TIFF が約 64KB を超える場合は表現できない（通常の EXIF では発生しない）。
 *
 * APP1 の後に SOS(0xFFDA) マーカーを置く: piexifjs のセグメント分割は SOS で終端するため、
 * これが無いとパーサがデータ末尾を越えて読もうとして失敗する（exif-js は先頭の APP1 で完結するため影響なし）。
 */
export const buildSyntheticJpegFromTiff = (
  tiff: Uint8Array,
): Uint8Array<ArrayBuffer> => {
  const payload = addExifIdentifier(tiff); // "Exif\0\0" + TIFF
  // APP1 セグメント長 = 長さフィールド 2 バイト + ペイロード
  const segmentLength = 2 + payload.length;
  const result = new Uint8Array(2 + 2 + 2 + payload.length + 2 + 2);
  let offset = 0;
  result[offset++] = 0xff; // SOI
  result[offset++] = 0xd8;
  result[offset++] = 0xff; // APP1 マーカー
  result[offset++] = 0xe1;
  result[offset++] = (segmentLength >>> 8) & 0xff; // 長さ（BE16）
  result[offset++] = segmentLength & 0xff;
  result.set(payload, offset);
  offset += payload.length;
  result[offset++] = 0xff; // SOS（セグメント分割の終端）
  result[offset++] = 0xda;
  result[offset++] = 0xff; // EOI
  result[offset++] = 0xd9;
  return result;
};
