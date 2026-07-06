import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import piexif from "piexifjs";
import {
  jpegFileWithExif,
  loadExifFromBuffer,
  magicNumber,
  webpFileWithExif,
} from "./helpers/fixtures";

test.describe("EXIF メタデータ管理", () => {
  test("EXIF が表示され、リスクタグを削除した画像をダウンロードできる", async ({
    page,
  }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    // EXIF 解析完了を待つ
    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });

    // アップロードした画像の EXIF タグが表示されている
    // （プライバシーリスク節と全タグ節の両方に出ることがあるため first() で確認）
    await expect(page.getByText("Make", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("GPSLatitude", { exact: true }).first(),
    ).toBeVisible();

    // リスクタグを選択して削除実行
    await page.getByRole("button", { name: "リスクタグを選択" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "クリーニング済み画像をダウンロード" })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("cleaned_with-exif.jpg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);

    // GPS 情報が実際に削除されている（バイナリを piexifjs で解析して検証）
    const exif = loadExifFromBuffer(buf);
    expect(Object.keys(exif.GPS ?? {})).toHaveLength(0);
  });

  test("WebP の EXIF を読み取ってタグを表示できる", async ({ page }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(webpFileWithExif());

    // EXIF 解析完了を待つ
    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });

    // WebP から読み取った EXIF タグが表示される（従来は空だった）
    await expect(page.getByText("Make", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("GPSLatitude", { exact: true }).first(),
    ).toBeVisible();
  });

  test("GPS を市区町村レベルに丸めて位置情報を残せる", async ({ page }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });

    // GPS 処理モードを「市区町村レベルに丸める」に切り替える
    await page.getByText("市区町村レベルに丸める", { exact: true }).click();

    // リスクタグ（GPS・Make・撮影日時など）を選択して実行
    await page.getByRole("button", { name: "リスクタグを選択" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "クリーニング済み画像をダウンロード" })
        .click(),
    ]);

    const buf = readFileSync(await download.path());
    const exif = loadExifFromBuffer(buf);

    // GPS は削除されず残っている（丸めモード）
    expect(Object.keys(exif.GPS ?? {}).length).toBeGreaterThan(0);
    const lat = exif.GPS?.[piexif.GPSIFD.GPSLatitude] as number[][] | undefined;
    expect(lat).toBeDefined();
    // 緯度は元の 35.6667 が 2 桁（35.67）に丸められている
    const dms = lat as number[][];
    const decimal =
      dms[0][0] / dms[0][1] +
      dms[1][0] / dms[1][1] / 60 +
      dms[2][0] / dms[2][1] / 3600;
    expect(decimal).toBeCloseTo(35.67, 2);

    // 非 GPS のリスクタグ（Make）は削除されている
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBeUndefined();
  });
});
