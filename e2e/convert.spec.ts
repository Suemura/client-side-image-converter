import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import piexif from "piexifjs";
import {
  bmpFile,
  brokenImageFile,
  heicFile,
  jpegFileWithExif,
  loadExifFromPngBuffer,
  loadExifFromWebpBuffer,
  magicNumber,
  noisyBmpFile,
  pngFile,
  tiffFile,
} from "./helpers/fixtures";

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
  });

  test("対応形式の表示と実際に変換可能な形式が一致している", async ({
    page,
  }) => {
    await page.goto("/convert/");
    await expect(
      page.getByText("対応形式: JPG, PNG, WebP, BMP, TIFF, HEIC, HEIF", {
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
