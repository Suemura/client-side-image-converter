import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import {
  insertJpegOrientation,
  magicNumber,
  rectPngFile,
} from "./helpers/fixtures";

/**
 * 画像最適化（フォーマット維持の再圧縮・可逆最適化）の E2E（Issue #61）
 *
 * 検証観点:
 * - PNG: 同一形式でサイズ削減 + ピクセル不変（oxipng は可逆）
 * - JPEG / WebP: 同一形式でサイズ削減（高品質再エンコード）
 * - 混在バッチが各形式のまま一括最適化される（Worker プール経路）
 */

/**
 * 圧縮しにくい高周波ノイズ画像を Canvas で生成し、指定形式の「太った」ソースを作る。
 * 最高品質でエンコードするため、最適化（再エンコード）で確実にサイズが縮む。
 * バイナリはリポジトリに置かず実行時生成する方針（fixtures.ts と同じ）。
 */
const makeFatImage = async (
  page: Page,
  mimeType: "image/jpeg" | "image/webp",
  width = 256,
  height = 256,
): Promise<{ name: string; mimeType: string; buffer: Buffer }> => {
  const arr = await page.evaluate(
    async ({ mime, w, h }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("no ctx");
      }
      const image = ctx.createImageData(w, h);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = (i * 2654435761) >>> 0;
        image.data[i] = n & 0xff;
        image.data[i + 1] = (n >>> 8) & 0xff;
        image.data[i + 2] = (n >>> 16) & 0xff;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b as Blob), mime, 1.0);
      });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { mime: mimeType, w: width, h: height },
  );

  const ext = mimeType === "image/jpeg" ? "jpg" : "webp";
  return { name: `fat.${ext}`, mimeType, buffer: Buffer.from(arr) };
};

/** 最適化モードに切り替え、最適化を実行して単一ファイルのダウンロードを取得する */
const runSingleOptimize = async (page: Page) => {
  await page.getByText("最適化（形式を維持）", { exact: true }).click();
  await page.getByRole("button", { name: "最適化", exact: true }).click();
  await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
    timeout: 30_000,
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Zipでダウンロード", exact: true })
      .click(),
  ]);
  return download;
};

