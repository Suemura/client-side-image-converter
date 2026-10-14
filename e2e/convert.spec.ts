import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import piexif from "piexifjs";
import {
  bmpFile,
  brokenImageFile,
  dngFile,
  heicFile,
  jpegFileWithExif,
  loadExifFromPngBuffer,
  loadExifFromWebpBuffer,
  magicNumber,
  noisyBmpFile,
  pngFile,
  pngSize,
  tiffFile,
  transparentPngFile,
} from "./helpers/fixtures";
import { readPixelFromBuffer } from "./helpers/pixels";

test.describe("画像フォーマット変換", () => {
  test("PNG を JPEG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    await page.getByRole("button", { name: "変換", exact: true }).click();
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

    expect(download.suggestedFilename()).toBe("sample.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
  });

  test("PNG を WebP に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("WebP", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
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

    expect(download.suggestedFilename()).toBe("sample.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
  });

  test("PNG を AVIF に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("AVIF", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    // WASM エンコーダーの初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    // 1 ファイル時は ZIP 化されず単一ファイルとしてダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.avif");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isAvif(buf)).toBe(true);
  });

  test("PNG を JPEG XL に変換してダウンロードできる（プレビューは再デコード表示）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("JPEG XL", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    // WASM エンコーダーの初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    // Chromium は <img> で JXL を表示できないため、@jsquash/jxl の decode による
    // プレビュー用 PNG が生成・表示される（naturalWidth > 0 = デコード成功）
    const preview = page.locator('img[alt="sample.jxl"]');
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        () => preview.evaluate((img: HTMLImageElement) => img.naturalWidth),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    // 1 ファイル時は ZIP 化されず単一ファイルとしてダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.jxl");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJxl(buf)).toBe(true);
  });

  test("HEIC を JPEG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(heicFile());

    await page.getByRole("button", { name: "変換", exact: true }).click();
    // WASM デコーダーの初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    // 1 ファイル時は ZIP 化されず単一ファイルとしてダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
  });

  test("HEIC を PNG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(heicFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("PNG", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });

  test("TIFF を JPEG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(tiffFile());

    await page.getByRole("button", { name: "変換", exact: true }).click();
    // デコーダーの初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    // 1 ファイル時は ZIP 化されず単一ファイルとしてダウンロードされる
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
  });

  test("MIME タイプ不明の .tiff ファイルも受理して PNG に変換できる", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // TIFF は MIME タイプが特定されないブラウザ・OS があるため、拡張子フォールバックを検証する
    await page
      .locator('input[type="file"]')
      .setInputFiles(tiffFile("sample.tiff", "application/octet-stream"));

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("PNG", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });

  test("DNG（RAW）を PNG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(dngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("PNG", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    // LibRaw の WASM（約 1.4MB）初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
    // デモザイク後もフィクスチャの寸法（32x32）が保たれている
    expect(pngSize(buf)).toEqual({ width: 32, height: 32 });
  });

  test("MIME タイプ不明の .dng ファイルも受理して JPEG に変換できる", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // RAW は MIME が空や application/octet-stream で報告される環境があるため、
    // 拡張子フォールバックでの受理を検証する
    await page
      .locator('input[type="file"]')
      .setInputFiles(dngFile("sample.dng", "application/octet-stream"));

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
  });

  test("BMP を PNG に変換してダウンロードできる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(bmpFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
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

    expect(download.suggestedFilename()).toBe("sample.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
  });

  test("変換に失敗したファイルは失敗通知に表示される", async ({ page }) => {
    await page.goto("/convert/");
    // ネイティブ alert() に依存しないことを検証する（Issue #118）
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    // PNG を装った破損ファイルはデコードに失敗し、失敗通知に表示される
    await page.locator('input[type="file"]').setInputFiles(brokenImageFile());

    await page.getByRole("button", { name: "変換", exact: true }).click();

    // Next.js のルートアナウンサーも role="alert" を持つためファイル名でフィルタする
    const alert = page.getByRole("alert").filter({ hasText: "broken.png" });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    // 全ファイルが失敗した場合は変換結果セクションは表示されない
    await expect(
      page.getByRole("heading", { name: /変換結果/ }),
    ).not.toBeVisible();
    expect(dialogs).toEqual([]);
  });

  test("正常ファイルと破損ファイルの混在バッチで、成功結果と失敗通知の両方が表示される", async ({
    page,
  }) => {
    await page.goto("/convert/");
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile(), brokenImageFile()]);

    await page.getByRole("button", { name: "変換", exact: true }).click();

    // 破損ファイルは失敗通知に表示され、正常ファイルは変換結果に表示される
    const alert = page.getByRole("alert").filter({ hasText: "broken.png" });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    // 失敗の通知はネイティブ alert() に依存しない（Issue #118）
    expect(dialogs).toEqual([]);
  });

  test("対応形式の表示と実際に変換可能な形式が一致している", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await expect(
      page.getByText("対応形式: JPG, PNG, WebP, BMP, TIFF, HEIC, HEIF, RAW", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("MIME タイプ不明の .heic ファイルも受理して WebP に変換できる", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // HEIC は MIME タイプが空になるブラウザがあるため、拡張子フォールバックを検証する
    await page
      .locator('input[type="file"]')
      .setInputFiles(heicFile("sample.heic", "application/octet-stream"));

    await page.getByText("WebP", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("sample.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
  });

  test("目標ファイルサイズを指定して JPEG を圧縮できる", async ({ page }) => {
    await page.goto("/convert/");
    // 圧縮しにくい高周波 BMP を使い、目標サイズ以下への圧縮を検証する
    await page.locator('input[type="file"]').setInputFiles(noisyBmpFile());

    const targetKB = 40;
    await page
      .getByLabel("目標サイズ (KB)", { exact: true })
      .fill(String(targetKB));

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 20_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("noisy.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
    // 出力が目標サイズ（40KB）以下に収まっている
    expect(buf.length).toBeLessThanOrEqual(targetKB * 1024);
  });

  test("目標ファイルサイズを指定して WebP を圧縮できる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(noisyBmpFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("WebP", { exact: true }).click();

    const targetKB = 40;
    await page
      .getByLabel("目標サイズ (KB)", { exact: true })
      .fill(String(targetKB));

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 20_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("noisy.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
    expect(buf.length).toBeLessThanOrEqual(targetKB * 1024);
  });

  test("目標ファイルサイズが達成できない場合は警告を表示しフォールバック出力する", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(noisyBmpFile());

    // 1KB は最低品質でも達成不可能なため、フォールバック（最小サイズ）で出力される
    await page.getByLabel("目標サイズ (KB)", { exact: true }).fill("1");

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 20_000,
    });

    // 達成不可の警告が表示される（Next.js のルートアナウンサーも role="alert" のため文言でフィルタ）
    const warning = page
      .getByRole("alert")
      .filter({ hasText: "目標サイズまで圧縮できませんでした" });
    await expect(warning).toBeVisible();

    // フォールバックでも有効な JPEG がダウンロードできる（目標は超過している）
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    expect(download.suggestedFilename()).toBe("noisy.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1 * 1024);
  });

  test("ファイル詳細モーダルで EXIF 情報を表示できる（exif-js の遅延ロード）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    // ファイル一覧のアイテムをクリックして詳細モーダルを開く
    await page.getByRole("button", { name: /with-exif\.jpg/ }).click();

    // 動的 import された exif-js が実ブラウザでロードされ、EXIF が表示される
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "EXIF情報" }),
    ).toBeVisible();
    await expect(dialog.getByText("TestMake")).toBeVisible();
  });

  test("JPEG(EXIF入り)→PNG 変換で EXIF を保持できる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    // 出力形式を PNG にし、EXIF 保持を有効化する
    await page.getByText("PNG", { exact: true }).click();
    await page.getByText("EXIF情報を保持", { exact: true }).click();

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

    // PNG の eXIf チャンクから EXIF が復元できる
    const exif = loadExifFromPngBuffer(buf);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
  });

  test("JPEG(EXIF入り)→WebP 変換で EXIF を保持できる", async ({ page }) => {
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    // 出力形式を WebP にし、EXIF 保持を有効化する
    await page.getByText("WebP", { exact: true }).click();
    await page.getByText("EXIF情報を保持", { exact: true }).click();

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

    expect(download.suggestedFilename()).toBe("with-exif.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);

    // WebP の EXIF チャンクから EXIF が復元できる
    const exif = loadExifFromWebpBuffer(buf);
    expect(exif["0th"]?.[piexif.ImageIFD.Make]).toBe("TestMake");
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe("N");
  });

  test("複数ファイルを一括で JPEG に変換し ZIP に全件が含まれる（Worker プール）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // 3 枚を一括投入する（ワーカープールで並列変換される。順序・件数・中身を検証）
    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile("a.png"), pngFile("b.png"), pngFile("c.png")]);

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 20_000,
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
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["a.jpeg", "b.jpeg", "c.jpeg"]);

    // 各エントリが有効な JPEG であること（欠落・取り違えがない）
    for (const name of names) {
      const entry = zip.file(name);
      expect(entry).not.toBeNull();
      const buf = await entry!.async("nodebuffer");
      expect(magicNumber.isJpeg(buf)).toBe(true);
    }
  });

  test("複数ファイルを一括で AVIF に変換できる（Worker で WASM エンコード）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile("one.png"), pngFile("two.png")]);

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("AVIF", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    // WASM エンコーダーの初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["one.avif", "two.avif"]);
    for (const name of names) {
      const buf = await zip.file(name)!.async("nodebuffer");
      expect(magicNumber.isAvif(buf)).toBe(true);
    }
  });

  test("複数ファイルを一括で JPEG XL に変換できる（Worker で WASM エンコード）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile("one.png"), pngFile("two.png")]);

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("JPEG XL", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();
    // WASM エンコーダーの初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "Zipでダウンロード", exact: true })
        .click(),
    ]);

    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["one.jxl", "two.jxl"]);
    for (const name of names) {
      const buf = await zip.file(name)!.async("nodebuffer");
      expect(magicNumber.isJxl(buf)).toBe(true);
    }
  });

  test("透過 PNG → JPEG 変換で透過部分が白背景に合成される（Worker 経路）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // 左半分が不透明の赤・右半分が完全透過の RGBA PNG（Issue #108）
    await page
      .locator('input[type="file"]')
      .setInputFiles(transparentPngFile());

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

    expect(download.suggestedFilename()).toBe("transparent.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);

    // 不透明部（左半分の中央）は赤のまま（JPEG の劣化を許容した閾値で判定）
    const opaque = await readPixelFromBuffer(
      page,
      buf,
      "image/jpeg",
      0.25,
      0.5,
    );
    expect(opaque[0]).toBeGreaterThan(200);
    expect(opaque[1]).toBeLessThan(60);
    expect(opaque[2]).toBeLessThan(60);

    // 透過部（右半分の中央）は黒ではなく白背景に合成される
    const flattened = await readPixelFromBuffer(
      page,
      buf,
      "image/jpeg",
      0.75,
      0.5,
    );
    for (const channel of flattened) {
      expect(channel).toBeGreaterThanOrEqual(240);
    }
  });

  test("透過 PNG → JPEG 変換で透過部分が白背景に合成される（メインスレッド経路）", async ({
    page,
  }) => {
    // OffscreenCanvas.convertToBlob を無効化して isOffscreenPipelineSupported を false にし、
    // Worker プールではなくメインスレッドのフォールバック経路を強制する
    await page.addInitScript(() => {
      delete (OffscreenCanvas.prototype as { convertToBlob?: unknown })
        .convertToBlob;
    });
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(transparentPngFile());

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

    expect(download.suggestedFilename()).toBe("transparent.jpeg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);

    // 不透明部は赤のまま・透過部は白背景（Worker 経路と同一の WYSIWYG 検証）
    const opaque = await readPixelFromBuffer(
      page,
      buf,
      "image/jpeg",
      0.25,
      0.5,
    );
    expect(opaque[0]).toBeGreaterThan(200);
    expect(opaque[1]).toBeLessThan(60);
    expect(opaque[2]).toBeLessThan(60);

    const flattened = await readPixelFromBuffer(
      page,
      buf,
      "image/jpeg",
      0.75,
      0.5,
    );
    for (const channel of flattened) {
      expect(channel).toBeGreaterThanOrEqual(240);
    }
  });

  test("透過 PNG → WebP 変換では透過が保持される（回帰検証）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(transparentPngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
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

    expect(download.suggestedFilename()).toBe("transparent.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);

    // 透過部（右半分の中央）のアルファが保持されている（白塗りされていない）
    const alpha = await page.evaluate(async (arr) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(arr)], { type: "image/webp" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context を取得できませんでした");
      }
      ctx.drawImage(bitmap, 0, 0);
      const x = Math.floor(bitmap.width * 0.75);
      const y = Math.floor(bitmap.height * 0.5);
      return ctx.getImageData(x, y, 1, 1).data[3];
    }, Array.from(buf));
    expect(alpha).toBe(0);
  });

  test("変換時に Web Worker が生成される（処理がメインスレッド外で実行される）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // Worker の生成を待ち受ける（PNG→JPEG は @jsquash を使わないため、生成される Worker は
    // 本アプリの画像処理 Worker であることを保証できる）
    const workerPromise = page.waitForEvent("worker", { timeout: 15_000 });

    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile("w1.png"), pngFile("w2.png")]);
    await page.getByRole("button", { name: "変換", exact: true }).click();

    const worker = await workerPromise;
    // Next.js がバンドルした静的チャンクとして Worker がロードされている
    expect(worker.url()).toContain("/_next/static/");

    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 20_000,
    });
  });
});
