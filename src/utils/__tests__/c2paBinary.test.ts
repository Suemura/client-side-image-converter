import { describe, expect, it } from "vitest";
import {
  buildDummyC2paJumbf,
  detectC2pa,
  insertJpegC2pa,
  insertPngC2pa,
  insertWebpC2pa,
  removeC2pa,
} from "../c2paBinary";
import {
  crc32,
  extractPngExif,
  insertPngExif,
  parsePngChunks,
} from "../exifBinary";

// ---- テスト用の最小バイナリ生成 ----

/** SOI + APP0(JFIF 風ダミー) + SOS + データ + EOI の最小 JPEG 骨格 */
const buildMinimalJpeg = (): Uint8Array => {
  const app0Payload = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"
  const app0Length = 2 + app0Payload.length;
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    (app0Length >> 8) & 0xff,
    app0Length & 0xff,
    ...app0Payload,
    0xff,
    0xda,
    0x00,
    0x02, // SOS（最小長）
    0x12,
    0x34, // エントロピーデータ（ダミー）
    0xff,
    0xd9, // EOI
  ]);
};

/** APP1(EXIF ダミー) 付きの最小 JPEG */
const buildJpegWithExif = (): Uint8Array => {
  const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d]; // "Exif\0\0MM"
  const app1Length = 2 + exifPayload.length;
  const app1 = [
    0xff,
    0xe1,
    (app1Length >> 8) & 0xff,
    app1Length & 0xff,
    ...exifPayload,
  ];
  const base = buildMinimalJpeg();
  const result = new Uint8Array(base.length + app1.length);
  result.set(base.subarray(0, 2), 0);
  result.set(app1, 2);
  result.set(base.subarray(2), 2 + app1.length);
  return result;
};

/** 最小 PNG（シグネチャ + IHDR + IDAT + IEND。fixtures.ts と同様チャンクを自前構築） */
const buildMinimalPng = (): Uint8Array => {
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
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
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 1);
  new DataView(ihdr.buffer).setUint32(4, 1);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array([0x00])),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
};

/** 最小 WebP（RIFF/WEBP + VP8 ダミーチャンク） */
const buildMinimalWebp = (): Uint8Array => {
  const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
  const riffSize = 4 + 8 + payload.length;
  const webp = new Uint8Array(8 + riffSize);
  webp.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  new DataView(webp.buffer).setUint32(4, riffSize, true);
  webp.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  webp.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  new DataView(webp.buffer).setUint32(16, payload.length, true);
  webp.set(payload, 20);
  return webp;
};

