import { expect, test } from "@playwright/test";
import { pngFile } from "./helpers/fixtures";

// 実際のクリップボード / OS フォルダのドラッグは Playwright で再現できないため、
// paste イベントと drop イベントを合成し、アプリの取込フロー（MIME フィルタ・
// 重複除外・フォルダ再帰走査）が動くことを検証する。
// フォルダ再帰走査ロジック自体の網羅は directoryReader の単体テストが担う。

const pngBase64 = pngFile().buffer.toString("base64");

test.describe("クリップボード貼り付け・フォルダドロップ", () => {
  test("Ctrl/Cmd+V の貼り付けで画像が取り込まれる", async ({ page }) => {
    await page.goto("/convert/");

    // window の paste リスナーは useEffect でマウント後に張られるため、
    // ハイドレーション完了前に発火すると取りこぼす。addUniqueFiles による
    // 重複除外で再発火は冪等なので、取り込まれるまで toPass でリトライする
    await expect(async () => {
      await page.evaluate(
        ({ base64, name }) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const file = new File([bytes], name, { type: "image/png" });
          const event = new Event("paste", { bubbles: true, cancelable: true });
          Object.defineProperty(event, "clipboardData", {
            value: { files: [file], items: [] },
          });
          window.dispatchEvent(event);
        },
        { base64: pngBase64, name: "pasted-image.png" },
      );
      await expect(page.getByText("pasted-image.png")).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });
  });

  test("フォルダドロップで配下の画像のみ再帰的に取り込まれる", async ({
    page,
  }) => {
    await page.goto("/convert/");

    // 空状態のドロップゾーン（button）に、webkitGetAsEntry() でディレクトリを
    // 返す疑似 dataTransfer を載せた drop イベントを発火する
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const makeFileEntry = (name: string, type: string) => ({
        isFile: true,
        isDirectory: false,
        file: (cb: (f: File) => void) => cb(new File([bytes], name, { type })),
      });
      const makeDirEntry = (children: unknown[]) => {
        let read = false;
        return {
          isFile: false,
          isDirectory: true,
          createReader: () => ({
            readEntries: (cb: (entries: unknown[]) => void) => {
              if (read) {
                cb([]);
                return;
              }
              read = true;
              cb(children);
            },
          }),
        };
      };
      // フォルダ内: 画像 1 枚 + 非画像 1 件 + サブフォルダ内の画像 1 枚
      const dirEntry = makeDirEntry([
        makeFileEntry("in-folder.png", "image/png"),
        makeFileEntry("notes.txt", "text/plain"),
        makeDirEntry([makeFileEntry("nested.png", "image/png")]),
      ]);
      const dataTransfer = {
        items: [{ kind: "file", webkitGetAsEntry: () => dirEntry }],
        files: [],
      };

      const dropZone = document.querySelector(
        '[aria-label="ファイルをドラッグ&ドロップまたはクリックして選択"]',
      );
      if (!dropZone) {
        throw new Error("ドロップゾーンが見つかりません");
      }
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      dropZone.dispatchEvent(event);
    }, pngBase64);

    // 画像はサブフォルダ含めて取り込まれる
    await expect(page.getByText("in-folder.png")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("nested.png")).toBeVisible();
    // 非画像は MIME フィルタで除外される
    await expect(page.getByText("notes.txt")).toHaveCount(0);
  });

  test("上限を超える件数のドロップで警告が表示され、リストクリアで消える", async ({
    page,
  }) => {
    await page.goto("/convert/");

    // MAX_INPUT_FILES(200) を超える 201 枚の画像を含むフォルダをドロップする。
    // 純粋関数（addUniqueFilesWithLimit / collectFilesFromEntries の maxFiles）は
    // 単体テスト済みなので、ここでは「上限超過 → 警告表示 → クリアで消える」という
    // ユーザー向けの配線を検証する。
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const children = Array.from({ length: 201 }, (_, i) => ({
        isFile: true,
        isDirectory: false,
        file: (cb: (f: File) => void) =>
          cb(new File([bytes], `img-${i}.png`, { type: "image/png" })),
      }));
      let read = false;
      const dirEntry = {
        isFile: false,
        isDirectory: true,
        createReader: () => ({
          readEntries: (cb: (entries: unknown[]) => void) => {
            if (read) {
              cb([]);
              return;
            }
            read = true;
            cb(children);
          },
        }),
      };
      const dataTransfer = {
        items: [{ kind: "file", webkitGetAsEntry: () => dirEntry }],
        files: [],
      };

      const dropZone = document.querySelector(
        '[aria-label="ファイルをドラッグ&ドロップまたはクリックして選択"]',
      );
      if (!dropZone) {
        throw new Error("ドロップゾーンが見つかりません");
      }
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      dropZone.dispatchEvent(event);
    }, pngBase64);

    // 上限超過の非ブロッキング警告（role="alert"）が表示される
    // （Next.js のルートアナウンサーも role="alert" なので上限件数のテキストで絞り込む）
    const limitWarning = page.getByRole("alert").filter({ hasText: "200" });
    await expect(limitWarning).toBeVisible({ timeout: 15_000 });

    // リストをクリアすると警告も消える
    await page.getByRole("button", { name: "リストをクリア" }).click();
    await expect(limitWarning).toHaveCount(0);
  });
});
