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
// - share_target: 静的エクスポートは POST を受けられないため、共有シートからの POST を
//   intercept して multipart ボディを一時キャッシュへ保管し、受け口ページへ 303 リダイレクトする
//   （Issue #105。定数は src/utils/shareTarget.ts から注入される）

const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE_URLS = __PRECACHE_URLS__;
const SHARE_TARGET_ACTION = "__SHARE_TARGET_ACTION__";
const SHARE_CACHE_NAME = "__SHARE_CACHE_NAME__";
const SHARE_PAYLOAD_URL = "__SHARE_PAYLOAD_URL__";
const SHARE_RECEIVE_PATH = "__SHARE_RECEIVE_PATH__";

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
          .filter(
            (key) =>
              // 旧バージョンのプリキャッシュだけを削除する。それ以外の固定名キャッシュ
              // （AI モデル用の wic-model-cache 等）はデプロイをまたいで保持する
              (key.startsWith("wic-precache-") && key !== CACHE_NAME) ||
              // 共有ペイロードの一時キャッシュは取り残し掃除として従来どおり削除する
              key === SHARE_CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 同一オリジンのみ対象（外部リクエストは素通し）
  if (url.origin !== self.location.origin) return;

  // 共有シート（share_target）の POST を intercept する。multipart ボディを
  // 一時キャッシュへ保管し終えてから受け口ページへ 303 を返す（waitUntil での
  // 並行保存は、遷移先ページの読み取りが保存前に走るレースがあるため使わない）
  //
  // ハードニング: リクエスト URL が同一オリジンというだけでは発火元を問わないため、
  // 悪意あるページの <form action="<本アプリ>/share-target" method="post"> でも
  // ペイロードを注入できてしまう。Sec-Fetch-Site が "cross-site" のときだけ確実に
  // 危険（他サイト起点）と判定できるので intercept せず素通しする（静的エクスポートは
  // POST を処理できないため 405 相当がそのまま返る）。same-origin / same-site / none
  // （ヘッダー自体が未送出の非対応ブラウザを含む）は共有シート本来の遷移でも
  // 取り得る値なので許容する。
  if (
    request.method === "POST" &&
    url.pathname === SHARE_TARGET_ACTION &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  ) {
    event.respondWith(
      (async () => {
        try {
          const cache = await caches.open(SHARE_CACHE_NAME);
          await cache.put(
            SHARE_PAYLOAD_URL,
            new Response(await request.arrayBuffer(), {
              headers: {
                // multipart の boundary を含む Content-Type を保持する
                // （欠けると受け口ページの formData() がパースできない）
                "content-type": request.headers.get("content-type") ?? "",
              },
            }),
          );
        } catch (error) {
          // 保管に失敗しても受け口ページへは遷移させる（空状態が表示される）
          console.warn("[sw] 共有ペイロードを保管できませんでした", error);
        }
        return Response.redirect(SHARE_RECEIVE_PATH, 303);
      })(),
    );
    return;
  }

  // 以降は GET のみ対象（その他のメソッドは素通し）
  if (request.method !== "GET") return;

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
