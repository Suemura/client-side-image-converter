/**
 * C2PA（JUMBF）バイナリ操作の純粋ロジック群
 *
 * exifBinary.ts と同じ方針で Canvas / WASM / ブラウザ API に非依存とし、
 * happy-dom での単体テスト・Node（Playwright E2E ヘルパー）の双方から利用できる。
 * マニフェストの解釈（署名検証・内容表示）は c2pa-web（WASM）に委ね、
 * 本モジュールは「埋め込みの検出」と「除去」だけを担う。
 *
 * 格納位置（C2PA 仕様 / ISO 19566-5）:
 * - JPEG: APP11（0xFFEB）セグメント。ペイロード = CI("JP") + En(2B) + Z(4B) + JUMBF ボックス。
 *   64KB 超のマニフェストは同一 En の複数セグメントに分割される（各セグメントで LBox/TBox が繰り返される）
 * - PNG: caBX チャンク（JUMBF 生データ）
 * - WebP: RIFF の C2PA チャンク（JUMBF 生データ）
 *
 * C2PA マニフェストストアは JUMBF スーパーボックス（TBox="jumb"）で、
 * 記述ボックス（TBox="jumd"）のラベルが "c2pa" であることで識別する。
 * ラベルが異なる JUMBF（他規格の埋め込み）は温存する。
 */

import {
  assemblePng,
  assembleWebp,
  parsePngChunks,
  parseWebpChunks,
} from "./exifBinary";

/** PNG の C2PA チャンクタイプ */
const PNG_C2PA_CHUNK = "caBX";

/** WebP（RIFF）の C2PA チャンク fourCC */
const WEBP_C2PA_CHUNK = "C2PA";

/** APP11 マーカーの第 2 バイト */
const APP11_MARKER = 0xeb;

/** JUMBF-in-JPEG の共通識別子 CI = "JP" */
const JUMBF_CI = [0x4a, 0x50];

/** C2PA マニフェストストアの記述ボックスラベル */
const C2PA_LABEL = "c2pa";

const readUint16BE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 8) | bytes[offset + 1];

const ascii = (bytes: Uint8Array, offset: number, length: number): string => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += String.fromCharCode(bytes[offset + i]);
  }
  return result;
};

// ---- JPEG ----

/** SOS より前のマーカーセグメント 1 つ分の位置情報 */
interface JpegSegment {
  /** マーカー第 2 バイト（0xE1 = APP1 等） */
  marker: number;
  /** セグメント先頭（0xFF の位置） */
  start: number;
  /** セグメント終端（次セグメントの先頭） */
  end: number;
}

/**
 * JPEG の SOS より前のマーカーセグメントを列挙する（不正な構造は null）。
 * SOS 以降（エントロピー符号化データ）は走査しない。
 */
const scanJpegSegments = (jpeg: Uint8Array): JpegSegment[] | null => {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    return null;
  }
  const segments: JpegSegment[] = [];
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    if (jpeg[offset] !== 0xff) {
      return null;
    }
    const marker = jpeg[offset + 1];
    // SOS 以降はエントロピーデータ。EOI が来る場合も走査終了
    if (marker === 0xda || marker === 0xd9) {
      break;
    }
    const length = readUint16BE(jpeg, offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > jpeg.length) {
      return null;
    }
    segments.push({ marker, start: offset, end });
    offset = end;
  }
  return segments;
};

/**
 * APP11 セグメントのペイロードから JUMBF の En（ボックスインスタンス番号）を読む。
 * JUMBF-in-JPEG のペイロードでなければ null。
 */
const readJumbfEn = (jpeg: Uint8Array, segment: JpegSegment): number | null => {
  const payloadStart = segment.start + 4; // FF EB + 長さ 2B の後
  if (segment.end - payloadStart < 8) {
    return null;
  }
  if (
    jpeg[payloadStart] !== JUMBF_CI[0] ||
    jpeg[payloadStart + 1] !== JUMBF_CI[1]
  ) {
    return null;
  }
  return readUint16BE(jpeg, payloadStart + 2);
};

/**
 * APP11 セグメントのペイロードが「ラベル c2pa の JUMBF スーパーボックス先頭」かを判定する。
 * 分割チェーンの後続セグメント（jumd を含まない）は false になるため、
 * 除去は En でグループ化して行う。
 */
const isC2paJumbfHead = (jpeg: Uint8Array, segment: JpegSegment): boolean => {
  // CI(2) + En(2) + Z(4) + LBox(4) + "jumb"(4) + LBox(4) + "jumd"(4) + UUID(16) + toggles(1)
  const p = segment.start + 4;
  if (segment.end - p < 2 + 2 + 4 + 8 + 8 + 16 + 1 + C2PA_LABEL.length + 1) {
    return false;
  }
  if (ascii(jpeg, p + 12, 4) !== "jumb" || ascii(jpeg, p + 20, 4) !== "jumd") {
    return false;
  }
  // 記述ボックスの toggles に続く NUL 終端ラベルを読む
  const labelStart = p + 24 + 16 + 1;
  let label = "";
  for (let i = labelStart; i < segment.end && jpeg[i] !== 0x00; i++) {
    label += String.fromCharCode(jpeg[i]);
  }
  return label === C2PA_LABEL;
};

