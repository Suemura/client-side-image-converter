import { describe, expect, it } from "vitest";
import {
  detectWebpEncoding,
  isAnimatedWebp,
  isOptimizableType,
  pickSmallerSize,
  resolveOptimizeEngine,
} from "../optimizeCore";

describe("resolveOptimizeEngine", () => {
  it("PNG / JPEG / WebP を対応エンジンへディスパッチする", () => {
    expect(resolveOptimizeEngine("image/png")).toBe("oxipng");
    expect(resolveOptimizeEngine("image/jpeg")).toBe("mozjpeg");
    expect(resolveOptimizeEngine("image/webp")).toBe("webp");
  });

  it("image/jpg（非標準だが一部ブラウザが使う）も JPEG として扱う", () => {
    expect(resolveOptimizeEngine("image/jpg")).toBe("mozjpeg");
  });

  it("大文字・末尾パラメータの揺れを吸収する", () => {
    expect(resolveOptimizeEngine("IMAGE/PNG")).toBe("oxipng");
    expect(resolveOptimizeEngine("image/jpeg; charset=binary")).toBe("mozjpeg");
    expect(resolveOptimizeEngine("  image/webp  ")).toBe("webp");
  });

  it("対応外の形式は null を返す", () => {
    expect(resolveOptimizeEngine("image/avif")).toBeNull();
    expect(resolveOptimizeEngine("image/bmp")).toBeNull();
    expect(resolveOptimizeEngine("image/tiff")).toBeNull();
    expect(resolveOptimizeEngine("image/heic")).toBeNull();
    expect(resolveOptimizeEngine("image/gif")).toBeNull();
    expect(resolveOptimizeEngine("")).toBeNull();
  });
});

describe("isOptimizableType", () => {
  it("PNG / JPEG / WebP のみ true", () => {
    expect(isOptimizableType("image/png")).toBe(true);
    expect(isOptimizableType("image/jpeg")).toBe(true);
    expect(isOptimizableType("image/webp")).toBe(true);
    expect(isOptimizableType("image/avif")).toBe(false);
    expect(isOptimizableType("image/tiff")).toBe(false);
  });
});

describe("pickSmallerSize", () => {
  it("最適化後が小さいときだけ最適化版を採用する", () => {
    expect(pickSmallerSize(100, 80)).toBe("optimized");
  });

  it("同サイズのときは元を採用する（可逆で得がない）", () => {
    expect(pickSmallerSize(100, 100)).toBe("original");
  });

  it("最適化後が大きいときは元を採用する（no-worse-than-original）", () => {
    expect(pickSmallerSize(100, 120)).toBe("original");
  });
});

// --- detectWebpEncoding 用の RIFF/WebP バイト列組み立てヘルパー ---
const ascii = (s: string): Uint8Array =>
  Uint8Array.from(s, (c) => c.charCodeAt(0));
const u32le = (n: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const concat = (...arrs: Uint8Array[]): Uint8Array => {
  const total = arrs.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
};
/** 先頭チャンクが `fourcc` の単純な WebP（RIFF....WEBP<fourcc>....） */
const simpleWebp = (fourcc: string): Uint8Array =>
  concat(ascii("RIFF"), u32le(0), ascii("WEBP"), ascii(fourcc), u32le(0));
/** チャンク（fourcc + size + padding 済み payload） */
const chunk = (fourcc: string, size: number): Uint8Array =>
  concat(ascii(fourcc), u32le(size), new Uint8Array(size + (size % 2)));
/** VP8X 拡張フォーマット（VP8X チャンクに続けて `subChunks` を並べる） */
const vp8xWebp = (...subChunks: Uint8Array[]): Uint8Array =>
  concat(
    ascii("RIFF"),
    u32le(0),
    ascii("WEBP"),
    chunk("VP8X", 10),
    ...subChunks,
  );

describe("detectWebpEncoding", () => {
  it("VP8L 先頭チャンクをロスレスと判定する", () => {
    expect(detectWebpEncoding(simpleWebp("VP8L"))).toBe("lossless");
  });

  it("VP8（末尾スペース）先頭チャンクをロッシーと判定する", () => {
    expect(detectWebpEncoding(simpleWebp("VP8 "))).toBe("lossy");
  });

  it("VP8X 拡張内の VP8L サブチャンクをロスレスと判定する", () => {
    expect(detectWebpEncoding(vp8xWebp(chunk("VP8L", 5)))).toBe("lossless");
  });

  it("VP8X 拡張内の VP8 サブチャンクをロッシーと判定する", () => {
    expect(detectWebpEncoding(vp8xWebp(chunk("VP8 ", 5)))).toBe("lossy");
  });

  it("VP8X で奇数長チャンクを跨いでも 2 バイトパディングを正しく処理する", () => {
    // ALPH(3 バイト → 1 バイトパディング) の後ろの VP8L を見つけられること
    expect(
      detectWebpEncoding(vp8xWebp(chunk("ALPH", 3), chunk("VP8L", 4))),
    ).toBe("lossless");
  });

  it("VP8X 拡張に VP8L/VP8 サブチャンクが無ければ unknown", () => {
    expect(
      detectWebpEncoding(vp8xWebp(chunk("ICCP", 4), chunk("EXIF", 6))),
    ).toBe("unknown");
  });

  it("RIFF/WEBP マジックが一致しない場合は unknown", () => {
    expect(
      detectWebpEncoding(concat(ascii("RIFF"), u32le(0), ascii("AVI "))),
    ).toBe("unknown");
    expect(detectWebpEncoding(ascii("not an image at all"))).toBe("unknown");
  });

  it("16 バイト未満の入力は unknown", () => {
    expect(detectWebpEncoding(new Uint8Array(8))).toBe("unknown");
  });
});

describe("isAnimatedWebp", () => {
  it("VP8X 拡張内に ANIM チャンクがあればアニメーションと判定する", () => {
    expect(isAnimatedWebp(vp8xWebp(chunk("ANIM", 6), chunk("ANMF", 16)))).toBe(
      true,
    );
  });

  it("VP8X でも ANIM チャンクが無ければ false（静止画）", () => {
    expect(isAnimatedWebp(vp8xWebp(chunk("VP8L", 5)))).toBe(false);
  });

  it("単純形式（VP8L / VP8）は VP8X ではないため false", () => {
    expect(isAnimatedWebp(simpleWebp("VP8L"))).toBe(false);
    expect(isAnimatedWebp(simpleWebp("VP8 "))).toBe(false);
  });

  it("非 WebP・短すぎる入力は false", () => {
    expect(isAnimatedWebp(ascii("not an image at all"))).toBe(false);
    expect(isAnimatedWebp(new Uint8Array(8))).toBe(false);
  });
});
