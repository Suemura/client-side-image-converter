import { expect, test } from "@playwright/test";

// モバイルビューポート（iPhone 標準幅）でハンバーガーメニュー + ドロワーを検証する。
// project は増やさず spec 単位で viewport を指定する（全 spec の二重実行を避ける）
test.use({ viewport: { width: 390, height: 844 } });

test.describe("モバイルメニュー（ハンバーガー + ドロワー）", () => {
  test("ハンバーガーが表示され、デスクトップナビは非表示になる", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "メニューを開く" }),
    ).toBeVisible();
    // デスクトップ用ナビゲーションは 768px 以下で非表示
    await expect(page.getByRole("navigation")).toBeHidden();
  });

  test("開くとドロワーに全ナビリンクと設定・GitHub リンクが表示される", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "メニューを開く" }).click();

    const drawer = page.getByRole("dialog", { name: "メニュー" });
    await expect(drawer).toBeVisible();

    // ナビリンク 6 件（トップ + 5 ツール）
    for (const name of [
      "トップ",
      "トリミング",
      "変換",
      "編集",
      "モザイク",
      "メタデータ",
    ]) {
      await expect(
        drawer.getByRole("link", { name, exact: true }),
      ).toBeVisible();
    }

    // 現在ページ（トップ）に aria-current が付く
    await expect(
      drawer.getByRole("link", { name: "トップ", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    // テーマ・言語切替と GitHub リンク
    await expect(drawer.getByText("テーマ")).toBeVisible();
    await expect(drawer.getByText("言語")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "GitHub" })).toBeVisible();
  });

  test("Escape キーで閉じる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "メニューを開く" }).click();

    const drawer = page.getByRole("dialog", { name: "メニュー" });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("背景幕クリックで閉じる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "メニューを開く" }).click();

    const drawer = page.getByRole("dialog", { name: "メニュー" });
    await expect(drawer).toBeVisible();

    // 背景幕はドロワー（右端 300px）の外側をクリックする
    await page.mouse.click(20, 400);
    await expect(drawer).toBeHidden();
  });

  test("リンクをタップするとページ遷移してドロワーが閉じる", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "メニューを開く" }).click();

    const drawer = page.getByRole("dialog", { name: "メニュー" });
    await drawer.getByRole("link", { name: "変換", exact: true }).click();

    await expect(page).toHaveURL(/\/convert\/?$/);
    await expect(drawer).toBeHidden();

    // 遷移先で開き直すと現在ページ表示が変換に移る
    await page.getByRole("button", { name: "メニューを開く" }).click();
    await expect(
      drawer.getByRole("link", { name: "変換", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
});
