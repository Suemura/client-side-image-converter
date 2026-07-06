// Service Worker 本体のテンプレート。
// scripts/generate-sw.ts がビルド後に out/ を走査し、下記のキャッシュ名と
// プリキャッシュ URL 一覧のプレースホルダを実値へ差し替えて out/sw.js を出力する。
//
// 方針:
// - install: プリキャッシュ URL 一式を addAll でキャッシュ（全アセットが揃うのでオフラインで全機能が動く）
// - activate: 現行バージョン以外の古いキャッシュを削除し、clients.claim で初回訪問タブも制御下に置く
//   （skipWaiting は付けない。セッション中の突然のアセット差し替えを防ぎ、更新は次回起動時に反映）
// - fetch: ハッシュ付きアセットは cache-first。ナビゲーションは cache → network → キャッシュ済み "/" にフォールバック

const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET かつ同一オリジンのみ対象（外部リクエストや POST 等は素通し）
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          return await fetch(request);
        } catch {
          // オフラインで未キャッシュのページへ遷移した場合はトップページを返す
          const fallback = await cache.match("/");
          return fallback ?? Response.error();
        }
      })(),
    );
    return;
  }

  // JS / CSS / 画像 / フォント / WASM 等はハッシュ付きファイル名なので cache-first で安全
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return Response.error();
      }
    })(),
  );
});
