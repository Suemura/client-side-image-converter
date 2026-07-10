import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { magicNumber, pngFile, rectPngFile } from "./helpers/fixtures";

/**
 * ツール連携（ハンドオフ）の連鎖フロー検証。
 * ペイロードは React Context の in-memory 保持のため、ページ間の移動は必ず
 * クライアントサイド遷移（送出ボタン・ナビゲーションリンク）で行う
 * （page.goto はフルリロードになり Context が消える）。
 */
test.describe("ツール連携（ハンドオフ）", () => {
  test("convert の結果をダウンロードせず crop へ引き継いで連続処理できる", async ({
    page,
  }) => {
    // 1. convert で PNG 2 件を JPEG に変換する
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile(), rectPngFile("rect.png", 40, 20)]);
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 2. 結果をトリミングへ送る（クライアントサイド遷移）
    await expect(page.getByText(/この結果を次のツールへ/)).toBeVisible();
    await page
      .getByRole("button", { name: "トリミングへ送る", exact: true })
      .click();
    await expect(page).toHaveURL(/\/crop\/?$/);

    // 3. 到着バナーに引き継ぎ元と件数が表示される
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "変換の結果 2 件を引き継ぎました" }),
    ).toBeVisible();

    // 4. 引き継いだ画像でトリミングを実行する
    // （変換 → 遷移直後の 2 枚プレビュー生成は重いため長めに待つ）
    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 30_000 });
    await cropButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 5. ファイル名が連鎖し（sample.png → sample.jpeg → sample_cropped.jpeg）
    //    中身も有効な JPEG であることを ZIP 全件で検証する
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["rect_cropped.jpeg", "sample_cropped.jpeg"]);
    for (const name of names) {
      const entry = zip.file(name);
      expect(entry).not.toBeNull();
      const buf = await entry!.async("nodebuffer");
      expect(magicNumber.isJpeg(buf)).toBe(true);
    }
  });

  test("crop の結果をダウンロードせず convert へ引き継いで変換できる", async ({
    page,
  }) => {
    // 1. crop で PNG をトリミングする
    await page.goto("/crop/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });
    await cropButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 2. 結果を変換へ送る
    await page.getByRole("button", { name: "変換へ送る", exact: true }).click();
    await expect(page).toHaveURL(/\/convert\/?$/);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "トリミングの結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 3. 引き継いだ画像を WebP へ変換する（ラジオの input は不可視のためラベルをクリック）
    await page.getByText("WebP", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 4. ファイル名が連鎖し（sample.png → sample_cropped.png → sample_cropped.webp）
    //    中身も有効な WebP であることを検証する
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);
    expect(download.suggestedFilename()).toBe("sample_cropped.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
  });

  test("受理形式外の送り先は表示されない（AVIF 結果は crop へ送れない）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // AVIF へ変換すると受理できるツールがなくなる（crop は AVIF 非対応）
    await page.getByText("AVIF", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    // 送出コントロールごと表示されない
    await expect(page.getByText(/この結果を次のツールへ/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "トリミングへ送る", exact: true }),
    ).toHaveCount(0);
  });

  test("ペイロードは一度きり消費され、元ページへ戻っても二重取り込みされない", async ({
    page,
  }) => {
    // 1. convert → crop へ 1 件引き継ぐ
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByRole("button", { name: "トリミングへ送る", exact: true })
      .click();
    await expect(page).toHaveURL(/\/crop\/?$/);
    await expect(
      page.getByRole("status").filter({ hasText: "引き継ぎました" }),
    ).toBeVisible();

    // 2. ナビゲーションで convert へ戻る（クライアントサイド遷移）。
    //    送出時に結果はクリア済みのため、結果一覧は表示されない
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "変換" })
      .click();
    await expect(page).toHaveURL(/\/convert\/?$/);
    await expect(page.getByRole("heading", { name: /変換結果/ })).toHaveCount(
      0,
    );

    // 3. 再度 crop へ移動しても、ペイロードは消費済みで再取り込みされない
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "トリミング" })
      .click();
    await expect(page).toHaveURL(/\/crop\/?$/);
    await expect(
      page.getByRole("status").filter({ hasText: "引き継ぎました" }),
    ).toHaveCount(0);
    // ファイル未選択状態（ドロップゾーン表示）に戻っている
    await expect(
      page.getByText("ファイルをここにドロップ", { exact: true }),
    ).toBeVisible();
  });
});
