import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { checkerPngFile, magicNumber } from "./helpers/fixtures";

/**
 * モザイク / ぼかしレタッチ /redact の E2E。
 * フィクスチャは左半分が 1px の赤/青チェッカーボード・右半分が白の 200x200 PNG。
 * レタッチ後の該当領域が「赤とも青とも異なる混合色」になることをピクセル値で検証し、
 * ダウンロード物（出力バイナリ）でも同じ検証を行うことで不可読化と WYSIWYG を証明する。
 */

/** プレビュー canvas の相対座標 (fx, fy) の RGB を読む（e2e/edit.spec.ts と同型） */
const readPreviewPixel = (
  page: Page,
  fx: number,
  fy: number,
): Promise<[number, number, number]> =>
  page.getByTestId("redact-preview-canvas").evaluate(
    (canvas, { fx, fy }) => {
      const c = canvas as HTMLCanvasElement;
      const ctx = c.getContext("2d");
      if (!ctx) return [0, 0, 0];
      const x = Math.min(c.width - 1, Math.floor(c.width * fx));
      const y = Math.min(c.height - 1, Math.floor(c.height * fy));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    { fx, fy },
  );

/** <img>（結果サムネイル）の相対座標 (fx, fy) の RGB を読む（e2e/edit.spec.ts と同型） */
const readImagePixel = (
  locator: Locator,
  fx: number,
  fy: number,
): Promise<[number, number, number]> =>
  locator.evaluate(
    (node, { fx, fy }) =>
      new Promise<[number, number, number]>((resolve) => {
        const img = node as HTMLImageElement;
        const draw = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve([0, 0, 0]);
          ctx.drawImage(img, 0, 0);
          const x = Math.min(canvas.width - 1, Math.floor(canvas.width * fx));
          const y = Math.min(canvas.height - 1, Math.floor(canvas.height * fy));
          const d = ctx.getImageData(x, y, 1, 1).data;
          resolve([d[0], d[1], d[2]]);
        };
        if (img.complete && img.naturalWidth > 0) {
          draw();
        } else {
          img.onload = draw;
        }
      }),
    { fx, fy },
  );

/** 赤/青チェッカーが均されて赤とも青とも異なる混合色になっている（不可読化の証明） */
const expectMixedColor = ([r, g, b]: [number, number, number]) => {
  expect(r).toBeGreaterThan(60);
  expect(r).toBeLessThan(200);
  expect(b).toBeGreaterThan(60);
  expect(b).toBeLessThan(200);
  expect(g).toBeLessThan(60);
};

/**
 * プレビュー canvas 上でドラッグして領域を作成する（座標は canvas 左上基準）。
 * canvas はページ下部にありビューポート外へはみ出すことがあるため、
 * マウス操作の前に必ずスクロールで可視化する（座標がビューポート外だと
 * mousedown が対象要素へ届かず操作が無視される）。
 */
const dragRegion = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  const canvas = page.getByTestId("redact-preview-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.mouse.up();
};

/** フィクスチャを投入しプレビュー描画完了（右半分の白が読める）まで待つ */
const uploadAndWaitForPreview = async (page: Page) => {
  await page.goto("/redact/");
  await page.locator('input[type="file"]').setInputFiles(checkerPngFile());
  await expect
    .poll(async () => (await readPreviewPixel(page, 0.75, 0.5))[0], {
      timeout: 15_000,
    })
    .toBeGreaterThan(240);
};

const applyButton = (page: Page) =>
  page.getByRole("button", { name: "レタッチを適用", exact: true });

const zipButton = (page: Page) =>
  page.getByRole("button", { name: "Zipでダウンロード", exact: true });

