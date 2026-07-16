import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { parseCspForPath } from "../src/utils/securityHeaders";
import {
  heicFile,
  jpegFileWithExif,
  magicNumber,
  pngFile,
  rectPngFile,
} from "./helpers/fixtures";

// セキュリティヘッダー（CSP）の実ブラウザ検証。
// E2E の webServer（serve out）は out/_headers を解釈しないため、postbuild が生成した
// 実 CSP を page.route でドキュメントレスポンスへ注入し、Cloudflare Pages 配信時と
// 同じポリシーが強制された状態で全ページの表示・変換が壊れないことを確認する。
//
// 注: out/_headers の CSP は本番ビルドの postbuild でのみ生成されるため、
// dev サーバー再利用時（reuseExistingServer）には skip する（pwa.spec.ts と同方針）。

const ROUTES = ["/", "/convert/", "/crop/", "/edit/", "/metadata/"] as const;

const headersPath = path.resolve(__dirname, "../out/_headers");

// Service Worker が HTML をキャッシュから配信すると page.route を通らず CSP を
// 注入できないため、このスペックでは SW を無効化して全ナビゲーションを route に通す
test.use({ serviceWorkers: "block" });

// out/_headers が生成済みか（＝本番ビルドに対して実行されているか）を確認する。
// dev サーバー再利用時は out/ が古い可能性があるため sw.js の配信有無も併せて確認する
async function isGeneratedHeadersAvailable(page: Page): Promise<boolean> {
  if (!existsSync(headersPath)) return false;
  const res = await page.request.get("/sw.js");
  return res.ok();
}

// postbuild が生成した CSP をドキュメントレスポンスへ注入する。
// 対応するルールが見つからないページはヘッダーなしで素通しになるため、
// テスト側で parseCspForPath の結果を別途 assert して取りこぼしを防ぐ
async function injectCsp(page: Page, headersContent: string): Promise<void> {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") {
      return route.continue();
    }
    const { pathname } = new URL(route.request().url());
    const csp = parseCspForPath(headersContent, pathname);
    if (!csp) return route.continue();
    const response = await route.fetch();
    const headers = { ...response.headers() };
    // route.fetch() の本文はデコード済みのため、圧縮系ヘッダーは落として整合させる
    delete headers["content-encoding"];
    delete headers["content-length"];
    headers["content-security-policy"] = csp;
    await route.fulfill({ response, headers });
  });
}

// CSP 違反イベントを収集する（enforce モードなので違反したリソースはブロックされるが、
// 何がどこでブロックされたかを失敗メッセージで特定できるようにする）
async function collectCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      w.__cspViolations.push(
        `${event.violatedDirective}: ${event.blockedURI || "inline"} at ${event.sourceFile}:${event.lineNumber} (${event.documentURI})`,
      );
    });
  });
}

async function getCspViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
}

/** プレビュー canvas の相対座標 (fx, fy) の RGB を読む（edit.spec.ts と同じ手法） */
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

