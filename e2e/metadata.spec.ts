import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  jpegFileWithExif,
  loadExifFromBuffer,
  magicNumber,
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
});
