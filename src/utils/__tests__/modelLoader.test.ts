import { describe, expect, it, vi } from "vitest";
import {
  concatChunks,
  createProgressAggregator,
  type OrtAssetsManifest,
  resolveOrtWasmPartUrls,
} from "../modelLoader";

const manifest: OrtAssetsManifest = {
  version: "1.27.0",
  wasm: {
    name: "ort-wasm-simd-threaded.jsep.wasm",
    size: 100,
    parts: [
      "ort-wasm-simd-threaded.jsep.wasm.part0",
      "ort-wasm-simd-threaded.jsep.wasm.part1",
    ],
  },
};

describe("resolveOrtWasmPartUrls", () => {
  it("basePath とバージョンクエリ付きの URL を組み立てる", () => {
    expect(resolveOrtWasmPartUrls(manifest)).toEqual([
      "/ort/ort-wasm-simd-threaded.jsep.wasm.part0?v=1.27.0",
      "/ort/ort-wasm-simd-threaded.jsep.wasm.part1?v=1.27.0",
    ]);
  });

  it("basePath を差し替えられる", () => {
    const urls = resolveOrtWasmPartUrls(manifest, "/custom/");
    expect(urls[0]).toBe(
      "/custom/ort-wasm-simd-threaded.jsep.wasm.part0?v=1.27.0",
    );
  });

  it("バージョンは URL エンコードされる", () => {
    const urls = resolveOrtWasmPartUrls({
      ...manifest,
      version: "1.0.0-dev+build",
    });
    expect(urls[0]).toContain("?v=1.0.0-dev%2Bbuild");
  });
});

describe("concatChunks", () => {
  it("チャンクを順序どおり結合する", () => {
    const result = concatChunks([
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
      new Uint8Array([4, 5]),
    ]);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it("expectedSize と一致すれば成功する", () => {
    expect(
      concatChunks([new Uint8Array([1, 2]), new Uint8Array([3])], 3),
    ).toHaveLength(3);
  });

  it("expectedSize と不一致なら例外（破損検知）", () => {
    expect(() => concatChunks([new Uint8Array([1, 2])], 3)).toThrow();
  });

  it("空チャンク列は空バッファ", () => {
    expect(concatChunks([])).toHaveLength(0);
  });
});

describe("createProgressAggregator", () => {
  it("複数パートの進捗を合算して通知する", () => {
    const onProgress = vi.fn();
    const report = createProgressAggregator(2, 100, onProgress);
    report(0, 30);
    expect(onProgress).toHaveBeenLastCalledWith(30, 100);
    report(1, 20);
    expect(onProgress).toHaveBeenLastCalledWith(50, 100);
    // 同じパートの更新は加算ではなく置き換え
    report(0, 60);
    expect(onProgress).toHaveBeenLastCalledWith(80, 100);
  });

  it("totalBytes が null でも通知する", () => {
    const onProgress = vi.fn();
    const report = createProgressAggregator(1, null, onProgress);
    report(0, 10);
    expect(onProgress).toHaveBeenLastCalledWith(10, null);
  });

  it("onProgress 未指定でも例外にならない", () => {
    const report = createProgressAggregator(1, 100);
    expect(() => report(0, 10)).not.toThrow();
  });
});
