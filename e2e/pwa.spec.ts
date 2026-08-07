import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { magicNumber, pngFile } from "./helpers/fixtures";
import { isServiceWorkerAvailable, waitForServiceWorker } from "./helpers/sw";

// PWA（Web App Manifest + Service Worker）の実ブラウザ検証。
// 本番同等の静的エクスポート（serve out）に対して実行される。
//
// 注: Service Worker と sw.js は本番ビルドの postbuild でのみ生成されるため、
// SW に依存するテストは dev サーバー再利用時（reuseExistingServer）には skip する
// （waitForFunction(controller) の 15 秒タイムアウトで落とさないための配慮）。

// オフライン検証で巡回する全ページ。ヘッダーのナビゲーションはレイアウト共通なので、
// 各ルートで nav リンクが表示されれば HTML / CSS / JS がキャッシュから復元・hydrate された証拠になる。
const ROUTES = [
  "/",
  "/convert/",
  "/crop/",
  "/edit/",
  "/redact/",
  "/metadata/",
] as const;

test.describe("PWA", () => {
  test("manifest と theme-color が出力されている", async ({ page }) => {
    await page.goto("/");

    // <link rel="manifest"> は各ページに 1 つだけ
    const manifestLinks = page.locator('head > link[rel="manifest"]');
    await expect(manifestLinks).toHaveCount(1);
    expect(await manifestLinks.getAttribute("href")).toBe(
      "/manifest.webmanifest",
    );

    // manifest の内容（installability に必要な項目）
    const res = await page.request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(
      manifest.icons.some(
        (icon: { purpose?: string }) => icon.purpose === "maskable",
      ),
    ).toBeTruthy();

    // share_target（共有シートからの画像受け取り、Issue #105）
    expect(manifest.share_target.action).toBe("/share-target");
    expect(manifest.share_target.method).toBe("POST");
    expect(manifest.share_target.enctype).toBe("multipart/form-data");
    const shareFiles = manifest.share_target.params.files;
    expect(shareFiles).toHaveLength(1);
    expect(shareFiles[0].name).toBe("images");
    expect(shareFiles[0].accept).toContain("image/jpeg");
    // convert のみが受理する HEIC も共有シートでは受け取れる（受理 MIME は全ツールの和集合）
    expect(shareFiles[0].accept).toContain("image/heic");

    // theme-color（ライト / ダーク）が出力されている
    await expect(page.locator('head > meta[name="theme-color"]')).toHaveCount(
      2,
    );
  });

  test("Service Worker が登録され、オフラインで全ページが表示される", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    test.skip(
      !(await isServiceWorkerAvailable(page)),
      "sw.js は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );

    await waitForServiceWorker(page);

    // ネットワークを遮断
    await context.setOffline(true);

    try {
      for (const path of ROUTES) {
        // キャッシュ済みの HTML が Service Worker から配信されることを確認
        await page.goto(path);
        const nav = page.getByRole("navigation");
        await expect(nav.getByRole("link", { name: "変換" })).toBeVisible();
        await expect(
          nav.getByRole("link", { name: "トリミング" }),
        ).toBeVisible();
        await expect(
          nav.getByRole("link", { name: "メタデータ" }),
        ).toBeVisible();
      }
    } finally {
      await context.setOffline(false);
    }
  });

  test("オフラインで AVIF 変換（WASM）が動作する", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    test.skip(
      !(await isServiceWorkerAvailable(page)),
      "sw.js は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );

    await waitForServiceWorker(page);

    // ネットワークを遮断してから変換ページに遷移する。HTML/JS はキャッシュから復元され、
    // 変換実行時に動的 import される @jsquash/avif の WASM チャンクも
    // プリキャッシュから同一オリジンで解決されることを検証する
    // （「オフラインで全機能が動作」の核心。precache に .wasm が含まれる前提の実証）。
    await context.setOffline(true);

    try {
      await page.goto("/convert/");
      await page.locator('input[type="file"]').setInputFiles(pngFile());

      // ラジオの input は不可視のためラベルテキストをクリックする
      await page.getByText("AVIF", { exact: true }).click();
      await page.getByRole("button", { name: "変換", exact: true }).click();

      // WASM の初回ロードがあるためタイムアウトを長めにとる
      await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible(
        { timeout: 30_000 },
      );

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", { name: "Zipでダウンロード", exact: true })
          .click(),
      ]);

      expect(download.suggestedFilename()).toBe("sample.avif");
      const buf = readFileSync(await download.path());
      expect(magicNumber.isAvif(buf)).toBe(true);
    } finally {
      await context.setOffline(false);
    }
  });
});
