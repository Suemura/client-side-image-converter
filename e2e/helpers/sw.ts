import type { Page } from "@playwright/test";

// Service Worker 関連の共有ヘルパー（pwa.spec.ts / share.spec.ts で共通利用）。
// sw.js は本番ビルドの postbuild でのみ生成されるため、SW に依存するテストは
// dev サーバー再利用時（reuseExistingServer）には呼び出し側で skip する。

/**
 * Service Worker が active になりページを制御下に置く（clients.claim）まで待つ。
 * controller が設定される時点で install（プリキャッシュ）は完了している。
 */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * sw.js が配信されているか（＝本番ビルドに対して実行されているか）を確認する。
 * dev サーバー再利用時は生成されないため false になる。
 */
export async function isServiceWorkerAvailable(page: Page): Promise<boolean> {
  const res = await page.request.get("/sw.js");
  return res.ok();
}
