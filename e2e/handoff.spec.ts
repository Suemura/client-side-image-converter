import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import {
  jpegFileWithExif,
  magicNumber,
  pngFile,
  rectPngFile,
} from "./helpers/fixtures";

/** 調整スライダーへ値を設定する（e2e/edit.spec.ts の setSlider と同一実装） */
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

  test("convert の結果をダウンロードせず metadata へ引き継げる", async ({
    page,
  }) => {
    // 1. convert で PNG を JPEG に変換する
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 2. 結果をメタデータへ送る
    await page
      .getByRole("button", { name: "メタデータへ送る", exact: true })
      .click();
    await expect(page).toHaveURL(/\/metadata\/?$/);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "変換の結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 3. 引き継いだファイルが取り込まれメタデータ解析まで進む
    await expect(
      page.getByRole("heading", { name: /アップロード済み画像 \(1\)/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("sample.jpeg", { exact: true })).toBeVisible();
  });

  test("metadata のクリーニング結果をダウンロードせず convert へ引き継いで変換できる", async ({
    page,
  }) => {
    // 1. metadata で EXIF 入り JPEG を解析しリスクタグを選択する
    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());
    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "リスクタグを選択" }).click();

    // 2. クリーニングして変換へ送る（ダウンロードしない）
    await expect(
      page.getByText(/選択したメタデータを削除して次のツールへ/),
    ).toBeVisible();
    await page.getByRole("button", { name: "変換へ送る", exact: true }).click();
    await expect(page).toHaveURL(/\/convert\/?$/, { timeout: 15_000 });
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "メタデータの結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 3. 引き継いだクリーニング済み画像を PNG へ変換してダウンロード検証
    //    （ファイル名はクリーニングで変わらず、変換で拡張子が変わる）
    await page.getByText("PNG", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);
    expect(download.suggestedFilename()).toBe("with-exif.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });

  test("edit の編集結果をダウンロードせず convert へ引き継いで変換できる（編集 → 変換の中核フロー）", async ({
    page,
  }) => {
    // 1. edit で PNG を編集する（既定の元形式維持で書き出し）
    await page.goto("/edit/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    const applyButton = page.getByRole("button", {
      name: "編集を適用",
      exact: true,
    });
    await expect(applyButton).toBeEnabled({ timeout: 15_000 });

    // 露光量を動かし「実際に編集された結果」が次のツールへ渡ることを担保する
    // （編集自体の忠実性検証は e2e/edit.spec.ts でカバー済み）
    await setSlider(page, "露光量", 70);
    await expect(page.getByLabel("露光量", { exact: true })).toHaveValue("70");

    await applyButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 2. 編集結果を変換へ送る
    await page.getByRole("button", { name: "変換へ送る", exact: true }).click();
    await expect(page).toHaveURL(/\/convert\/?$/);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "編集の結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 3. WebP へ変換してダウンロード検証（sample.png → sample_edited.png → sample_edited.webp）
    await page.getByText("WebP", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);
    expect(download.suggestedFilename()).toBe("sample_edited.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
  });

  test("convert の結果を redact へ引き継ぎ、レタッチ結果を metadata へ送れる（投稿前の安全化フロー）", async ({
    page,
  }) => {
    // 1. convert で PNG を JPEG に変換する（ドラッグ操作ができる大きさのフィクスチャを使う）
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("rect.png", 200, 100));
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 2. 結果をモザイク（redact）へ送る
    await page
      .getByRole("button", { name: "モザイクへ送る", exact: true })
      .click();
    await expect(page).toHaveURL(/\/redact\/?$/);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "変換の結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 3. プレビュー描画（canvas が自然サイズになる）を待って領域をドラッグ指定し、レタッチを適用する
    const canvas = page.getByTestId("redact-preview-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => canvas.evaluate((el) => (el as HTMLCanvasElement).width), {
        timeout: 15_000,
      })
      .toBe(200);
    // canvas はページ下部でビューポート外へはみ出すことがあるため、ドラッグ前に可視化する
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 80, { steps: 5 });
    await page.mouse.up();

    const applyButton = page.getByRole("button", {
      name: "レタッチを適用",
      exact: true,
    });
    await expect(applyButton).toBeEnabled();
    await applyButton.click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 4. レタッチ結果をメタデータへ送る（レタッチ → メタデータ削除 → 投稿の安全化フロー）
    await page
      .getByRole("button", { name: "メタデータへ送る", exact: true })
      .click();
    await expect(page).toHaveURL(/\/metadata\/?$/);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "モザイクの結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 5. ファイル名が連鎖して取り込まれている（rect.png → rect.jpeg → rect_redacted.jpeg）
    await expect(
      page.getByRole("heading", { name: /アップロード済み画像 \(1\)/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("rect_redacted.jpeg", { exact: true }),
    ).toBeVisible();
  });

  test("convert の結果をダウンロードせず edit へ引き継げる", async ({
    page,
  }) => {
    // 1. convert で PNG を JPEG に変換する
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 2. 結果を編集へ送る
    await page.getByRole("button", { name: "編集へ送る", exact: true }).click();
    await expect(page).toHaveURL(/\/edit\/?$/);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "変換の結果 1 件を引き継ぎました" }),
    ).toBeVisible();

    // 3. 引き継いだ画像がプレビューまで読み込まれ、編集を適用できる状態になる
    await expect(
      page.getByRole("button", { name: "編集を適用", exact: true }),
    ).toBeEnabled({ timeout: 15_000 });
  });
});
