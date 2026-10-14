import { describe, expect, it } from "vitest";
import type { ConversionOptions } from "../../utils/conversionCore";
import { resolveWorkerTimeoutMs } from "../imageProcessingPool";

/** テスト用の変換オプションを組み立てる */
const options = (
  overrides: Partial<ConversionOptions> = {},
): ConversionOptions => ({
  format: "jpeg",
  quality: 80,
  maintainAspectRatio: true,
  ...overrides,
});

describe("resolveWorkerTimeoutMs", () => {
  it("標準ジョブ（standard デコード × JPEG/PNG/WebP 出力）は通常タイムアウト", () => {
    expect(resolveWorkerTimeoutMs("standard", options())).toBe(60_000);
    expect(resolveWorkerTimeoutMs("heic", options({ format: "png" }))).toBe(
      60_000,
    );
    expect(resolveWorkerTimeoutMs("tiff", options({ format: "webp" }))).toBe(
      60_000,
    );
  });

  it("RAW 入力は出力形式によらず重量ジョブとして延長する", () => {
    expect(resolveWorkerTimeoutMs("raw", options())).toBe(300_000);
    expect(resolveWorkerTimeoutMs("raw", options({ format: "avif" }))).toBe(
      300_000,
    );
  });

  it("AVIF 出力はデコード種別によらず重量ジョブとして延長する", () => {
    expect(
      resolveWorkerTimeoutMs("standard", options({ format: "avif" })),
    ).toBe(300_000);
    expect(resolveWorkerTimeoutMs("heic", options({ format: "avif" }))).toBe(
      300_000,
    );
  });

  it("optimize モードでは format は無視されるため AVIF 指定でも延長しない", () => {
    expect(
      resolveWorkerTimeoutMs(
        "standard",
        options({ format: "avif", mode: "optimize" }),
      ),
    ).toBe(60_000);
  });

  it("JXL 出力はデコード種別によらず重量ジョブとして延長する", () => {
    expect(resolveWorkerTimeoutMs("standard", options({ format: "jxl" }))).toBe(
      300_000,
    );
    expect(resolveWorkerTimeoutMs("heic", options({ format: "jxl" }))).toBe(
      300_000,
    );
  });

  it("optimize モードでは JXL 指定でも延長しない", () => {
    expect(
      resolveWorkerTimeoutMs(
        "standard",
        options({ format: "jxl", mode: "optimize" }),
      ),
    ).toBe(60_000);
  });
});
