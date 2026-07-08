import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import {
  magicNumber,
  rectPngFile,
  twoToneVerticalPngFile,
} from "./helpers/fixtures";

/** レンジスライダー（aria-label で特定）へ React 経由で値を設定する */
const setSlider = async (page: Page, label: string, value: number) => {
  await page.getByLabel(label, { exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    // React の value トラッカーを更新するためネイティブ setter 経由で設定する
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
};

/** プレビュー canvas の相対座標 (fx, fy) の RGB を読む */
const readPreviewPixel = (
  page: Page,
  fx: number,
  fy: number,
): Promise<[number, number, number]> =>
  page.getByTestId("edit-preview-canvas").evaluate(
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

/** <img>（結果サムネイル）の相対座標 (fx, fy) の RGB を読む */
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

const applyButton = (page: Page) =>
  page.getByRole("button", { name: "編集を適用", exact: true });

const zipButton = (page: Page) =>
  page.getByRole("button", { name: "Zipでダウンロード", exact: true });

test.describe("画像編集 /edit", () => {
  test("ナビゲーションから /edit を開ける・対応形式に TIFF/HEIC を含まない", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "編集", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "画像編集", level: 1 }),
    ).toBeVisible();
    // crop と同じ UPLOAD_FORMATS（HEIC/TIFF はプレビュー描画不可のため対象外）
    await expect(
      page.getByText("対応形式: JPG, PNG, WebP, BMP", { exact: true }),
    ).toBeVisible();
  });

  test("露光・輝度を上げるとプレビューと出力が明るくなる（WYSIWYG）", async ({
    page,
  }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("gray.png", 16, 16, [128, 128, 128]));

    // プレビューが生成されるまで待つ（初期は元のグレー ~128）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    await setSlider(page, "露光量", 70);
    await setSlider(page, "輝度", 40);

    // プレビューが明るくなる（即時反映）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(180);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 出力サムネイルもプレビューと同じく明るい（WYSIWYG）
    const result = page.locator('img[alt="gray_edited.png"]');
    await expect(result).toBeVisible();
    const [r] = await readImagePixel(result, 0.5, 0.5);
    expect(r).toBeGreaterThan(180);
  });

  test("画像を追加しても編集中の調整値が維持される", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("first.png", 16, 16, [128, 128, 128]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    // 露光量を設定し、スライダーに反映されていることを確認
    await setSlider(page, "露光量", 70);
    const exposure = page.getByLabel("露光量", { exact: true });
    await expect(exposure).toHaveValue("70");

    // 2 枚目を追加（FileUploadArea は既存に追記する）
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("second.png", 16, 16, [128, 128, 128]));

    // ファイルが 2 枚に増えても、編集中の露光量はリセットされず維持される
    await expect(page.getByText("選択されたファイル (2個)")).toBeVisible();
    await expect(exposure).toHaveValue("70");
  });

  test("編集で上下が入れ替わらない（向き保持）", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        twoToneVerticalPngFile(
          "tone.png",
          16,
          16,
          [230, 230, 230],
          [20, 20, 20],
        ),
      );

    // 無調整のプレビューで上が明るく下が暗い（WebGL の Y 反転が正しい）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.25))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(150);
    expect((await readPreviewPixel(page, 0.5, 0.75))[0]).toBeLessThan(100);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const result = page.locator('img[alt="tone_edited.png"]');
    await expect(result).toBeVisible();
    expect((await readImagePixel(result, 0.5, 0.25))[0]).toBeGreaterThan(150);
    expect((await readImagePixel(result, 0.5, 0.75))[0]).toBeLessThan(100);
  });

  test("複数画像を一括編集し ZIP に全件含まれる", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        rectPngFile("a.png", 16, 16, [120, 120, 120]),
        rectPngFile("b.png", 16, 16, [120, 120, 120]),
      ]);

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(80);

    await setSlider(page, "露光量", 60);
    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      zipButton(page).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const a = await zip.file("a_edited.png")?.async("nodebuffer");
    const b = await zip.file("b_edited.png")?.async("nodebuffer");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(magicNumber.isPng(a as Buffer)).toBe(true);
    expect(magicNumber.isPng(b as Buffer)).toBe(true);
  });

  test("画像ごとモードで画像単位に異なる調整を適用できる", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles([
        rectPngFile("g1.png", 16, 16, [120, 120, 120]),
        rectPngFile("g2.png", 16, 16, [120, 120, 120]),
      ]);

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(80);

    // 「画像ごと」モードへ切替え、1 枚目だけ露光を強く上げる
    await page.getByRole("button", { name: "画像ごと", exact: true }).click();
    await setSlider(page, "露光量", 90);
    await setSlider(page, "輝度", 60);

    // 2 枚目へ移動（調整しない）
    await page.getByRole("button", { name: "次の画像" }).click();
    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    const first = page.locator('img[alt="g1_edited.png"]');
    const second = page.locator('img[alt="g2_edited.png"]');
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();
    const [firstR] = await readImagePixel(first, 0.5, 0.5);
    const [secondR] = await readImagePixel(second, 0.5, 0.5);
    // 1 枚目は明るく、2 枚目は元のグレーのまま
    expect(firstR).toBeGreaterThan(200);
    expect(secondR).toBeLessThan(160);
    expect(firstR - secondR).toBeGreaterThan(40);
  });

  test("WebGL2 非対応時に Canvas2D フォールバックで動作する", async ({
    page,
  }) => {
    // WebGL コンテキストを無効化して CPU パスへフォールバックさせる
    await page.addInitScript(() => {
      const proto = HTMLCanvasElement.prototype as unknown as {
        getContext: (type: string, ...args: unknown[]) => unknown;
      };
      const original = proto.getContext;
      proto.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl2" || type === "webgl") {
          return null;
        }
        return original.call(this, type, ...args);
      };
    });

    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("cpu.png", 16, 16, [128, 128, 128]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    await setSlider(page, "露光量", 70);
    await setSlider(page, "輝度", 40);

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(180);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    const result = page.locator('img[alt="cpu_edited.png"]');
    await expect(result).toBeVisible();
    expect((await readImagePixel(result, 0.5, 0.5))[0]).toBeGreaterThan(180);
  });

  test("出力フォーマットを JPEG に変更して書き出せる", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("photo.png", 16, 16, [120, 120, 120]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(80);

    // 出力フォーマットを JPEG に
    await page.getByText("JPEG", { exact: true }).click();
    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 単一ファイルは ZIP 化されず直接ダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      zipButton(page).click(),
    ]);
    expect(download.suggestedFilename()).toBe("photo_edited.jpeg");
    expect(magicNumber.isJpeg(readFileSync(await download.path()))).toBe(true);
  });
});