describe("JPEG の C2PA 検出・除去", () => {
  it("挿入 → 検出 → 除去のラウンドトリップで元のバイナリに戻る", () => {
    const base = buildMinimalJpeg();
    expect(detectC2pa(base, "image/jpeg")).toBe(false);

    const withC2pa = insertJpegC2pa(base, buildDummyC2paJumbf());
    expect(detectC2pa(withC2pa, "image/jpeg")).toBe(true);

    const removed = removeC2pa(withC2pa, "image/jpeg");
    expect(detectC2pa(removed, "image/jpeg")).toBe(false);
    expect([...removed]).toEqual([...base]);
  });

  it("同一 En の分割チェーン（後続セグメント）も一括で除去する", () => {
    // 手動で同一 En=1 の後続セグメント（jumd を含まない継続データ）を末尾 APP11 として追加する
    const withC2pa = insertJpegC2pa(
      buildMinimalJpeg(),
      buildDummyC2paJumbf(),
      1,
    );
    const continuation = [
      0xff,
      0xeb,
      0x00,
      0x10, // APP11、長さ 16
      0x4a,
      0x50,
      0x00,
      0x01, // CI "JP" + En=1
      0x00,
      0x00,
      0x00,
      0x02, // Z=2
      0x00,
      0x00,
      0x00,
      0x06,
      0x61,
      0x62, // 継続ペイロード
    ];
    // SOS の直前（= 最初の APP11 の直後）に継続セグメントを差し込む
    const sosIndex = withC2pa.findIndex(
      (_, i) => withC2pa[i] === 0xff && withC2pa[i + 1] === 0xda,
    );
    const chained = new Uint8Array(withC2pa.length + continuation.length);
    chained.set(withC2pa.subarray(0, sosIndex), 0);
    chained.set(continuation, sosIndex);
    chained.set(withC2pa.subarray(sosIndex), sosIndex + continuation.length);

    const removed = removeC2pa(chained, "image/jpeg");
    expect(detectC2pa(removed, "image/jpeg")).toBe(false);
    expect([...removed]).toEqual([...buildMinimalJpeg()]);
  });

  it("ラベルが c2pa 以外の JUMBF（他規格）は温存する", () => {
    const withOther = insertJpegC2pa(
      buildMinimalJpeg(),
      buildDummyC2paJumbf("other"),
      2,
    );
    expect(detectC2pa(withOther, "image/jpeg")).toBe(false);
    const removed = removeC2pa(withOther, "image/jpeg");
    expect([...removed]).toEqual([...withOther]);
  });

  it("C2PA と他 JUMBF が共存する場合は C2PA の En だけを除去する", () => {
    const withOther = insertJpegC2pa(
      buildMinimalJpeg(),
      buildDummyC2paJumbf("other"),
      2,
    );
    const withBoth = insertJpegC2pa(withOther, buildDummyC2paJumbf(), 1);
    expect(detectC2pa(withBoth, "image/jpeg")).toBe(true);
    const removed = removeC2pa(withBoth, "image/jpeg");
    expect(detectC2pa(removed, "image/jpeg")).toBe(false);
    // 他 JUMBF（En=2）は残っている
    expect([...removed]).toEqual([...withOther]);
  });

  it("En を再利用する他 JUMBF チェーンが混在しても継続セグメントごと誤って削除しない", () => {
    // JUMBF ヘッド（jumd を含む先頭セグメント）1 つ分の APP11 バイト列を組み立てる
    const buildHeadSegment = (jumbf: Uint8Array, en: number): number[] => {
      const payload = new Uint8Array(8 + jumbf.length);
      payload[0] = 0x4a;
      payload[1] = 0x50; // CI "JP"
      payload[2] = (en >>> 8) & 0xff;
      payload[3] = en & 0xff;
      payload[7] = 0x01; // Z
      payload.set(jumbf, 8);
      const length = 2 + payload.length;
      return [0xff, 0xeb, (length >>> 8) & 0xff, length & 0xff, ...payload];
    };
    // jumd を含まない継続セグメント（同じ En を引き継ぐ想定）の APP11 バイト列
    const buildContinuationSegment = (en: number, data: number[]): number[] => {
      const payload = [
        0x4a,
        0x50, // CI "JP"
        (en >>> 8) & 0xff,
        en & 0xff,
        0x00,
        0x00,
        0x00,
        0x02, // Z
        ...data,
      ];
      const length = 2 + payload.length;
      return [0xff, 0xeb, (length >>> 8) & 0xff, length & 0xff, ...payload];
    };

    const base = buildMinimalJpeg();
    // 無関係な他規格 JUMBF（ラベル "other"）が En=1 を使い、継続セグメントも伴う
    const otherHead = buildHeadSegment(buildDummyC2paJumbf("other"), 1);
    const otherContinuation = buildContinuationSegment(1, [0x61, 0x62]);
    // 直後に C2PA の JUMBF が同じ En=1 を再利用して現れる（不正/悪意あるファイルの想定）
    const c2paHead = buildHeadSegment(buildDummyC2paJumbf(), 1);
    const c2paContinuation = buildContinuationSegment(1, [0x63, 0x64]);
    const inserted = [
      ...otherHead,
      ...otherContinuation,
      ...c2paHead,
      ...c2paContinuation,
    ];

    // SOS の直前（= APP0 の直後）にまとめて挿入する
    const sosIndex = base.findIndex(
      (_, i) => base[i] === 0xff && base[i + 1] === 0xda,
    );
    const chained = new Uint8Array(base.length + inserted.length);
    chained.set(base.subarray(0, sosIndex), 0);
    chained.set(inserted, sosIndex);
    chained.set(base.subarray(sosIndex), sosIndex + inserted.length);

    expect(detectC2pa(chained, "image/jpeg")).toBe(true);
    const removed = removeC2pa(chained, "image/jpeg");
    expect(detectC2pa(removed, "image/jpeg")).toBe(false);

    // En=1 を共有していても、他 JUMBF（"other"）はヘッド・継続セグメントとも温存される
    const preserved = [...otherHead, ...otherContinuation];
    const expected = new Uint8Array(base.length + preserved.length);
    expected.set(base.subarray(0, sosIndex), 0);
    expected.set(preserved, sosIndex);
    expected.set(base.subarray(sosIndex), sosIndex + preserved.length);
    expect([...removed]).toEqual([...expected]);
  });

  it("EXIF（APP1）は C2PA 除去後も残る", () => {
    const withExif = buildJpegWithExif();
    const withBoth = insertJpegC2pa(withExif, buildDummyC2paJumbf());
    const removed = removeC2pa(withBoth, "image/jpeg");
    expect([...removed]).toEqual([...withExif]);
  });

  it("破損 JPEG は detect=false・remove は複製をそのまま返す", () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00]);
    expect(detectC2pa(broken, "image/jpeg")).toBe(false);
    const removed = removeC2pa(broken, "image/jpeg");
    expect([...removed]).toEqual([...broken]);
    expect(removed).not.toBe(broken);
  });
});

