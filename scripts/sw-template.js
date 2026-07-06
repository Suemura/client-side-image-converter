// Service Worker 本体のテンプレート。
// scripts/generate-sw.ts がビルド後に out/ を走査し、下記のキャッシュ名と
// プリキャッシュ URL 一覧のプレースホルダを実値へ差し替えて out/sw.js を出力する。
//
// 方針:
// - install: プリキャッシュ URL を個別に allSettled でキャッシュする。addAll は 1 つでも
//   失敗すると install 全体が reject され SW が activate されず「オフラインが一切効かない」状態に
//   サイレントに陥るため、耐障害性を優先して個別キャッシュにする。失敗した URL は console.warn で
//   可視化し、保守時に気付けるようにする（一時的なネットワークエラー等で一部が欠けても、
//   残りのアセットはオフラインで利用できる）
// - activate: 現行バージョン以外の古いキャッシュを削除し、clients.claim で初回訪問タブも制御下に置く
//   （skipWaiting は付けない。セッション中の突然のアセット差し替えを防ぎ、更新は次回起動時に反映）
// - fetch: ハッシュ付きアセットは cache-first。ナビゲーションは cache → network → キャッシュ済み "/" にフォールバック

const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url)),
      );
      const failed = PRECACHE_URLS.filter(
        (_, i) => results[i].status === "rejected",
      );
      if (failed.length > 0) {
        console.warn(
          `[sw] precache: ${failed.length}/${PRECACHE_URLS.length} 件の URL をキャッシュできませんでした（該当機能はオフラインで動作しない可能性があります）`,
          failed,
        );
      }
    })(),
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
