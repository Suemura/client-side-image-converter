import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { magicNumber, pngSize, salientRectPngFile } from "./helpers/fixtures";
import { readPixelRgbaFromBuffer } from "./helpers/pixels";

/**
 * 背景除去 /remove-bg の E2E。
 * 同梱の実モデル（u2netp.onnx、約 4.6MB）と自己ホストの onnxruntime-web
 * （WASM EP。ヘッドレスでは WebGPU 不可のため自動フォールバック）で実推論まで通し、
 * ダウンロード物のバイナリ解析で透過画像が出力され、前景（画像中央の顕著物体）の
 * アルファが高く、背景（隅）のアルファが低いことを検証する。
 */

/** モデルロード + WASM 推論を含むためテスト全体のタイムアウトを延長する */
const REMOVE_BG_TIMEOUT = 180_000;

/** 画像を投入して背景除去を実行し、単一結果をダウンロードしてバイナリを返す */
const runRemoveBgAndDownload = async (
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  formatLabel?: "PNG" | "WebP",
): Promise<Buffer> => {
  await page.goto("/remove-bg/");
  await page.locator('input[type="file"]').setInputFiles(file);
  if (formatLabel) {
    await page.getByRole("button", { name: formatLabel, exact: true }).click();
  }
  await page
    .getByRole("button", { name: "背景除去を実行", exact: true })
    .click();

  // モデル準備（ダウンロード）→ 推論 → 結果表示
  await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
    timeout: REMOVE_BG_TIMEOUT,
  });

  // 1 ファイル時は ZIP 化されず単一ファイルとしてダウンロードされる
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Zipでダウンロード", exact: true })
      .click(),
  ]);
  return readFileSync(await download.path());
};

test.describe("背景除去", () => {
  test("PNG の背景を除去して透過 PNG を出力できる（前景アルファ高・背景アルファ低）", async ({
    page,
  }) => {
    test.setTimeout(REMOVE_BG_TIMEOUT);
    const buf = await runRemoveBgAndDownload(
      page,
      salientRectPngFile("photo.png"),
    );
    expect(magicNumber.isPng(buf)).toBe(true);
    // 解像度は元画像から変わらない
    expect(pngSize(buf)).toEqual({ width: 320, height: 320 });
    // 前景（中央の顕著物体）は残り、背景（四隅）は透過する
    const [, , , centerAlpha] = await readPixelRgbaFromBuffer(
      page,
      buf,
      "image/png",
      0.5,
      0.5,
    );
    const [, , , cornerAlpha] = await readPixelRgbaFromBuffer(
      page,
      buf,
      "image/png",
      0.02,
      0.02,
    );
    expect(centerAlpha).toBeGreaterThan(200);
    expect(cornerAlpha).toBeLessThan(50);
  });

  test("WebP 形式を選ぶと透過 WebP で出力される", async ({ page }) => {
    test.setTimeout(REMOVE_BG_TIMEOUT);
    const buf = await runRemoveBgAndDownload(
      page,
      salientRectPngFile("photo.png"),
      "WebP",
    );
    expect(magicNumber.isWebp(buf)).toBe(true);
    const [, , , centerAlpha] = await readPixelRgbaFromBuffer(
      page,
      buf,
      "image/webp",
      0.5,
      0.5,
    );
    const [, , , cornerAlpha] = await readPixelRgbaFromBuffer(
      page,
      buf,
      "image/webp",
      0.02,
      0.02,
    );
    expect(centerAlpha).toBeGreaterThan(200);
    expect(cornerAlpha).toBeLessThan(50);
  });

  test("背景除去結果をダウンロードせず変換ツールへ引き継げる（ハンドオフ）", async ({
    page,
  }) => {
    test.setTimeout(REMOVE_BG_TIMEOUT);
    await page.goto("/remove-bg/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(salientRectPngFile("photo.png"));
    await page
      .getByRole("button", { name: "背景除去を実行", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: REMOVE_BG_TIMEOUT,
    });

    // 結果を変換ツールへ送る（クライアントサイド遷移）
    await expect(page.getByText(/この結果を次のツールへ/)).toBeVisible();
    await page.getByRole("button", { name: "変換へ送る", exact: true }).click();
    await expect(page).toHaveURL(/\/convert\/?$/);
    // _nobg サフィックス付きの結果ファイルが引き継がれている
    await expect(page.getByText("photo_nobg.png")).toBeVisible();
  });

  test("実行中にキャンセルすると操作可能な状態に戻る", async ({ page }) => {
    test.setTimeout(REMOVE_BG_TIMEOUT);
    await page.goto("/remove-bg/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(salientRectPngFile("photo.png"));
    await page
      .getByRole("button", { name: "背景除去を実行", exact: true })
      .click();

    // 実行中に表示されるキャンセルボタンで中断する
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();

    // 実行ボタンが再度操作可能に戻る（キャンセル通知が表示される）
    await expect(
      page.getByRole("button", { name: "背景除去を実行", exact: true }),
    ).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/キャンセルしました/)).toBeVisible();
  });
});