test.describe("画像最適化（フォーマット維持）", () => {
  test("PNG を同一形式・ピクセル不変でサイズ削減できる", async ({ page }) => {
    await page.goto("/convert/");
    // 非圧縮 IDAT の PNG を使うと oxipng の再圧縮で確実に縮む
    const original = rectPngFile("rect.png", 64, 64);
    await page.locator('input[type="file"]').setInputFiles(original);

    const download = await runSingleOptimize(page);

    // 同一フォーマット（PNG）・元ファイル名を維持
    expect(download.suggestedFilename()).toBe("rect.png");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isPng(buf)).toBe(true);
    // 実際にサイズが削減されている
    expect(buf.length).toBeLessThan(original.buffer.length);

    // ピクセル不変（元 PNG と最適化後 PNG のデコード結果が完全一致）
    const identical = await page.evaluate(
      async ({ a, b }) => {
        const decode = async (arr: number[]): Promise<number[]> => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(arr)], { type: "image/png" }),
          );
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("no ctx");
          }
          ctx.drawImage(bitmap, 0, 0);
          return Array.from(
            ctx.getImageData(0, 0, bitmap.width, bitmap.height).data,
          );
        };
        const da = await decode(a);
        const db = await decode(b);
        if (da.length !== db.length) {
          return false;
        }
        return da.every((v, i) => v === db[i]);
      },
      { a: Array.from(original.buffer), b: Array.from(buf) },
    );
    expect(identical).toBe(true);
  });

  test("JPEG を同一形式でサイズ削減できる", async ({ page }) => {
    await page.goto("/convert/");
    const original = await makeFatImage(page, "image/jpeg");
    await page.locator('input[type="file"]').setInputFiles(original);

    const download = await runSingleOptimize(page);

    expect(download.suggestedFilename()).toBe("fat.jpg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
    expect(buf.length).toBeLessThan(original.buffer.length);
  });

  test("WebP を同一形式でサイズ削減できる", async ({ page }) => {
    await page.goto("/convert/");
    const original = await makeFatImage(page, "image/webp");
    await page.locator('input[type="file"]').setInputFiles(original);

    const download = await runSingleOptimize(page);

    expect(download.suggestedFilename()).toBe("fat.webp");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isWebp(buf)).toBe(true);
    expect(buf.length).toBeLessThan(original.buffer.length);
  });

  test("JPEG の EXIF Orientation を焼き込んで正しい向きで最適化する", async ({
    page,
  }) => {
    await page.goto("/convert/");
    // 横長(256x128)の JPEG に Orientation=6（右 90° 回転で表示 → 縦長 128x256）を付与する。
    // 最適化で向きを焼き込まないと、EXIF を持たない再エンコード結果は横長のまま表示され回転バグになる。
    const landscape = await makeFatImage(page, "image/jpeg", 256, 128);
    const rotated = insertJpegOrientation(landscape.buffer, 6);
    await page.locator('input[type="file"]').setInputFiles({
      name: "rotated.jpg",
      mimeType: "image/jpeg",
      buffer: rotated,
    });

    const download = await runSingleOptimize(page);
    expect(download.suggestedFilename()).toBe("rotated.jpg");
    const buf = readFileSync(await download.path());
    expect(magicNumber.isJpeg(buf)).toBe(true);
    // 再エンコードが採用される（元 + EXIF より小さい）
    expect(buf.length).toBeLessThan(rotated.length);

    // 出力の「格納ピクセル」寸法が縦長(128x256)になっている = Orientation がピクセルへ焼き込まれた証拠。
    // imageOrientation:"none" で焼き込み済みの生ピクセルを測る（タグに依らず判定するため）。
    const stored = await page.evaluate(async (arr) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(arr)], { type: "image/jpeg" }),
        { imageOrientation: "none" },
      );
      return { width: bitmap.width, height: bitmap.height };
    }, Array.from(buf));
    expect(stored).toEqual({ width: 128, height: 256 });
  });

  test("PNG / JPEG / WebP の混在バッチを各形式のまま一括最適化できる（Worker プール）", async ({
    page,
  }) => {
    await page.goto("/convert/");
    const jpeg = await makeFatImage(page, "image/jpeg");
    const webp = await makeFatImage(page, "image/webp");
    const png = rectPngFile("rect.png", 48, 48);
    await page.locator('input[type="file"]').setInputFiles([png, jpeg, webp]);

    await page.getByText("最適化（形式を維持）", { exact: true }).click();
    await page.getByRole("button", { name: "最適化", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
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
    // 各形式の拡張子がそのまま維持されている（変換されていない）
    expect(names).toEqual(["fat.jpg", "fat.webp", "rect.png"]);

    // 各エントリが元と同じフォーマットのマジックナンバーを持つ
    const jpgBuf = await zip.file("fat.jpg")!.async("nodebuffer");
    const webpBuf = await zip.file("fat.webp")!.async("nodebuffer");
    const pngBuf = await zip.file("rect.png")!.async("nodebuffer");
    expect(magicNumber.isJpeg(jpgBuf)).toBe(true);
    expect(magicNumber.isWebp(webpBuf)).toBe(true);
    expect(magicNumber.isPng(pngBuf)).toBe(true);
  });

  test("最適化モードでは別形式変換用の設定が非表示になる", async ({ page }) => {
    await page.goto("/convert/");
    // 変換モードでは対象フォーマット選択が見える
    await expect(
      page.getByRole("heading", { name: "対象フォーマット", exact: true }),
    ).toBeVisible();

    await page.getByText("最適化（形式を維持）", { exact: true }).click();

    // 最適化モードでは対象フォーマット・目標ファイルサイズの設定が消える
    await expect(
      page.getByRole("heading", { name: "対象フォーマット", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "目標ファイルサイズ（オプション）",
        exact: true,
      }),
    ).not.toBeVisible();
    // 最適化の説明が表示される
    await expect(page.getByText(/元の形式のまま再圧縮/)).toBeVisible();
  });
});
