import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { magicNumber, pngFile } from "./helpers/fixtures";

test.describe("画像フォーマット変換", () => {
  test("PNG を JPEG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ダウンロード" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
  });

  test("PNG を WebP に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("WebP", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ダウンロード" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
  });
});
