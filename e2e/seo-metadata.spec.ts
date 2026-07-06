import { expect, test } from "@playwright/test";

// 各ページ固有の SEO メタデータ（title / meta description）が静的エクスポートに
// 正しく出力されていることを検証する。title は root layout の template で
// "<ページ名> | Client-Side Image Converter" 形式に装飾される。
const PAGES = [
  {
    name: "トップ",
    path: "/",
    title:
      "Client-Side Image Converter | ブラウザ内で完結する画像変換・トリミングツール",
    descriptionContains: "プライバシー重視の無料ツール",
  },
  {
    name: "変換",
    path: "/convert/",
    title: "画像フォーマット変換 | Client-Side Image Converter",
    descriptionContains: "JPEG・PNG・WebP・AVIF 形式へブラウザ内で画像を変換",
  },
  {
    name: "トリミング",
    path: "/crop/",
    title: "画像トリミング | Client-Side Image Converter",
    descriptionContains: "好きなサイズにトリミング",
  },
  {
    name: "メタデータ",
    path: "/metadata/",
    title: "画像メタデータ・プライバシー管理 | Client-Side Image Converter",
    descriptionContains: "EXIF メタデータ",
  },
] as const;

test.describe("ページ別 SEO メタデータ", () => {
  for (const p of PAGES) {
    test(`${p.name}ページが固有の title / description を持つ`, async ({
      page,
    }) => {
      await page.goto(p.path);

      await expect(page).toHaveTitle(p.title);

      const description = await page
        .locator('head > meta[name="description"]')
        .getAttribute("content");
      expect(description).toContain(p.descriptionContains);
    });
  }

  test("各ページの title が互いに異なる", async ({ page }) => {
    const titles = new Set<string>();
    for (const p of PAGES) {
      await page.goto(p.path);
      titles.add(await page.title());
    }
    expect(titles.size).toBe(PAGES.length);
  });
});