/** JPEG 内の C2PA を構成する APP11 セグメント一覧（無ければ空配列、不正 JPEG は null） */
const findJpegC2paSegments = (jpeg: Uint8Array): JpegSegment[] | null => {
  const segments = scanJpegSegments(jpeg);
  if (!segments) {
    return null;
  }
  const app11 = segments.filter((s) => s.marker === APP11_MARKER);
  // ラベル c2pa の JUMBF 先頭セグメントから、除去対象の En 集合を決める
  const c2paEns = new Set<number>();
  for (const segment of app11) {
    if (isC2paJumbfHead(jpeg, segment)) {
      const en = readJumbfEn(jpeg, segment);
      if (en !== null) {
        c2paEns.add(en);
      }
    }
  }
  if (c2paEns.size === 0) {
    return [];
  }
  // 同一 En の分割チェーン全体（後続セグメント含む）を除去対象にする
  return app11.filter((segment) => {
    const en = readJumbfEn(jpeg, segment);
    return en !== null && c2paEns.has(en);
  });
};

/** 指定範囲を取り除いた JPEG を再構築する */
const removeJpegRanges = (
  jpeg: Uint8Array,
  ranges: JpegSegment[],
): Uint8Array<ArrayBuffer> => {
  const total = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  const result = new Uint8Array(jpeg.length - total);
  let src = 0;
  let dst = 0;
  for (const range of ranges) {
    result.set(jpeg.subarray(src, range.start), dst);
    dst += range.start - src;
    src = range.end;
  }
  result.set(jpeg.subarray(src), dst);
  return result;
};

// ---- 公開 API ----

/** C2PA 除去に対応する MIME タイプ */
export const C2PA_SUPPORTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * 画像バイナリに C2PA マニフェスト（埋め込み）が含まれるかを判定する。
 * 非対応形式・不正バイナリは false（fail-safe。リモート参照のみの
 * 画像も false になり、c2pa-web へ渡さないゲートとして機能する）。
 */
export const detectC2pa = (bytes: Uint8Array, mimeType: string): boolean => {
  switch (mimeType) {
    case "image/jpeg": {
      const segments = findJpegC2paSegments(bytes);
      return segments !== null && segments.length > 0;
    }
    case "image/png": {
      const chunks = parsePngChunks(bytes);
      return chunks?.some((c) => c.type === PNG_C2PA_CHUNK) ?? false;
    }
    case "image/webp": {
      const chunks = parseWebpChunks(bytes);
      return chunks?.some((c) => c.fourCC === WEBP_C2PA_CHUNK) ?? false;
    }
    default:
      return false;
  }
};

/**
 * 画像バイナリから C2PA マニフェスト（埋め込み）を除去する。
 * 再エンコードを伴わないロスレス除去（画素データは変更しない）。
 * C2PA が無い・非対応形式・不正バイナリの場合は入力の複製をそのまま返す
 * （Blob 生成のため ArrayBuffer 裏付けの複製を保証する）。
 */
export const removeC2pa = (
  bytes: Uint8Array,
  mimeType: string,
): Uint8Array<ArrayBuffer> => {
  switch (mimeType) {
    case "image/jpeg": {
      const targets = findJpegC2paSegments(bytes);
      if (!targets || targets.length === 0) {
        return new Uint8Array(bytes);
      }
      return removeJpegRanges(bytes, targets);
    }
    case "image/png": {
      const chunks = parsePngChunks(bytes);
      if (!chunks?.some((c) => c.type === PNG_C2PA_CHUNK)) {
        return new Uint8Array(bytes);
      }
      return assemblePng(chunks.filter((c) => c.type !== PNG_C2PA_CHUNK));
    }
    case "image/webp": {
      const chunks = parseWebpChunks(bytes);
      if (!chunks?.some((c) => c.fourCC === WEBP_C2PA_CHUNK)) {
        return new Uint8Array(bytes);
      }
      return assembleWebp(chunks.filter((c) => c.fourCC !== WEBP_C2PA_CHUNK));
    }
    default:
      return new Uint8Array(bytes);
  }
};

// ---- テスト・E2E フィクスチャ用のダミー生成 ----
// 署名付きの本物のマニフェストは実行時生成できないため、構造だけ正しい
// ダミー JUMBF を生成して「検出 → 除去」のバイナリ検証に使う。

/** C2PA マニフェストストアの記述ボックス UUID（"c2pa" + ISO 接尾辞） */
const C2PA_UUID = [
  0x63, 0x32, 0x70, 0x61, 0x00, 0x11, 0x00, 0x10, 0x80, 0x00, 0x00, 0xaa, 0x00,
  0x38, 0x9b, 0x71,
];