test.describe("モザイク / ぼかしレタッチ /redact", () => {
  test("領域がないと実行できず、対応形式に TIFF/HEIC を含まない", async ({
    page,
  }) => {
    await page.goto("/redact/");
    await expect(
      page.getByText("対応形式: JPG, PNG, WebP, BMP", { exact: true }),
    ).toBeVisible();

    // 画像を投入しても領域を指定するまで実行ボタンは無効のまま
    await page.locator('input[type="file"]').setInputFiles(checkerPngFile());
    await expect(page.getByTestId("redact-preview-canvas")).toBeVisible({
      timeout: 15_000,
    });
    await expect(applyButton(page)).toBeDisabled();
  });

  test("モザイク: 領域が判読不能に均され、領域外は不変（プレビュー / 出力とも）", async ({
    page,
  }) => {
    await uploadAndWaitForPreview(page);

    // 左半分（チェッカーボード部分）へ領域を作成する
    await dragRegion(page, { x: 2, y: 2 }, { x: 98, y: 198 });
    await expect(page.getByTestId("redact-region")).toHaveCount(1);

    // プレビューの領域内が混合色に均される（既定モードはモザイク）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.25, 0.5))[1], {
        timeout: 10_000,
      })
      .toBeLessThan(60);
    expectMixedColor(await readPreviewPixel(page, 0.25, 0.5));
    // プレビューの領域外（右半分の白）は不変
    const outside = await readPreviewPixel(page, 0.75, 0.5);
    expect(outside[0]).toBeGreaterThan(240);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 出力サムネイルでも領域内は混合色・領域外は白（WYSIWYG）
    const result = page.locator('img[alt="checker_redacted.png"]');
    await expect(result).toBeVisible();
    expectMixedColor(await readImagePixel(result, 0.25, 0.5));
    const resultOutside = await readImagePixel(result, 0.75, 0.5);
    expect(resultOutside[0]).toBeGreaterThan(240);
    expect(resultOutside[1]).toBeGreaterThan(240);

    // ダウンロード物は _redacted サフィックス + 有効な PNG
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      zipButton(page).click(),
    ]);
    expect(download.suggestedFilename()).toBe("checker_redacted.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });

  test("ぼかし: 領域が判読不能に均される", async ({ page }) => {
    await uploadAndWaitForPreview(page);

    // ぼかしモードへ切り替えて領域を作成する
    await page.getByRole("button", { name: "ぼかし", exact: true }).click();
    await dragRegion(page, { x: 2, y: 2 }, { x: 98, y: 198 });
    await expect(page.getByTestId("redact-region")).toHaveCount(1);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 1px チェッカーがぼかしで混合色へ均されている
    const result = page.locator('img[alt="checker_redacted.png"]');
    await expect(result).toBeVisible();
    expectMixedColor(await readImagePixel(result, 0.25, 0.5));
    // 領域外は不変
    const outside = await readImagePixel(result, 0.75, 0.5);
    expect(outside[0]).toBeGreaterThan(240);
  });

  test("塗りつぶし: 領域が指定色（既定の黒）で完全に塗られる", async ({
    page,
  }) => {
    await uploadAndWaitForPreview(page);

    await page.getByRole("button", { name: "塗りつぶし", exact: true }).click();
    await dragRegion(page, { x: 2, y: 2 }, { x: 98, y: 198 });
    await expect(page.getByTestId("redact-region")).toHaveCount(1);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 領域内は黒（元の色情報が残らない）・領域外は不変
    const result = page.locator('img[alt="checker_redacted.png"]');
    await expect(result).toBeVisible();
    const [r, g, b] = await readImagePixel(result, 0.25, 0.5);
    expect(r).toBeLessThanOrEqual(10);
    expect(g).toBeLessThanOrEqual(10);
    expect(b).toBeLessThanOrEqual(10);
    const outside = await readImagePixel(result, 0.75, 0.5);
    expect(outside[0]).toBeGreaterThan(240);
  });

  test("複数領域の指定と個別削除: 削除した領域は元のまま、残した領域だけ処理される", async ({
    page,
  }) => {
    await uploadAndWaitForPreview(page);

    // 左上と左下に 2 つの領域を作成する
    // （2 つ目の開始点は領域 1 のリサイズハンドル（オーバーレイから 6px はみ出す）を避ける）
    await dragRegion(page, { x: 2, y: 2 }, { x: 98, y: 98 });
    await expect(page.getByTestId("redact-region")).toHaveCount(1);
    await dragRegion(page, { x: 20, y: 110 }, { x: 98, y: 198 });
    await expect(page.getByTestId("redact-region")).toHaveCount(2);

    // 2 つ目（左下）の領域を × ボタンで削除する
    await page.getByRole("button", { name: "領域 2 を削除" }).click();
    await expect(page.getByTestId("redact-region")).toHaveCount(1);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const result = page.locator('img[alt="checker_redacted.png"]');
    await expect(result).toBeVisible();
    // 残した領域（左上）は混合色に均されている
    expectMixedColor(await readImagePixel(result, 0.25, 0.25));
    // 削除した領域（左下）は 1px チェッカーの原色（赤 or 青）のまま
    const [r, , b] = await readImagePixel(result, 0.25, 0.75);
    const isPureRed = r > 200 && b < 60;
    const isPureBlue = b > 200 && r < 60;
    expect(isPureRed || isPureBlue).toBe(true);
  });
});
