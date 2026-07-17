import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { magicNumber, pngSize, rectPngFile } from "./helpers/fixtures";
import { readPixelFromBuffer } from "./helpers/pixels";

/**
 * AI 超解像 /upscale の E2E。
 * 同梱の実モデル（realesr-general-x4v3.onnx、約 5MB）と自己ホストの
 * onnxruntime-web（WASM EP。ヘッドレスでは WebGPU 不可のため自動フォールバック）で
 * 実推論まで通し、ダウンロード物のバイナリ解析で出力解像度が指定倍率どおりで
 * あることを検証する。モデル / ランタイムの取得はローカル配信のため高速だが、
 * 推論はシングルスレッド WASM のためテストごとにタイムアウトを延長する。
 */

/** モデルロード + WASM 推論を含むためテスト全体のタイムアウトを延長する */
const UPSCALE_TIMEOUT = 180_000;

/** 画像を投入して拡大を実行し、単一結果をダウンロードしてバイナリを返す */
const runUpscaleAndDownload = async (
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  scaleLabel: "2倍" | "4倍",
): Promise<Buffer> => {
  await page.goto("/upscale/");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("button", { name: scaleLabel, exact: true }).click();
  await page.getByRole("button", { name: "拡大を実行", exact: true }).click();

  // モデル準備（ダウンロード）→ タイル推論 → 結果表示
  await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
    timeout: UPSCALE_TIMEOUT,
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

test.describe("AI 超解像", () => {
  test("PNG を 2 倍に拡大でき、出力解像度が正確に 2 倍になる", async ({
    page,
  }) => {
    test.setTimeout(UPSCALE_TIMEOUT);
    const buf = await runUpscaleAndDownload(
      page,
      rectPngFile("photo.png", 100, 60),
      "2倍",
    );
    expect(magicNumber.isPng(buf)).toBe(true);
    expect(pngSize(buf)).toEqual({ width: 200, height: 120 });
  });

  test("PNG を 4 倍に拡大でき、出力解像度が正確に 4 倍になる", async ({
    page,
  }) => {
    test.setTimeout(UPSCALE_TIMEOUT);
    const buf = await runUpscaleAndDownload(
      page,
      rectPngFile("photo.png", 50, 40),
      "4倍",
    );
    expect(magicNumber.isPng(buf)).toBe(true);
    expect(pngSize(buf)).toEqual({ width: 200, height: 160 });
    // 出力ファイル名は _upscaled サフィックス + 元形式維持
  });

  test("タイルより大きい画像も複数タイルの合成で拡大でき、継ぎ目が破綻しない", async ({
    page,
  }) => {
    test.setTimeout(UPSCALE_TIMEOUT);
    // 幅 224px > タイル一辺 192px のため水平 2 タイルに分割される
    const buf = await runUpscaleAndDownload(
      page,
      rectPngFile("wide.png", 224, 40, [200, 60, 40]),
      "2倍",
    );
    expect(pngSize(buf)).toEqual({ width: 448, height: 80 });
    // 単色入力はタイル境界（中央付近）でも同系色のまま（フェザー合成の
    // 重み正規化が壊れていると境界が暗く / 明るくなる）
    const [r, g, b] = await readPixelFromBuffer(
      page,
      buf,
      "image/png",
      0.5,
      0.5,
    );
    expect(Math.abs(r - 200)).toBeLessThan(30);
    expect(Math.abs(g - 60)).toBeLessThan(30);
    expect(Math.abs(b - 40)).toBeLessThan(30);
  });

  test("拡大結果をダウンロードせず変換ツールへ引き継げる（ハンドオフ）", async ({
    page,
  }) => {
    test.setTimeout(UPSCALE_TIMEOUT);
    await page.goto("/upscale/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("photo.png", 60, 40));
    await page.getByRole("button", { name: "拡大を実行", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: UPSCALE_TIMEOUT,
    });

    // 結果を変換ツールへ送る（クライアントサイド遷移）
    await expect(page.getByText(/この結果を次のツールへ/)).toBeVisible();
    await page.getByRole("button", { name: "変換へ送る", exact: true }).click();
    await expect(page).toHaveURL(/\/convert\/?$/);
    // _upscaled サフィックス付きの結果ファイルが引き継がれている
    await expect(page.getByText("photo_upscaled.png")).toBeVisible();
  });

  test("実行中にキャンセルすると操作可能な状態に戻る", async ({ page }) => {
    test.setTimeout(UPSCALE_TIMEOUT);
    await page.goto("/upscale/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("photo.png", 100, 60));
    await page.getByRole("button", { name: "拡大を実行", exact: true }).click();

    // 実行中に表示されるキャンセルボタンで中断する
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();

    // 実行ボタンが再度操作可能に戻る（キャンセル通知が表示される）
    await expect(
      page.getByRole("button", { name: "拡大を実行", exact: true }),
    ).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText(/キャンセルしました/)).toBeVisible();
  });
});
