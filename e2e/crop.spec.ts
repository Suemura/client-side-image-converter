import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { magicNumber, pngFile } from "./helpers/fixtures";

test.describe("画像トリミング", () => {
  test("画像をトリミングしてダウンロードできる", async ({ page }) => {
    await page.goto("/crop/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // 画像読み込み後に初期トリミング領域（画像全体）が設定されるとボタンが有効になる
    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });
    await cropButton.click();

    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ダウンロード" }).click(),
    ]);

    // トリミング結果には _cropped サフィックスが付与される
    expect(download.suggestedFilename()).toBe("sample_cropped.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });
});
