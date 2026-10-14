import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { dngFile, magicNumber, pngFile } from "./helpers/fixtures";
import { readPixelFromBuffer } from "./helpers/pixels";

/**
 * RAW 現像パラメータ調整（Issue #132）の E2E
 *
 * DNG フィクスチャ（32x32・R が強い一様パターン）を投入し、現像パネルの表示条件と
 * パラメータが変換結果に反映されることをダウンロード物のピクセル解析で検証する。
 */
test.describe("RAW 現像パラメータ調整", () => {
  test("RAW 投入時のみ現像パネルが表示される（非 RAW・最適化モードでは非表示）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    const panelTitle = page.getByRole("heading", { name: "RAW 現像設定" });

    // 非 RAW（PNG）のみ: 非表示
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    await expect(panelTitle).not.toBeVisible();

    // RAW（DNG）投入: 表示
    await page.locator('input[type="file"]').setInputFiles(dngFile());
    await expect(panelTitle).toBeVisible();

    // 最適化モードへ切替: 非表示（RAW は最適化対象外）
    await page.getByText("最適化（形式を維持）", { exact: true }).click();
    await expect(panelTitle).not.toBeVisible();

    // フォーマット変換モードへ戻すと再表示される
    await page.getByText("フォーマット変換", { exact: true }).click();
    await expect(panelTitle).toBeVisible();
  });

  test("露出補正 -2EV の出力がデフォルト現像より暗い（ピクセル解析）", async ({
    page,
  }) => {
    // ダウンロード物の中心ピクセルの輝度（RGB 合計）を返す
    const convertAndMeasure = async (): Promise<number> => {
      await page.getByRole("button", { name: "変換", exact: true }).click();
      await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible(
        { timeout: 30_000 },
      );
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", { name: "Zipでダウンロード", exact: true })
          .click(),
      ]);
      const buf = readFileSync(await download.path());
      expect(magicNumber.isPng(buf)).toBe(true);
      const [r, g, b] = await readPixelFromBuffer(
        page,
        buf,
        "image/png",
        0.5,
        0.5,
      );
      return r + g + b;
    };

    // 1 回目: デフォルト現像（自動明るさ調整により一様フィクスチャは明るく仕上がる）。
    // PNG 出力（可逆）にして品質設定の影響を受けずにピクセルを比較する
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(dngFile());
    await page.getByText("PNG", { exact: true }).click();
    const defaultLuma = await convertAndMeasure();

    // 2 回目: 露出補正 -2EV（リニア 1/4 倍 + 自動明るさ調整オフ）。
    // 前回の変換結果と混同しないようページを開き直してから変換する
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(dngFile());
    await page.getByText("PNG", { exact: true }).click();
    await page.getByRole("slider", { name: "露出 (EV)" }).fill("-2");
    const darkenedLuma = await convertAndMeasure();

    expect(darkenedLuma).toBeLessThan(defaultLuma - 60);
  });

  test("色温度 3000K 指定で青チャンネルが持ち上がる（ピクセル解析）", async ({
    page,
  }) => {
    const convertAndReadPixel = async (): Promise<[number, number, number]> => {
      await page.getByRole("button", { name: "変換", exact: true }).click();
      await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible(
        { timeout: 30_000 },
      );
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page
          .getByRole("button", { name: "Zipでダウンロード", exact: true })
          .click(),
      ]);
      const buf = readFileSync(await download.path());
      return readPixelFromBuffer(page, buf, "image/png", 0.5, 0.5);
    };

    // デフォルト現像: フィクスチャは R が強いベイヤーパターンのため赤みが残る
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(dngFile());
    await page.getByText("PNG", { exact: true }).click();
    const [defaultR, , defaultB] = await convertAndReadPixel();
    expect(defaultR).toBeGreaterThan(defaultB);

    // 色温度 3000K 指定: 暖色光源の中和で青が持ち上がる。
    // 極端な低色温度はフィクスチャの全チャンネルをクリップさせ白化する
    // （highlight=クリップの仕様どおり）ため、クリップしない 3000K で検証する。
    // 前回の変換結果と混同しないようページを開き直してから変換する
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(dngFile());
    await page.getByText("PNG", { exact: true }).click();
    await page.getByText("色温度指定", { exact: true }).click();
    await page.getByRole("slider", { name: "色温度 (K)" }).fill("3000");
    const [, , manualB] = await convertAndReadPixel();
    expect(manualB).toBeGreaterThan(defaultB + 20);
  });
});
