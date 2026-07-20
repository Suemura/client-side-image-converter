import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import {
  cubeLutFile,
  magicNumber,
  pngSize,
  rectPngFile,
} from "./helpers/fixtures";
import { readPixelFromBuffer } from "./helpers/pixels";

/** 空状態の FileUploadArea へファイルを投入する */
const addInitialFiles = async (
  page: Page,
  files: Parameters<ReturnType<Page["locator"]>["setInputFiles"]>[0],
) => {
  await page.locator('input[type="file"]').first().setInputFiles(files);
};

test.describe("統合ワークスペース（/studio）", () => {
  test("PC: 空状態から画像を投入するとワークスペースが表示される", async ({
    page,
  }) => {
    await page.goto("/studio/");

    // 空状態（アップロード領域）が表示される
    await expect(
      page.getByText("画像を追加してワークスペースを開始"),
    ).toBeVisible();

    await addInitialFiles(page, rectPngFile("rect.png", 40, 20));

    // レール・キャンバス・右パネル（既定は切り抜き）・フィルムストリップが揃う
    await expect(page.getByTestId("studio-rail-crop")).toBeVisible();
    await expect(page.getByTestId("studio-canvas-stage")).toBeVisible();
    await expect(page.getByText("トリミング・回転・反転")).toBeVisible();
    await expect(page.getByText("一括処理")).toBeVisible();
    await expect(page.getByText("1 枚")).toBeVisible();

    // ツール切替で右パネルが連動する
    await page.getByTestId("studio-rail-adjust").click();
    await expect(
      page.getByText("露光・色・ディテールを非破壊で編集"),
    ).toBeVisible();
    await page.getByTestId("studio-rail-upscale").click();
    await expect(
      page.getByText("超解像で解像度を拡大（端末内で処理）"),
    ).toBeVisible();
    await page.getByTestId("studio-rail-info").click();
    await expect(
      page.getByText("EXIFを確認し、プライバシー情報を削除"),
    ).toBeVisible();
  });

  test("PC: ズームボタンでプレビューの表示サイズが変わる", async ({ page }) => {
    await page.goto("/studio/");
    await addInitialFiles(page, rectPngFile("rect.png", 40, 20));

    // 既定ツール（切り抜き）のプレビュー画像がフィット表示される
    const previewImage = page
      .getByTestId("studio-canvas-stage")
      .locator("img")
      .first();
    await expect(previewImage).toBeVisible({ timeout: 15_000 });
    const baseBox = await previewImage.boundingBox();
    expect(baseBox).not.toBeNull();

    // ズームイン → 表示幅が拡大する
    await page.getByRole("button", { name: "拡大表示" }).click();
    await expect
      .poll(async () => (await previewImage.boundingBox())?.width ?? 0)
      .toBeGreaterThan((baseBox?.width ?? 0) * 1.2);

    // ズームアウト × 2 → フィットより縮小される
    await page.getByRole("button", { name: "縮小表示" }).click();
    await page.getByRole("button", { name: "縮小表示" }).click();
    await expect
      .poll(async () => (await previewImage.boundingBox())?.width ?? 0)
      .toBeLessThan(baseBox?.width ?? 0);
  });

  test("PC: 切り抜き（1:1）を適用し全画像を ZIP で書き出せる", async ({
    page,
  }) => {
    await page.goto("/studio/");
    await addInitialFiles(page, [
      rectPngFile("rect1.png", 40, 20),
      rectPngFile("rect2.png", 40, 20),
    ]);

    // 1:1 プリセットを選択し、初期領域（画像全体）が正方形へ収まる
    const applyCrop = page.getByRole("button", {
      name: "トリミングを適用",
      exact: true,
    });
    await expect(applyCrop).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "1:1", exact: true }).click();
    await applyCrop.click();

    // 適用完了で undo が有効になる（コミット単位の履歴）
    await expect(page.getByTestId("studio-undo")).toBeEnabled({
      timeout: 15_000,
    });

    // 書き出しダイアログ: PNG / 全 2 枚（ZIP）
    await page.getByTestId("studio-export-open").click();
    await page.getByTestId("studio-export-format-png").click();
    await page.getByTestId("studio-export-target-all").click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "書き出す", exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files);
    expect(names).toHaveLength(2);
    for (const name of names) {
      const buf = await zip.file(name)?.async("nodebuffer");
      expect(buf).toBeTruthy();
      expect(magicNumber.isPng(buf as Buffer)).toBe(true);
      // 1:1 適用済み = 正方形（元は 40x20 の横長）
      const size = pngSize(buf as Buffer);
      expect(size.width).toBe(size.height);
      expect(size.width).toBeLessThan(40);
    }
  });

  test("PC: 調整（LUT）を確定すると currentFile へ焼き込まれ書き出しに反映される", async ({
    page,
  }) => {
    await page.goto("/studio/");
    // 赤みの強い画像（R=200, B=30）
    await addInitialFiles(page, rectPngFile("rb.png", 16, 16, [200, 30, 30]));

    // 調整ツールへ切替、R↔B を入れ替える .cube を読み込む
    await page.getByTestId("studio-rail-adjust").click();
    await page
      .locator('input[accept*="cube"]')
      .setInputFiles(cubeLutFile("swap.cube"));

    // 確定（焼き込み）
    const confirmButton = page.getByRole("button", {
      name: "この調整を確定",
      exact: true,
    });
    await expect(confirmButton).toBeEnabled({ timeout: 15_000 });
    await confirmButton.click();
    await expect(page.getByTestId("studio-undo")).toBeEnabled({
      timeout: 15_000,
    });

    // 書き出し（PNG 単枚）して R/B が入れ替わっていることをバイナリで検証（WYSIWYG）
    await page.getByTestId("studio-export-open").click();
    await page.getByTestId("studio-export-format-png").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "書き出す", exact: true }).click(),
    ]);
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
    const [r, , b] = await readPixelFromBuffer(
      page,
      buf,
      "image/png",
      0.5,
      0.5,
    );
    expect(r).toBeLessThan(70);
    expect(b).toBeGreaterThan(180);
  });

  test("PC: undo で適用前のファイルへ戻せる", async ({ page }) => {
    await page.goto("/studio/");
    await addInitialFiles(page, rectPngFile("rect.png", 40, 20));

    const applyCrop = page.getByRole("button", {
      name: "トリミングを適用",
      exact: true,
    });
    await expect(applyCrop).toBeEnabled({ timeout: 15_000 });
    await page.getByRole("button", { name: "1:1", exact: true }).click();
    await applyCrop.click();
    await expect(page.getByTestId("studio-undo")).toBeEnabled({
      timeout: 15_000,
    });

    // undo → 書き出すと元の 40x20 のまま
    await page.getByTestId("studio-undo").click();
    await expect(page.getByTestId("studio-redo")).toBeEnabled();

    await page.getByTestId("studio-export-open").click();
    await page.getByTestId("studio-export-format-png").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "書き出す", exact: true }).click(),
    ]);
    const buf = readFileSync(await download.path());
    const size = pngSize(buf);
    expect(size.width).toBe(40);
    expect(size.height).toBe(20);
  });

  test("スマホ: タブバー・ボトムシート・フローティング比較トグルが表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 820 });
    await page.goto("/studio/");
    await addInitialFiles(page, rectPngFile("rect.png", 40, 20));

    // 下タブバー（6 タブ）とボトムシート（切り抜きパネル）が表示される
    await expect(page.getByTestId("studio-tab-crop")).toBeVisible();
    await expect(page.getByTestId("studio-tab-removebg")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "トリミングを適用", exact: true }),
    ).toBeVisible();

    // 調整タブへ切替でフローティング比較トグルが出る
    await page.getByTestId("studio-tab-adjust").click();
    await expect(
      page.getByRole("button", { name: "前後比較", exact: true }),
    ).toBeVisible();

    // 情報タブでメタデータパネル
    await page.getByTestId("studio-tab-info").click();
    await expect(
      page.getByRole("button", { name: "選択したメタデータを削除" }),
    ).toBeVisible();
  });

  test("既存ページの回帰なし: /studio がナビゲーションに追加されている", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "スタジオ", exact: true }),
    ).toBeVisible();
  });

  test("PC: 情報ツールで長押しすると元画像が表示され、離すと戻る", async ({
    page,
  }) => {
    await page.goto("/studio/");
    await addInitialFiles(page, rectPngFile("hold.png", 40, 20));

    // 静的プレビュー系ツール（情報）へ切り替える
    await page.getByTestId("studio-rail-info").click();
    const preview = page.getByTestId("studio-preview-canvas");
    await expect(preview).toBeVisible();

    // 長押しオーバーレイは初期状態では非表示（display: none で mount 済み）
    const overlay = page.getByTestId("studio-hold-original");
    await expect(overlay).toBeHidden();

    const box = await preview.boundingBox();
    if (!box) throw new Error("preview canvas not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // 約 300ms のしきい値経過で元画像（編集前バッジ付き）が表示される
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await expect(overlay.getByText("編集前")).toBeVisible();

    // 離すと即座に戻る
    await page.mouse.up();
    await expect(overlay).toBeHidden();
  });
});