test.describe("セキュリティヘッダー", () => {
  test("生成された CSP が全ページ分あり、script-src がハッシュベースになっている", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers の CSP は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");

    for (const route of ROUTES) {
      const csp = parseCspForPath(content, route);
      expect(csp, `${route} の CSP ルールが生成されている`).toBeDefined();
      const scriptSrc = csp
        ?.split("; ")
        .find((directive) => directive.startsWith("script-src "));
      expect(scriptSrc).toContain("'wasm-unsafe-eval'");
      expect(scriptSrc).toContain("'sha256-");
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    }
  });

  test("全ページが CSP 強制下で表示・ハイドレートされ、テーマ初期化も動作する", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers の CSP は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");
    await collectCspViolations(page);
    await injectCsp(page, content);

    for (const route of ROUTES) {
      await page.goto(route);

      // nav リンクの表示 = 外部スクリプトが実行され hydrate された証拠
      const nav = page.getByRole("navigation");
      await expect(nav.getByRole("link", { name: "変換" })).toBeVisible();

      // data-theme 属性 = インラインのテーマ初期化スクリプトがハッシュ許可で実行された証拠
      const theme = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      );
      expect(["light", "dark"]).toContain(theme);

      expect(await getCspViolations(page)).toEqual([]);
    }
  });

  test("CSP 強制下で WebP 変換（WASM / Worker / blob プレビュー）が動作する", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers の CSP は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");
    await collectCspViolations(page);
    await injectCsp(page, content);

    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(pngFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("WebP", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();

    // WASM の初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 30_000,
    });

    expect(await getCspViolations(page)).toEqual([]);
  });

  test("CSP 強制下で HEIC → AVIF 変換（libheif デコード + AVIF エンコード WASM）が動作する", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers の CSP は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");
    await collectCspViolations(page);
    await injectCsp(page, content);

    // Emscripten 系 WASM ビルドはバージョンによって data: fetch や eval 系フォールバックを
    // 使うことがあり CSP 違反で本番のみ壊れ得るため、libheif デコード（HEIC 入力）と
    // @jsquash の AVIF エンコードを 1 変換で通して検証する
    await page.goto("/convert/");
    await page.locator('input[type="file"]').setInputFiles(heicFile());

    // ラジオの input は不可視のためラベルテキストをクリックする
    await page.getByText("AVIF", { exact: true }).click();
    await page.getByRole("button", { name: "変換", exact: true }).click();

    // デコーダー / エンコーダー両方の WASM 初回ロードがあるためタイムアウトを長めにとる
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 45_000,
    });

    expect(await getCspViolations(page)).toEqual([]);
  });

  test("CSP 強制下で /edit のプリセット LUT（fetch + WebGL プレビュー）が適用される", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers の CSP は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");
    await collectCspViolations(page);
    await injectCsp(page, content);

    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("csp-gray.png", 16, 16, [128, 128, 128]));

    // プレビューが生成されるまで待つ（初期は元のグレー ~128）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    // プリセット「暖色」を選択（connect-src 'self' の対象となる /luts/warm.cube の
    // fetch と WebGL プレビューの再描画が CSP 下で動作する証拠として色の変化を確認）
    await page.getByRole("button", { name: "暖色", exact: true }).click();
    await expect
      .poll(
        async () => {
          const [r, , b] = await readPreviewPixel(page, 0.5, 0.5);
          return r - b;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(8);

    expect(await getCspViolations(page)).toEqual([]);
  });

  test("CSP 強制下で /metadata の EXIF 表示・クリーニングが動作する", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers の CSP は本番ビルドの postbuild でのみ生成される（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");
    await collectCspViolations(page);
    await injectCsp(page, content);

    await page.goto("/metadata/");
    await page.locator('input[type="file"]').setInputFiles(jpegFileWithExif());

    // EXIF 解析（バイナリ読み取り）が CSP 下で完了する
    await expect(
      page.getByRole("heading", { name: /すべてのEXIFタグ/ }),
    ).toBeVisible({ timeout: 15_000 });

    // リスクタグ削除 → クリーニング済み画像のダウンロード（blob URL）まで通す
    await page.getByRole("button", { name: "リスクタグを選択" }).click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "クリーニング済み画像をダウンロード" })
        .click(),
    ]);
    expect(magicNumber.isJpeg(readFileSync(await download.path()))).toBe(true);

    expect(await getCspViolations(page)).toEqual([]);
  });

  test("グローバルなセキュリティヘッダーが _headers に定義されている", async ({
    page,
  }) => {
    test.skip(
      !(await isGeneratedHeadersAvailable(page)),
      "out/_headers は本番ビルドでのみ out/ へコピーされる（dev サーバー再利用時は skip）",
    );
    const content = readFileSync(headersPath, "utf8");

    // /* ブロックの静的ヘッダー（public/_headers 由来）
    const globalRule = content.split(/^\/\*$/m)[1] ?? "";
    const globalBlock = globalRule.split(/^(?=\S)/m)[0];
    expect(globalBlock).toContain("X-Frame-Options: DENY");
    expect(globalBlock).toContain("X-Content-Type-Options: nosniff");
    expect(globalBlock).toContain(
      "Referrer-Policy: strict-origin-when-cross-origin",
    );
    expect(globalBlock).toContain("Permissions-Policy: camera=()");
    expect(globalBlock).toContain(
      "Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
    );
  });
});
