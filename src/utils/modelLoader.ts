/**
 * ONNX モデル / onnxruntime-web ランタイムアセットの共通ローダー。
 *
 * - fetch の ReadableStream からダウンロード進捗を通知する
 * - 取得結果を Cache Storage の固定名キャッシュ（wic-model-cache）へ保存し、
 *   2 回目以降はネットワークを使わない（オフライン動作も担保）。
 *   Service Worker の activate はプリキャッシュ（wic-precache-*）だけを削除するため、
 *   このキャッシュはデプロイをまたいで生存する（scripts/sw-template.js 参照）
 * - Cloudflare Pages の 25MiB 上限のため分割配置された WASM 本体
 *   （scripts/copy-ort-assets.ts 参照）をマニフェストに従い取得・結合する
 *
 * fetch / Cache Storage 非依存の純粋ロジック（URL 解決・チャンク結合・進捗集計）は
 * 関数として分離し単体テスト対象とする。背景除去など他の ONNX 機能とも共有する基盤。
 */

/** モデル・ランタイム取得結果の保存先キャッシュ名（デプロイをまたいで保持される固定名） */
export const MODEL_CACHE_NAME = "wic-model-cache";

/** ort ランタイムアセットの配置ディレクトリ（copy-ort-assets.ts の出力先） */
export const ORT_ASSETS_BASE_PATH = "/ort/";

/**
 * 超解像モデルのバージョン識別子。
 * モデルファイルを差し替える際はここを上げる（`wic-model-cache` は固定名で
 * デプロイをまたいで生存するため、クエリを変えないと古いバイナリが
 * 既存ユーザーのキャッシュに残り続けてしまう）。
 */
const UPSCALE_MODEL_VERSION = "1";

/** 超解像モデルの配信 URL（public/models/ に同梱。出所は public/models/CREDITS.md） */
export const UPSCALE_MODEL_URL = `/models/realesr-general-x4v3.onnx?v=${UPSCALE_MODEL_VERSION}`;

/** copy-ort-assets.ts が生成する分割マニフェストの形 */
export interface OrtAssetsManifest {
  version: string;
  wasm: {
    name: string;
    size: number;
    parts: string[];
  };
}

/** ダウンロード進捗（total は Content-Length 不明時 null） */
export type AssetProgressCallback = (
  loadedBytes: number,
  totalBytes: number | null,
) => void;

/**
 * マニフェストから WASM チャンクの取得 URL 一覧を解決する（純粋ロジック）。
 * onnxruntime-web の更新時に古いキャッシュエントリと取り違えないよう、
 * URL にバージョンをクエリとして付与してキャッシュキーを分離する
 * （静的配信ではクエリは無視されるため取得先は同じファイルになる）。
 */
export const resolveOrtWasmPartUrls = (
  manifest: OrtAssetsManifest,
  basePath: string = ORT_ASSETS_BASE_PATH,
): string[] =>
  manifest.wasm.parts.map(
    (part) => `${basePath}${part}?v=${encodeURIComponent(manifest.version)}`,
  );

/**
 * 取得済みチャンクを 1 つの Uint8Array へ結合する（純粋ロジック）。
 * @param expectedSize - 期待する総バイト数（一致しない場合は破損とみなし例外）
 */
