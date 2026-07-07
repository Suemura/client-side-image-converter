import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { magicNumber, pngFile, pngSize, rectPngFile } from "./helpers/fixtures";

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

    // 1 ファイル時は ZIP 化されず単一ファイルとしてダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    // トリミング結果には _cropped サフィックスが付与される
    expect(download.suggestedFilename()).toBe("sample_cropped.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });

  test("対応形式の表示にブラウザで描画できない TIFF が含まれない", async ({
    page,
  }) => {
    await page.goto("/crop/");
    await expect(
      page.getByText("対応形式: JPG, PNG, WebP, BMP", { exact: true }),
    ).toBeVisible();
  });

  test("アスペクト比 1:1 を選ぶと正方形に切り出される", async ({ page }) => {
    await page.goto("/crop/");
    // 40x20 の横長 PNG を投入する
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("rect.png", 40, 20));

    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    // 1:1 プリセットを選択すると現在の領域が正方形に収まる
    await page.getByRole("button", { name: "1:1", exact: true }).click();
    await cropButton.click();

    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("rect_cropped.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
    // 出力が正方形（幅 = 高さ）に切り出されている
    const size = pngSize(buf);
    expect(size.width).toBe(size.height);
    // 元の横長（40x20）から正方形へ変化している
    expect(size.width).toBeLessThan(40);
  });

  test("90°回転すると出力の縦横が入れ替わる", async ({ page }) => {
    await page.goto("/crop/");
    // 40x20（横長）を投入
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("rect.png", 40, 20));

    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    // 右に 90° 回転（領域は全体へリセットされ、再度有効化される）
    await page.getByRole("button", { name: "右に90°回転" }).click();
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    await cropButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
    // 横長（幅 > 高さ）から縦長（高さ > 幅）へ入れ替わっている
    const size = pngSize(buf);
    expect(size.height).toBeGreaterThan(size.width);
  });

  test("グレースケールを適用すると出力の全画素が R=G=B になる", async ({
    page,
  }) => {
    await page.goto("/crop/");
    // 各チャンネルが明確に異なる単色（R=200, G=60, B=40）の PNG を投入
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("color.png", 32, 32, [200, 60, 40]));

    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    // グレースケールフィルタを適用（プレビュー再生成のため一旦無効化される）
    await page
      .getByRole("button", { name: "グレースケール", exact: true })
      .click();
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    await cropButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("color_cropped.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);

    // デコードして全画素が R=G=B（グレースケール）かつ元の彩色でないことを検証
    const check = await page.evaluate(async (arr) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(arr)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("no ctx");
      }
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      let maxChannelDiff = 0;
      for (let i = 0; i < data.length; i += 4) {
        maxChannelDiff = Math.max(
          maxChannelDiff,
          Math.abs(data[i] - data[i + 1]),
          Math.abs(data[i + 1] - data[i + 2]),
        );
      }
      // グレースケール後の輝度（サンプルとして先頭画素の R 値）
      return { maxChannelDiff, gray: data[0] };
    }, Array.from(buf));

    // 全画素で R=G=B（丸め誤差を許容して差 <= 2）
    expect(check.maxChannelDiff).toBeLessThanOrEqual(2);
    // 元の彩色（200/60/40）ではなく灰色化されている
    expect(check.gray).toBeGreaterThan(60);
    expect(check.gray).toBeLessThan(200);
  });

  test("画像ごとモードで画像単位に異なる変換を適用できる", async ({ page }) => {
    await page.goto("/crop/");
    // 2 枚（いずれも 40x20 横長）を投入
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        rectPngFile("rect1.png", 40, 20),
        rectPngFile("rect2.png", 40, 20),
      ]);

    const cropButton = page.getByRole("button", {
      name: "トリミング",
      exact: true,
    });
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    // 「画像ごと」モードへ切替
    await page.getByRole("button", { name: "画像ごと", exact: true }).click();

    // 1 枚目だけ右に 90° 回転する
    await page.getByRole("button", { name: "右に90°回転" }).click();
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    // 2 枚目へ移動（回転させない）
    await page.getByRole("button", { name: "次の画像" }).click();
    await expect(cropButton).toBeEnabled({ timeout: 15_000 });

    await cropButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 複数ファイルは ZIP でまとめてダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const first = await zip.file("rect1_cropped.png")?.async("nodebuffer");
    const second = await zip.file("rect2_cropped.png")?.async("nodebuffer");
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();

    // 1 枚目は回転して縦長（高さ > 幅）、2 枚目は横長のまま（幅 > 高さ）
    const size1 = pngSize(first as Buffer);
    const size2 = pngSize(second as Buffer);
    expect(size1.height).toBeGreaterThan(size1.width);
    expect(size2.width).toBeGreaterThan(size2.height);
  });
});
