import { expect, test } from "@playwright/test";

test.describe("スモークテスト", () => {
  test("トップページが表示され、各ツールへのナビゲーションがある", async ({
    page,
  }) => {
    await page.goto("/");
    // 同名の見出しがヘッダー(h2)にもあるため、ページ本文の h1 に限定する
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Client-Side Image Converter",
      }),
    ).toBeVisible();

    // ヘッダーナビゲーション（ページ本文の CTA リンクと同名のため nav にスコープする）
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "変換" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "トリミング" })).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "編集", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "モザイク", exact: true }),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: "メタデータ" })).toBeVisible();

    // トップページ本文の各ツールへの CTA（/edit・/redact への導線が追加されていること）
    await expect(page.getByRole("link", { name: "画像編集" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "モザイク・ぼかし" }),
    ).toBeVisible();
  });
});