/** LBox(4B BE) + TBox(4B) + payload のボックスを組み立てる */
const buildBox = (type: string, payload: Uint8Array): Uint8Array => {
  const box = new Uint8Array(8 + payload.length);
  const length = box.length;
  box[0] = (length >>> 24) & 0xff;
  box[1] = (length >>> 16) & 0xff;
  box[2] = (length >>> 8) & 0xff;
  box[3] = length & 0xff;
  for (let i = 0; i < 4; i++) {
    box[4 + i] = type.charCodeAt(i);
  }
  box.set(payload, 8);
  return box;
};

/**
 * 構造だけ正しいダミーの C2PA JUMBF スーパーボックスを生成する。
 * jumb [ jumd(UUID + toggles + label "c2pa") + json(ダミー内容) ] の形。
 * @param label - 記述ボックスのラベル（既定 "c2pa"。非 C2PA JUMBF の温存テスト用に変更可）
 */
export const buildDummyC2paJumbf = (label: string = C2PA_LABEL): Uint8Array => {
  // 記述ボックス: UUID(16) + toggles(1: requestable) + label + NUL
  const jumdPayload = new Uint8Array(16 + 1 + label.length + 1);
  jumdPayload.set(C2PA_UUID, 0);
  jumdPayload[16] = 0x03; // requestable + label 付きを示す toggles
  for (let i = 0; i < label.length; i++) {
    jumdPayload[17 + i] = label.charCodeAt(i);
  }
  const jumd = buildBox("jumd", jumdPayload);
  // 内容ボックス: 最小の JSON ペイロード
  const jsonPayload = new Uint8Array([0x7b, 0x7d]); // "{}"
  const json = buildBox("json", jsonPayload);
  const superPayload = new Uint8Array(jumd.length + json.length);
  superPayload.set(jumd, 0);
  superPayload.set(json, jumd.length);
  return buildBox("jumb", superPayload);
};

/**
 * JPEG に JUMBF を APP11 セグメントとして挿入する（テスト・E2E フィクスチャ用）。
 * 先頭の APP0 / APP1 の直後（無ければ SOI 直後）に、単一セグメントで挿入する。
 * @param en - ボックスインスタンス番号（複数 JUMBF の共存テスト用に変更可）
 */
export const insertJpegC2pa = (
  jpeg: Uint8Array,
  jumbf: Uint8Array,
  en = 1,
): Uint8Array<ArrayBuffer> => {
  const segments = scanJpegSegments(jpeg);
  if (!segments) {
    return new Uint8Array(jpeg);
  }
  // ペイロード = CI(2) + En(2) + Z(4) + JUMBF
  const payload = new Uint8Array(8 + jumbf.length);
  payload[0] = JUMBF_CI[0];
  payload[1] = JUMBF_CI[1];
  payload[2] = (en >>> 8) & 0xff;
  payload[3] = en & 0xff;
  payload[7] = 0x01; // Z = 1（BE32）
  payload.set(jumbf, 8);
  const segmentLength = 2 + payload.length; // 長さフィールド自身を含む
  const segment = new Uint8Array(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xeb;
  segment[2] = (segmentLength >>> 8) & 0xff;
  segment[3] = segmentLength & 0xff;
  segment.set(payload, 4);

  // 先頭から連続する APP0(0xE0) / APP1(0xE1) の直後を挿入位置にする
  let insertAt = 2; // SOI 直後
  for (const s of segments) {
    if (s.start !== insertAt || (s.marker !== 0xe0 && s.marker !== 0xe1)) {
      break;
    }
    insertAt = s.end;
  }
  const result = new Uint8Array(jpeg.length + segment.length);
  result.set(jpeg.subarray(0, insertAt), 0);
  result.set(segment, insertAt);
  result.set(jpeg.subarray(insertAt), insertAt + segment.length);
  return result;
};

/**
 * PNG に JUMBF を caBX チャンクとして挿入する（テスト・E2E フィクスチャ用）。
 * 最初の IDAT の直前に挿入し、既存の caBX は置換する。
 */
export const insertPngC2pa = (
  png: Uint8Array,
  jumbf: Uint8Array,
): Uint8Array<ArrayBuffer> => {
  const chunks = parsePngChunks(png);
  if (!chunks) {
    return new Uint8Array(png);
  }
  const newChunks = chunks.filter((c) => c.type !== PNG_C2PA_CHUNK);
  const idatIndex = newChunks.findIndex((c) => c.type === "IDAT");
  const insertAt = idatIndex === -1 ? newChunks.length : idatIndex;
  newChunks.splice(insertAt, 0, { type: PNG_C2PA_CHUNK, data: jumbf });
  return assemblePng(newChunks);
};

/**
 * WebP に JUMBF を C2PA チャンクとして挿入する（テスト・E2E フィクスチャ用）。
 * 既存の C2PA チャンクは置換し、末尾に追加する。
 */
export const insertWebpC2pa = (
  webp: Uint8Array,
  jumbf: Uint8Array,
): Uint8Array<ArrayBuffer> => {
  const chunks = parseWebpChunks(webp);
  if (!chunks) {
    return new Uint8Array(webp);
  }
  const newChunks = chunks.filter((c) => c.fourCC !== WEBP_C2PA_CHUNK);
  newChunks.push({ fourCC: WEBP_C2PA_CHUNK, payload: jumbf });
  return assembleWebp(newChunks);
};
