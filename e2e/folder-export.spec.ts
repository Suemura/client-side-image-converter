import { expect, test } from "@playwright/test";
import { magicNumber, pngFile } from "./helpers/fixtures";

/**
 * File System Access API によるフォルダへの直接保存（Issue #106）。
 * showDirectoryPicker はネイティブダイアログを開くため Playwright から操作できない。
 * 代わりに OPFS（navigator.storage.getDirectory）のルートを返すよう差し替える。
 * OPFS のハンドルは実 FileSystemDirectoryHandle で createWritable まで完全動作するため、
 * 書き込み経路（既存名列挙 → 計画 → 書き込み）は本物のまま検証できる。
 * Playwright は テストごとに新規ブラウザコンテキストを作るため OPFS は毎回空で始まる。
 */

/** showDirectoryPicker を OPFS ルートへ差し替える init script */
const useOpfsDirectoryPicker = () => {
  (
    window as unknown as { showDirectoryPicker: () => Promise<unknown> }
  ).showDirectoryPicker = () => navigator.storage.getDirectory();
};

/** OPFS ルート直下のファイル名一覧を取得する */
const listOpfsFiles = async (): Promise<string[]> => {
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const name of (
    root as unknown as { keys: () => AsyncIterableIterator<string> }
  ).keys()) {
    names.push(name);
  }
  return names.sort();
};

/** OPFS ルート直下のファイルをバイト配列として読み出す */
const readOpfsFile = async (name: string): Promise<number[]> => {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(name);
  const file = await handle.getFile();
  return Array.from(new Uint8Array(await file.arrayBuffer()));
};

test.describe("フォルダへ保存（File System Access API）", () => {
  test("変換結果を選択フォルダへ直接書き込める（複数ファイル・バイナリ検証）", async ({
    page,
  }) => {
    await page.addInitScript(useOpfsDirectoryPicker);
    await page.goto("/convert/");
    await page
      .locator('input[type="file"]')
      .setInputFiles([pngFile("a.png"), pngFile("b.png")]);

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 20_000,
    });

    await page
      .getByRole("button", { name: "フォルダへ保存", exact: true })
      .click();
    await expect(
      page.getByText("2件のファイルをフォルダへ保存しました"),
    ).toBeVisible({ timeout: 15_000 });

    // OPFS（= 差し替えた出力先フォルダ）に全件が書き込まれている
    const names = await page.evaluate(listOpfsFiles);
    expect(names).toEqual(["a.jpeg", "b.jpeg"]);

    // 中身が有効な JPEG であること（欠落・取り違えがない）
    for (const name of names) {
      const buf = Buffer.from(await page.evaluate(readOpfsFile, name));
      expect(magicNumber.isJpeg(buf)).toBe(true);
    }
  });

  test("出力先フォルダの同名ファイルは上書きせず連番で保存される", async ({
    page,
  }) => {
    await page.addInitScript(useOpfsDirectoryPicker);
    await page.goto("/convert/");

    // 出力先フォルダに既存ファイル a.jpeg を用意する（上書きされないことを検証）
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getFileHandle("a.jpeg", { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Blob(["existing"]));
      await writable.close();
    });

    await page.locator('input[type="file"]').setInputFiles(pngFile("a.png"));
    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: "フォルダへ保存", exact: true })
      .click();
    await expect(
      page.getByText("1件のファイルをフォルダへ保存しました"),
    ).toBeVisible({ timeout: 15_000 });

    // 既存の a.jpeg は温存され、新規分は a_2.jpeg へ連番保存される
    const names = await page.evaluate(listOpfsFiles);
    expect(names).toEqual(["a.jpeg", "a_2.jpeg"]);

    const existing = Buffer.from(await page.evaluate(readOpfsFile, "a.jpeg"));
    expect(existing.toString()).toBe("existing");
    const written = Buffer.from(await page.evaluate(readOpfsFile, "a_2.jpeg"));
    expect(magicNumber.isJpeg(written)).toBe(true);
  });

  test("showDirectoryPicker 非対応環境ではボタンが表示されない", async ({
    page,
  }) => {
    // Firefox / Safari 相当（API 未実装）をエミュレートする
    await page.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown })
        .showDirectoryPicker;
    });
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    await page.getByRole("button", { name: "変換", exact: true }).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // ZIP ダウンロードは従来どおり表示され、フォルダ保存ボタンは出ない
    await expect(
      page.getByRole("button", { name: "Zipでダウンロード", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "フォルダへ保存", exact: true }),
    ).not.toBeVisible();
  });
});
