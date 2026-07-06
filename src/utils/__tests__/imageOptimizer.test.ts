import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsquash の各コーデック（WASM）は happy-dom で動かないため、動的 import 先をモックして
// ディスパッチ・no-worse-than-original・WebP のロスレス/ロッシー切替を検証する。
// モックの specifier は imageOptimizer.ts の `import()` と完全一致させること。
vi.mock("@jsquash/oxipng/optimise.js", () => ({ default: vi.fn() }));
vi.mock("@jsquash/jpeg/decode.js", () => ({ default: vi.fn() }));
vi.mock("@jsquash/jpeg/encode.js", () => ({ default: vi.fn() }));
vi.mock("@jsquash/webp/decode.js", () => ({ default: vi.fn() }));
vi.mock("@jsquash/webp/encode.js", () => ({ default: vi.fn() }));

import jpegDecode from "@jsquash/jpeg/decode.js";
import jpegEncode from "@jsquash/jpeg/encode.js";
import oxipngOptimise from "@jsquash/oxipng/optimise.js";
import webpDecode from "@jsquash/webp/decode.js";
import webpEncode from "@jsquash/webp/encode.js";
import { optimizeImage, optimizeImageBuffer } from "../imageOptimizer";

/** 指定バイト数の ArrayBuffer（内容 1 埋め） */
const bufOfSize = (n: number): ArrayBuffer => new Uint8Array(n).fill(1).buffer;

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
/** 先頭チャンク fourcc の WebP バイト列（padding 込み） */
const webpBytes = (fourcc: string, payload = 8): ArrayBuffer => {
  const bytes = concat(
    ascii("RIFF"),
    u32le(0),
    ascii("WEBP"),
    ascii(fourcc),
    u32le(payload),
    new Uint8Array(payload),
  );
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
};

const fakeImageData = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(4),
  colorSpace: "srgb",
} as ImageData;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jpegDecode).mockResolvedValue(fakeImageData);
  vi.mocked(webpDecode).mockResolvedValue(fakeImageData);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("optimizeImageBuffer - ディスパッチ", () => {
  it("PNG は oxipng で最適化する", async () => {
    vi.mocked(oxipngOptimise).mockResolvedValue(bufOfSize(50));
    const result = await optimizeImageBuffer(bufOfSize(100), "image/png");

    expect(oxipngOptimise).toHaveBeenCalledTimes(1);
    expect(jpegEncode).not.toHaveBeenCalled();
    expect(result.optimized).toBe(true);
    expect(result.mime).toBe("image/png");
    expect(result.buffer.byteLength).toBe(50);
  });

  it("JPEG は decode → encode で再エンコードし progressive + trellis を指定する", async () => {
    vi.mocked(jpegEncode).mockResolvedValue(bufOfSize(40));
    const result = await optimizeImageBuffer(bufOfSize(100), "image/jpeg");

    expect(jpegDecode).toHaveBeenCalledTimes(1);
    // EXIF Orientation をピクセルへ焼き込むため preserveOrientation を有効にする
    expect(vi.mocked(jpegDecode).mock.calls[0][1]).toMatchObject({
      preserveOrientation: true,
    });
    expect(jpegEncode).toHaveBeenCalledTimes(1);
    const options = vi.mocked(jpegEncode).mock.calls[0][1];
    expect(options).toMatchObject({
      progressive: true,
      optimize_coding: true,
      trellis_multipass: true,
    });
    expect(options?.quality).toBeGreaterThanOrEqual(1);
    expect(result.mime).toBe("image/jpeg");
    expect(result.optimized).toBe(true);
  });
});

describe("optimizeImageBuffer - WebP のロスレス/ロッシー切替", () => {
  it("ロスレス(VP8L)入力はロスレスで再エンコードする", async () => {
    vi.mocked(webpEncode).mockResolvedValue(bufOfSize(40));
    await optimizeImageBuffer(webpBytes("VP8L"), "image/webp");

    expect(webpDecode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(webpEncode).mock.calls[0][1]).toMatchObject({
      lossless: 1,
    });
  });

  it("ロッシー(VP8)入力は高品質ロッシーで再エンコードする（lossless を付けない）", async () => {
    vi.mocked(webpEncode).mockResolvedValue(bufOfSize(40));
    await optimizeImageBuffer(webpBytes("VP8 "), "image/webp");

    const options = vi.mocked(webpEncode).mock.calls[0][1];
    expect(options?.lossless).toBeUndefined();
    expect(options?.quality).toBeGreaterThanOrEqual(1);
  });
});

describe("optimizeImageBuffer - no-worse-than-original", () => {
  it("最適化後が元より大きいときは元バイトをそのまま採用する", async () => {
    const input = bufOfSize(100);
    // oxipng が元(100)より大きい結果(200)を返しても元を採用する
    vi.mocked(oxipngOptimise).mockResolvedValue(bufOfSize(200));
    const result = await optimizeImageBuffer(input, "image/png");

    expect(result.optimized).toBe(false);
    expect(result.buffer).toBe(input); // 元の ArrayBuffer をそのまま返す
    expect(result.buffer.byteLength).toBe(100);
    expect(result.mime).toBe("image/png");
  });

  it("最適化後が元と同サイズのときも元を採用する", async () => {
    const input = bufOfSize(100);
    vi.mocked(oxipngOptimise).mockResolvedValue(bufOfSize(100));
    const result = await optimizeImageBuffer(input, "image/png");

    expect(result.optimized).toBe(false);
    expect(result.buffer).toBe(input);
  });
});

describe("optimizeImageBuffer - 対応外形式", () => {
  it("対応外の MIME は throw する（WASM を import しない）", async () => {
    await expect(
      optimizeImageBuffer(bufOfSize(100), "image/bmp"),
    ).rejects.toThrow();
    expect(oxipngOptimise).not.toHaveBeenCalled();
    expect(jpegDecode).not.toHaveBeenCalled();
    expect(webpDecode).not.toHaveBeenCalled();
  });
});

describe("optimizeImage - メインスレッドラッパー", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
  });

  it("最適化結果でファイル名・拡張子を維持した ConversionResult を返す", async () => {
    vi.mocked(oxipngOptimise).mockResolvedValue(bufOfSize(30));
    const file = new File([new Uint8Array(100)], "photo.png", {
      type: "image/png",
    });
    const result = await optimizeImage(file);

    expect(result.filename).toBe("photo.png"); // 同一フォーマットのため名前維持
    expect(result.originalFilename).toBe("photo.png");
    expect(result.convertedSize).toBe(30);
    expect(result.originalSize).toBe(100);
  });

  it("対応外形式のファイルは reject する（失敗通知に載る）", async () => {
    const file = new File([new Uint8Array(10)], "image.bmp", {
      type: "image/bmp",
    });
    await expect(optimizeImage(file)).rejects.toThrow();
  });
});
