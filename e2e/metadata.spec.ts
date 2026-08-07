import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import piexif from "piexifjs";
import {
  hasC2pa,
  jpegFileWithExif,
  jpegFileWithExifAndC2pa,
  loadExifFromBuffer,
  magicNumber,
  pngFileWithC2pa,
  pngFileWithExif,
  webpFileWithC2pa,
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

  test("PNG の EXIF（eXIf チャンク）を読み取ってタグを表示できる", async ({
    page,
  }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(pngFileWithExif());

    // EXIF 解析完了を待つ
    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });

    // PNG の eXIf チャンクから読み取った EXIF タグが表示される
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

test.describe("コンテンツ来歴（C2PA）", () => {
  // ダミー JUMBF は c2pa-web で解釈できないため「解析不能」表示になるが、
  // それ自体が動的 import + WASM ロード（8MB 超）の実ブラウザ検証になる。
  // 有効署名の表示内容は単体テスト（c2paSummary.test.ts）で検証済み

  test("C2PA を検出して来歴セクションが表示され、ロスレス除去できる（JPEG）", async ({
    page,
  }) => {
    await page.goto("/metadata/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(jpegFileWithExifAndC2pa());

    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 30_000 });

    // 来歴セクションと解析不能メッセージ（WASM ロード込みのため長めに待つ）
    await expect(
      page.getByRole("heading", { name: /コンテンツ来歴/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/来歴データを解析できませんでした/)).toBeVisible();

    // EXIF タグは選択せず C2PA のみ除去（ロスレス経路）
    await page.getByRole("button", { name: "選択クリア" }).click();
    await page.getByText("コンテンツ来歴（C2PA）を削除する").click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "クリーニング済み画像をダウンロード" })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("cleaned_with-c2pa.jpg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
    // C2PA は除去され、EXIF は無傷（ロスレス = C2PA 挿入前のバイナリと完全一致）
    expect(hasC2pa(buf, "image/jpeg")).toBe(false);
    expect(buf.equals(jpegFileWithExif().buffer)).toBe(true);
    const exif = loadExifFromBuffer(buf);
    expect(Object.keys(exif.GPS ?? {}).length).toBeGreaterThan(0);
  });

  test("PNG の C2PA（caBX チャンク)を除去できる", async ({ page }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(pngFileWithC2pa());

    await expect(
      page.getByRole("heading", { name: /コンテンツ来歴/ }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByText("コンテンツ来歴（C2PA）を削除する").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "クリーニング済み画像をダウンロード" })
        .click(),
    ]);

    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
    expect(hasC2pa(buf, "image/png")).toBe(false);
  });

  test("WebP の C2PA チャンクを除去できる", async ({ page }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(webpFileWithC2pa());

    await expect(
      page.getByRole("heading", { name: /コンテンツ来歴/ }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByText("コンテンツ来歴（C2PA）を削除する").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "クリーニング済み画像をダウンロード" })
        .click(),
    ]);

    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
    expect(hasC2pa(buf, "image/webp")).toBe(false);
  });

  test("C2PA が無い画像では来歴セクションを表示しない", async ({ page }) => {
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /コンテンツ来歴/ }),
    ).not.toBeVisible();
  });
});