describe("PNG の C2PA 検出・除去", () => {
  it("挿入 → 検出 → 除去のラウンドトリップで元のバイナリに戻る", () => {
    const base = buildMinimalPng();
    expect(detectC2pa(base, "image/png")).toBe(false);

    const withC2pa = insertPngC2pa(base, buildDummyC2paJumbf());
    expect(detectC2pa(withC2pa, "image/png")).toBe(true);

    const removed = removeC2pa(withC2pa, "image/png");
    expect(detectC2pa(removed, "image/png")).toBe(false);
    expect([...removed]).toEqual([...base]);
  });

  it("除去後もチャンク構造と CRC が健全（再パース可能）で eXIf は残る", () => {
    const tiff = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a]); // "MM" + 42
    const withExif = insertPngExif(buildMinimalPng(), tiff);
    const withBoth = insertPngC2pa(withExif, buildDummyC2paJumbf());
    const removed = removeC2pa(withBoth, "image/png");

    const chunks = parsePngChunks(removed);
    expect(chunks).not.toBeNull();
    expect(chunks?.some((c) => c.type === "caBX")).toBe(false);
    expect(extractPngExif(removed)).not.toBeNull();
  });

  it("破損 PNG は detect=false・remove は複製をそのまま返す", () => {
    const broken = new Uint8Array([1, 2, 3, 4]);
    expect(detectC2pa(broken, "image/png")).toBe(false);
    expect([...removeC2pa(broken, "image/png")]).toEqual([...broken]);
  });
});

describe("WebP の C2PA 検出・除去", () => {
  it("挿入 → 検出 → 除去のラウンドトリップで元のバイナリに戻る", () => {
    const base = buildMinimalWebp();
    expect(detectC2pa(base, "image/webp")).toBe(false);

    const withC2pa = insertWebpC2pa(base, buildDummyC2paJumbf());
    expect(detectC2pa(withC2pa, "image/webp")).toBe(true);

    const removed = removeC2pa(withC2pa, "image/webp");
    expect(detectC2pa(removed, "image/webp")).toBe(false);
    expect([...removed]).toEqual([...base]);
  });

  it("破損 WebP は detect=false・remove は複製をそのまま返す", () => {
    const broken = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00]);
    expect(detectC2pa(broken, "image/webp")).toBe(false);
    expect([...removeC2pa(broken, "image/webp")]).toEqual([...broken]);
  });
});

describe("非対応 MIME タイプ", () => {
  it("detect は false・remove は複製を返す", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(detectC2pa(bytes, "image/gif")).toBe(false);
    const removed = removeC2pa(bytes, "image/gif");
    expect([...removed]).toEqual([...bytes]);
    expect(removed).not.toBe(bytes);
  });
});
