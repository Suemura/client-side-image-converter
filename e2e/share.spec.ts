import { expect, test } from "@playwright/test";
import { pngFile } from "./helpers/fixtures";
import { isServiceWorkerAvailable, waitForServiceWorker } from "./helpers/sw";

// Web Share Target（共有シートからの画像受け取り、Issue #105）の実ブラウザ検証。
//
// OS の共有シート → share_target 発火そのものは Playwright では再現できない
// （インストール済み PWA + OS 統合が必要。実機 Android Chrome での手動確認手順は PR に記載）。
// そのため SW 制御下のページから share_target アクションへ fetch で multipart POST を発行し、
// SW intercept 以降のパイプライン全体（Cache Storage 保管 → /share 受信 → ツールへ送出 →
// 到着 → リロードでペイロードが残らないこと）を検証する。
//
// sw.js は本番ビルドの postbuild でのみ生成されるため、dev サーバー再利用時は skip する
// （pwa.spec.ts と同じガード）。

/** SW 制御下のページから share_target へ multipart POST を送る（共有シートの代替） */
async function postSharedImage(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  const base64 = pngFile(name).buffer.toString("base64");
  await page.evaluate(
    async ({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new FormData();
      data.append("images", new File([bytes], name, { type: "image/png" }));
      await fetch("/share-target", { method: "POST", body: data });
    },
    { name, base64 },
  );
}

test.describe("Web Share Target", () => {
  test("共有ペイロードを /share で受け取り、ツールへ送出できる", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(
      !(await isServiceWorkerAvailable(page)),
      "sw.js は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    await waitForServiceWorker(page);

    await postSharedImage(page, "shared.png");

    // HandoffSend は mount 時に送り先ルートを prefetch する。prefetch 未完了のまま
    // push すると高負荷時に MPA フォールバック（フルリロード）で in-memory ペイロードが
    // 失われるため、/convert の RSC ペイロード取得完了を待ってからクリックする
    const convertPrefetched = page.waitForResponse(
      (res) => res.url().includes("/convert/__next"),
      { timeout: 15_000 },
    );
    await page.goto("/share/");

    // 受信 UI（件数とファイル名）
    await expect(page.getByText("1 件の画像を受け取りました")).toBeVisible();
    await expect(page.getByText("shared.png")).toBeVisible();
    await convertPrefetched;

    // 変換ツールへ送出 → 共有シート起点の到着バナーとファイル取り込みを確認
    await page.getByRole("button", { name: "変換へ送る" }).click();
    await expect(page).toHaveURL(/\/convert\/?$/);
    await expect(
      page.getByText("共有シートから 1 件を引き継ぎました"),
    ).toBeVisible();
    await expect(page.getByText("shared.png")).toBeVisible();
  });

  test("ペイロードは読み取りと同時に削除され、リロード後に残らない（プライバシー保証）", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(
      !(await isServiceWorkerAvailable(page)),
      "sw.js は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    await waitForServiceWorker(page);

    await postSharedImage(page, "shared.png");
    await page.goto("/share/");
    await expect(page.getByText("1 件の画像を受け取りました")).toBeVisible();

    // リロード後は空状態（ペイロードは読み取り時に削除済み）
    await page.reload();
    await expect(page.getByText("共有された画像はありません")).toBeVisible();
  });

  test("ペイロードなしで /share を直接開くと空状態を表示する", async ({
    page,
  }) => {
    await page.goto("/share/");
    await expect(page.getByText("共有された画像はありません")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "ホームへ戻る" }),
    ).toBeVisible();
  });
});
