import { describe, expect, it } from "vitest";
import { pngQualityStrategy } from "../pngQuality";

describe("pngQualityStrategy", () => {
  it("品質 95 以上はロスレス", () => {
    expect(pngQualityStrategy(100)).toBe("lossless");
    expect(pngQualityStrategy(95)).toBe("lossless");
  });

  it("品質 70〜94 は圧縮ヒント付き", () => {
    expect(pngQualityStrategy(94)).toBe("compressed");
    expect(pngQualityStrategy(70)).toBe("compressed");
  });

  it("品質 70 未満は JPEG ラウンドトリップ", () => {
    expect(pngQualityStrategy(69)).toBe("jpeg-roundtrip");
    expect(pngQualityStrategy(1)).toBe("jpeg-roundtrip");
    expect(pngQualityStrategy(0)).toBe("jpeg-roundtrip");
  });

  it("メインスレッド版 convertToPngWithQuality と同じ閾値（95 / 70）", () => {
    // 境界値の回帰を防ぐ（convertToPngWithQuality の分岐と一致させる）
    expect(pngQualityStrategy(95)).toBe("lossless");
    expect(pngQualityStrategy(94.9)).toBe("compressed");
    expect(pngQualityStrategy(70)).toBe("compressed");
    expect(pngQualityStrategy(69.9)).toBe("jpeg-roundtrip");
  });
});
