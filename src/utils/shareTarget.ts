/**
 * Web Share Target（スマホ共有シートからの画像受け取り）の純粋ロジック。
 * ビルド時のジェネレーター（scripts/generate-sw.ts）・受け口ページ（/share）・
 * 単体テストの三者から共有する。precache.ts と同じく Node の型ストリップ実行で
 * 直接 import されるため、runtime import を一切持たないこと（import type のみ可）。
 *
 * 静的エクスポートでは share_target の POST をサーバーが受けられないため、
 * Service Worker が POST を intercept して multipart ボディをそのまま一時キャッシュへ
 * 保管し（scripts/sw-template.js）、受け口ページが読み取りと同時に削除する。
 * リロード後にファイルを残さないプライバシー設計を readSharedPayload で担保する。
 */

/** manifest の share_target.action（実ファイルが存在しない仮想パス。SW が intercept する） */
export const SHARE_TARGET_ACTION = "/share-target";

/** 共有の受け口ページ（trailingSlash: true の静的エクスポートに合わせ末尾スラッシュ付き） */
export const SHARE_RECEIVE_PATH = "/share/";

/**
 * 共有ペイロードの一時保管に使うキャッシュ名。
 * precache の "wic-precache-<hash>" とは衝突しない固定名。SW の activate は
 * このキャッシュも削除対象にするが、取り残されたペイロードの掃除として意図した挙動。
 */
export const SHARE_CACHE_NAME = "wic-share-payload";

/** 一時保管エントリのキャッシュキー（実在しないパスをキーとして使う） */
export const SHARE_PAYLOAD_URL = "/share-payload";

/** share_target の params.files のフィールド名（manifest と受け口ページで共有） */
export const SHARE_FORM_FIELD = "images";

/** manifest.webmanifest に出力する share_target エントリ（Web App Manifest 仕様の形） */
export interface ShareTargetManifestEntry {
  action: string;
  method: "POST";
  enctype: "multipart/form-data";
  params: {
    files: { name: string; accept: string[] }[];
  };
}

/** share_target の manifest エントリを組み立てる。accept には受理する MIME 一覧を渡す */
export function buildShareTargetManifestEntry(
  accept: readonly string[],
): ShareTargetManifestEntry {
  return {
    action: SHARE_TARGET_ACTION,
    method: "POST",
    enctype: "multipart/form-data",
    params: {
      files: [{ name: SHARE_FORM_FIELD, accept: [...accept] }],
    },
  };
}

/** 共有ペイロードの FormData から File のみを取り出す（文字列値・空ファイルは除外） */
export function extractSharedFiles(formData: FormData): File[] {
  return formData
    .getAll(SHARE_FORM_FIELD)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

/**
 * readSharedPayload が必要とする最小のキャッシュ操作（CacheStorage の構造的サブセット）。
 * 実ブラウザの window.caches をそのまま渡せる。単体テストでは formData() を直接返す
 * フェイクを注入し、multipart パースの実挙動（ブラウザ標準実装）は E2E 側で検証する。
 */
export interface SharePayloadCache {
  match(url: string): Promise<{ formData(): Promise<FormData> } | undefined>;
  delete(url: string): Promise<boolean>;
}

/** CacheStorage の構造的サブセット（open のみ） */
export interface SharePayloadCacheStorage {
  open(cacheName: string): Promise<SharePayloadCache>;
}

/**
 * SW が保管した共有ペイロードを読み取り、共有された File 一覧を返す。
 * - エントリなし（直接アクセス・リロード後）は null
 * - エントリはパースより先に削除する（パースに失敗してもファイルを残さない fail-safe）
 */
export async function readSharedPayload(
  cacheStorage: SharePayloadCacheStorage,
): Promise<File[] | null> {
  const cache = await cacheStorage.open(SHARE_CACHE_NAME);
  const stored = await cache.match(SHARE_PAYLOAD_URL);
  if (!stored) {
    return null;
  }
  await cache.delete(SHARE_PAYLOAD_URL);
  try {
    return extractSharedFiles(await stored.formData());
  } catch {
    // multipart として解釈できないペイロード（破損等）はファイルなし扱いにする
    return null;
  }
}
