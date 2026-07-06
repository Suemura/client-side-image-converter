// Service Worker のプリキャッシュ対象を決める純粋ロジック。
// ビルド時のジェネレーター（scripts/generate-sw.ts）と単体テストの両方から使う。
// Canvas / DOM / Node API 非依存にして vitest でそのまま検証できるようにする。

// プリキャッシュから除外するファイル（相対パスは posix 区切り "/" 前提）。
// - sw.js: Service Worker 自身
// - _headers: Cloudflare Pages のヘッダー設定（配信対象のアセットではない）
// - robots.txt / sitemap*.xml: SEO 用でオフライン動作に不要
const DENY_EXACT = new Set(["sw.js", "_headers", "robots.txt"]);

function isDenied(relPath: string): boolean {
  if (DENY_EXACT.has(relPath)) return true;
  // ソースマップはオフライン動作に不要でサイズも大きい
  if (relPath.endsWith(".map")) return true;
  // sitemap.xml / sitemap-0.xml など
  if (/^sitemap.*\.xml$/.test(relPath)) return true;
  return false;
}

/** out/ 配下の相対パスがプリキャッシュ対象かどうかを判定する。 */
export function shouldPrecache(relPath: string): boolean {
  return !isDenied(relPath);
}

/**
 * out/ 配下の相対パスを、Service Worker がキャッシュ／配信で使う URL に変換する。
 * trailingSlash: true の静的エクスポートに合わせ、index.html はディレクトリ URL にする。
 * - "index.html"        -> "/"
 * - "convert/index.html" -> "/convert/"
 * - "_next/static/x.js"  -> "/_next/static/x.js"
 */
export function toCacheUrl(relPath: string): string {
  const normalized = relPath.split("\\").join("/");
  if (normalized === "index.html") return "/";
  if (normalized.endsWith("/index.html")) {
    return `/${normalized.slice(0, -"index.html".length)}`;
  }
  return `/${normalized}`;
}

/**
 * out/ 配下の相対パス一覧から、プリキャッシュする URL 一覧を組み立てる。
 * 重複を排除し安定ソートすることで、バージョン算出（computeCacheVersion）を決定的にする。
 */
export function buildPrecacheUrls(relPaths: string[]): string[] {
  const urls = relPaths.filter(shouldPrecache).map(toCacheUrl);
  return Array.from(new Set(urls)).sort();
}

/**
 * プリキャッシュ URL 一覧からキャッシュのバージョン文字列（FNV-1a 32bit の hex）を算出する。
 * URL には内容ハッシュ付きのファイル名（_next/static/**）が含まれるため、
 * アセットが変わったときだけバージョンが変わり、無駄なキャッシュ再構築を避けられる。
 */
export function computeCacheVersion(urls: string[]): string {
  const input = [...urls].sort().join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** バージョン文字列からキャッシュ名を組み立てる。デプロイごとの旧キャッシュ削除の判定に使う。 */
export function getCacheName(version: string): string {
  return `wic-precache-${version}`;
}
