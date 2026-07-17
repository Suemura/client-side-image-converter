import { describe, expect, it } from "vitest";
import {
  buildPrecacheUrls,
  computeCacheVersion,
  getCacheName,
  shouldPrecache,
  toCacheUrl,
} from "../precache";

describe("shouldPrecache", () => {
  it("アプリのアセットはプリキャッシュ対象", () => {
    expect(shouldPrecache("index.html")).toBe(true);
    expect(shouldPrecache("convert/index.html")).toBe(true);
    expect(shouldPrecache("_next/static/chunks/main-abc123.js")).toBe(true);
    expect(shouldPrecache("_next/static/css/abc.css")).toBe(true);
    expect(shouldPrecache("_next/static/media/font-abc.woff2")).toBe(true);
    expect(shouldPrecache("_next/static/media/enc-abc.wasm")).toBe(true);
    expect(shouldPrecache("icons/icon-192.png")).toBe(true);
    expect(shouldPrecache("manifest.webmanifest")).toBe(true);
    // Next の RSC ペイロード（.txt）はソフトナビゲーションで使うので含める
    expect(shouldPrecache("__next.__PAGE__.txt")).toBe(true);
  });

  it("SW 自身・Cloudflare 設定・SEO ファイル・ソースマップは除外", () => {
    expect(shouldPrecache("sw.js")).toBe(false);
    expect(shouldPrecache("_headers")).toBe(false);
    expect(shouldPrecache("robots.txt")).toBe(false);
    expect(shouldPrecache("sitemap.xml")).toBe(false);
    expect(shouldPrecache("sitemap-0.xml")).toBe(false);
    expect(shouldPrecache("_next/static/chunks/main-abc123.js.map")).toBe(
      false,
    );
  });

  it("AI モデルと ort ランタイムは除外（初回インストール肥大防止・実行時に別キャッシュへ）", () => {
    expect(shouldPrecache("models/realesr-general-x4v3.onnx")).toBe(false);
    expect(shouldPrecache("models/CREDITS.md")).toBe(false);
    expect(shouldPrecache("ort/ort-wasm-simd-threaded.jsep.mjs")).toBe(false);
    expect(shouldPrecache("ort/ort-wasm-simd-threaded.jsep.wasm.part0")).toBe(
      false,
    );
    expect(shouldPrecache("ort/ort-assets.json")).toBe(false);
  });
});

describe("toCacheUrl", () => {
  it("index.html はディレクトリ URL（trailingSlash）に変換する", () => {
    expect(toCacheUrl("index.html")).toBe("/");
    expect(toCacheUrl("convert/index.html")).toBe("/convert/");
    expect(toCacheUrl("crop/index.html")).toBe("/crop/");
    expect(toCacheUrl("404/index.html")).toBe("/404/");
  });

  it("その他のファイルは先頭スラッシュ付きの絶対 URL にする", () => {
    expect(toCacheUrl("_next/static/chunks/main-abc.js")).toBe(
      "/_next/static/chunks/main-abc.js",
    );
    expect(toCacheUrl("icons/icon-192.png")).toBe("/icons/icon-192.png");
    expect(toCacheUrl("manifest.webmanifest")).toBe("/manifest.webmanifest");
    expect(toCacheUrl("404.html")).toBe("/404.html");
  });

  it("Windows のバックスラッシュ区切りも posix に正規化する", () => {
    expect(toCacheUrl("convert\\index.html")).toBe("/convert/");
    expect(toCacheUrl("_next\\static\\a.js")).toBe("/_next/static/a.js");
  });
});

describe("buildPrecacheUrls", () => {
  it("除外対象を落とし、変換・重複排除・安定ソートする", () => {
    const urls = buildPrecacheUrls([
      "index.html",
      "convert/index.html",
      "sw.js",
      "robots.txt",
      "sitemap.xml",
      "_next/static/chunks/a.js",
      "_next/static/chunks/a.js.map",
      "icons/icon-192.png",
    ]);
    expect(urls).toEqual([
      "/",
      "/_next/static/chunks/a.js",
      "/convert/",
      "/icons/icon-192.png",
    ]);
  });

  it("同じ URL に解決される入力は 1 つにまとめる", () => {
    const urls = buildPrecacheUrls([
      "convert/index.html",
      "convert/index.html",
    ]);
    expect(urls).toEqual(["/convert/"]);
  });
});

describe("computeCacheVersion", () => {
  it("同じ入力からは同じバージョンを返す（順序非依存）", () => {
    const a = computeCacheVersion(["/", "/convert/", "/a.js"]);
    const b = computeCacheVersion(["/a.js", "/convert/", "/"]);
    expect(a).toBe(b);
  });

  it("内容（URL 一覧）が変わればバージョンが変わる", () => {
    const a = computeCacheVersion(["/_next/static/a-hash1.js"]);
    const b = computeCacheVersion(["/_next/static/a-hash2.js"]);
    expect(a).not.toBe(b);
  });

  it("8 桁の 16 進文字列を返す", () => {
    expect(computeCacheVersion(["/"])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("getCacheName", () => {
  it("バージョンを含むキャッシュ名を返す", () => {
    expect(getCacheName("deadbeef")).toBe("wic-precache-deadbeef");
  });
});