export const concatChunks = (
  chunks: readonly Uint8Array[],
  expectedSize?: number,
): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (expectedSize !== undefined && total !== expectedSize) {
    throw new Error(
      `アセットのサイズが一致しません（expected: ${expectedSize}, actual: ${total}）`,
    );
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

/**
 * 複数アセットのダウンロード進捗を合算して 1 本の進捗にする集計器を生成する
 * （純粋ロジック）。part ごとの loaded を更新し、合計を onProgress へ通知する。
 */
export const createProgressAggregator = (
  partCount: number,
  totalBytes: number | null,
  onProgress?: AssetProgressCallback,
): ((partIndex: number, loadedBytes: number) => void) => {
  const loaded = new Array<number>(partCount).fill(0);
  return (partIndex: number, loadedBytes: number): void => {
    loaded[partIndex] = loadedBytes;
    onProgress?.(
      loaded.reduce((sum, bytes) => sum + bytes, 0),
      totalBytes,
    );
  };
};

/** Cache Storage が使える環境か（http 配信・非対応ブラウザでは undefined になる） */
const isCacheAvailable = (): boolean => typeof caches !== "undefined";

/**
 * Response のボディを進捗通知しながら最後まで読み取る。
 * body ストリームが取れない環境では arrayBuffer() へフォールバックする。
 */
const readBodyWithProgress = async (
  response: Response,
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<Uint8Array> => {
  const contentLength = response.headers.get("content-length");
  const total = contentLength ? Number.parseInt(contentLength, 10) : null;
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress?.(buffer.length, total ?? buffer.length);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  return concatChunks(chunks);
};

/**
 * URL のアセットを Cache Storage 優先で取得する。
 * キャッシュミス時はネットワークから取得し、成功したらキャッシュへ保存する。
 * ダウンロード進捗（キャッシュヒット時は即座に完了通知）を onProgress へ通知する。
 */
export const fetchAssetWithCache = async (
  url: string,
  onProgress?: AssetProgressCallback,
): Promise<Uint8Array> => {
  const cache = isCacheAvailable() ? await caches.open(MODEL_CACHE_NAME) : null;
  const cached = await cache?.match(url);
  if (cached) {
    const buffer = new Uint8Array(await cached.arrayBuffer());
    onProgress?.(buffer.length, buffer.length);
    return buffer;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `アセットの取得に失敗しました: ${url} (${response.status})`,
    );
  }
  const buffer = await readBodyWithProgress(response, onProgress);

  // キャッシュ保存の失敗（ストレージ逼迫等）は致命ではないため握りつぶす
  try {
    await cache?.put(
      url,
      new Response(buffer.slice().buffer, {
        headers: {
          "content-type":
            response.headers.get("content-type") ?? "application/octet-stream",
          "content-length": String(buffer.length),
        },
      }),
    );
  } catch (error) {
    console.warn("モデルキャッシュへの保存に失敗しました:", error);
  }
  return buffer;
};

/**
 * onnxruntime-web の WASM 本体を取得する。
 * マニフェスト（ort-assets.json）に従い分割チャンクを取得・結合して返す。
 * 返り値はそのまま ort.env.wasm.wasmBinary へ渡せる。
 */
export const fetchOrtWasmBinary = async (
  onProgress?: AssetProgressCallback,
  basePath: string = ORT_ASSETS_BASE_PATH,
): Promise<Uint8Array> => {
  // マニフェストは小さく毎デプロイ変わり得るためキャッシュせず常に取得する
  const manifestResponse = await fetch(`${basePath}ort-assets.json`);
  if (!manifestResponse.ok) {
    throw new Error(
      `ort ランタイムのマニフェスト取得に失敗しました (${manifestResponse.status})`,
    );
  }
  const manifest = (await manifestResponse.json()) as OrtAssetsManifest;
  const urls = resolveOrtWasmPartUrls(manifest, basePath);
  const report = createProgressAggregator(
    urls.length,
    manifest.wasm.size,
    onProgress,
  );
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < urls.length; i++) {
    chunks.push(
      await fetchAssetWithCache(urls[i], (loadedBytes) =>
        report(i, loadedBytes),
      ),
    );
  }
  const binary = concatChunks(chunks, manifest.wasm.size);
  // 旧バージョンのランタイムチャンク（?v= が現行と異なるエントリ）を掃除する（ベストエフォート）
  void cleanupStaleOrtCache(urls, basePath);
  return binary;
};

/** basePath 配下のキャッシュエントリのうち、現行 URL 一覧にないものを削除する */
const cleanupStaleOrtCache = async (
  currentUrls: readonly string[],
  basePath: string,
): Promise<void> => {
  if (!isCacheAvailable()) {
    return;
  }
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const current = new Set(
      currentUrls.map((url) => new URL(url, location.origin).href),
    );
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.pathname.startsWith(basePath) && !current.has(request.url)) {
        await cache.delete(request);
      }
    }
  } catch {
    // 掃除の失敗は無害（次回ロード時に再試行される）
  }
};
