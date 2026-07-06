import { expect, test } from "@playwright/test";

// PWA（Web App Manifest + Service Worker）の実ブラウザ検証。
// 本番同等の静的エクスポート（serve out）に対して実行される。

// オフライン検証で巡回する全ページ。ヘッダーのナビゲーションはレイアウト共通なので、
// 各ルートで nav リンクが表示されれば HTML / CSS / JS がキャッシュから復元・hydrate された証拠になる。
const ROUTES = ["/", "/convert/", "/crop/", "/metadata/"] as const;

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

    // Service Worker が active になり、ページを制御下に置く（clients.claim）まで待つ。
    // controller が設定される時点で install（プリキャッシュの addAll）は完了している。
    await page.waitForFunction(
      () => navigator.serviceWorker?.controller != null,
      undefined,
      { timeout: 15_000 },
    );

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
});
