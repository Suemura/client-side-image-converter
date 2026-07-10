import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import {
  cubeLutFile,
  invalidCubeFile,
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

    // 2 枚目を追加（FileUploadArea は既存に追記する）。ファイル選択後は LUT アップロード用の
    // file input も存在するため、先頭（画像アップロード用）を明示的に選ぶ
    await page
      .locator('input[type="file"]')
      .first()
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

  // --- 自動補正（Issue #68 第 3 項目） ---

  test("オートレベルで低コントラスト画像のレンジが拡張される（再押下で不変・冪等）", async ({
    page,
  }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        twoToneVerticalPngFile(
          "lowcontrast.png",
          16,
          16,
          [192, 192, 192],
          [64, 64, 64],
        ),
      );

    // プレビュー生成を待つ（上半分は元の明るいグレー ~192）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.25))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(150);

    await page
      .getByRole("button", { name: "オートレベル", exact: true })
      .click();

    // 黒点 64 / 白点 192 が推定され、明部はほぼ白・暗部はほぼ黒へストレッチされる
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.25))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(240);
    expect((await readPreviewPixel(page, 0.5, 0.75))[0]).toBeLessThan(15);

    // 結果はスライダー値として可視化され、手動微調整の出発点になる
    const blacks = await page
      .getByLabel("黒レベル", { exact: true })
      .inputValue();
    const whites = await page
      .getByLabel("白レベル", { exact: true })
      .inputValue();
    expect(Number(blacks)).toBeLessThan(0);
    expect(Number(whites)).toBeGreaterThan(0);

    // 冪等: 編集前統計基準のため再押下しても値が変わらない
    await page
      .getByRole("button", { name: "オートレベル", exact: true })
      .click();
    await expect(page.getByLabel("黒レベル", { exact: true })).toHaveValue(
      blacks,
    );
    await expect(page.getByLabel("白レベル", { exact: true })).toHaveValue(
      whites,
    );
  });

  test("自動ホワイトバランスで色かぶりのチャンネル平均が等化される", async ({
    page,
  }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("bluecast.png", 16, 16, [100, 128, 156]));

    // プレビュー生成を待つ（青かぶり: B が R より十分大きい）
    await expect
      .poll(
        async () => {
          const [r, , b] = await readPreviewPixel(page, 0.5, 0.5);
          return b - r;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(40);

    await page
      .getByRole("button", { name: "自動ホワイトバランス", exact: true })
      .click();

    // gray-world: R ≈ B、G ≈ (R+B)/2 へ等化される（UI 丸め分の誤差を許容）
    await expect
      .poll(
        async () => {
          const [r, , b] = await readPreviewPixel(page, 0.5, 0.5);
          return Math.abs(r - b);
        },
        { timeout: 10_000 },
      )
      .toBeLessThan(6);
    const [r, g, b] = await readPreviewPixel(page, 0.5, 0.5);
    expect(Math.abs(g - (r + b) / 2)).toBeLessThan(6);

    // 青かぶりの補正なので色温度は暖色方向（正）になる
    expect(
      Number(await page.getByLabel("色温度", { exact: true }).inputValue()),
    ).toBeGreaterThan(0);
  });

  test("WebGL2 非対応時も自動補正が Canvas2D フォールバックで機能する", async ({
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
      .setInputFiles(
        twoToneVerticalPngFile(
          "cpu-auto.png",
          16,
          16,
          [192, 192, 192],
          [64, 64, 64],
        ),
      );

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.25))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(150);

    await page
      .getByRole("button", { name: "オートレベル", exact: true })
      .click();

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.25))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(240);
    expect((await readPreviewPixel(page, 0.5, 0.75))[0]).toBeLessThan(15);
  });

  // --- LUT フィルタ（Issue #67） ---

  /** LUT のアップロード input（accept に cube を含むもの）を特定する */
  const lutFileInput = (page: Page) => page.locator('input[accept*="cube"]');

  test("カスタム LUT（R↔B 入替）でプレビューと出力の R/B が入れ替わる", async ({
    page,
  }) => {
    await page.goto("/edit/");
    // 赤みの強い画像（R=200, B=30）
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("rb.png", 16, 16, [200, 30, 30]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(150);

    // R↔B を入れ替える .cube を読み込む（アップロード時に自動選択される）
    await lutFileInput(page).setInputFiles(cubeLutFile("swap.cube"));

    // プレビューで R と B が入れ替わる（R が下がり B が上がる）
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeLessThan(70);
    expect((await readPreviewPixel(page, 0.5, 0.5))[2]).toBeGreaterThan(180);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 出力も同様に入れ替わっている（WYSIWYG）
    const result = page.locator('img[alt="rb_edited.png"]');
    await expect(result).toBeVisible();
    const [r, , b] = await readImagePixel(result, 0.5, 0.5);
    expect(r).toBeLessThan(70);
    expect(b).toBeGreaterThan(180);
  });

  test("適用強度 0 で LUT が無効化され元色に戻る", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("rb2.png", 16, 16, [200, 30, 30]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(150);

    await lutFileInput(page).setInputFiles(cubeLutFile("swap.cube"));

    // フル適用で入れ替わる
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeLessThan(70);

    // 強度を 0 にすると元色（R=200）へ戻る
    await setSlider(page, "適用強度", 0);
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(150);
    expect((await readPreviewPixel(page, 0.5, 0.5))[2]).toBeLessThan(70);
  });

  test("プリセット LUT（暖色）を選択するとプレビューが暖色に寄る", async ({
    page,
  }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("gray2.png", 16, 16, [128, 128, 128]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    // プリセット「暖色」を選択（public/luts/warm.cube を fetch して適用）
    await page.getByRole("button", { name: "暖色", exact: true }).click();

    // 暖色は R > B（元のグレーは R==B）
    await expect
      .poll(
        async () => {
          const [r, , b] = await readPreviewPixel(page, 0.5, 0.5);
          return r - b;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(8);
  });

  test("不正な LUT ファイルでエラー通知を表示する", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("x.png", 16, 16, [128, 128, 128]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    await lutFileInput(page).setInputFiles(invalidCubeFile("bad.cube"));

    // LutPicker のエラー通知（Next の route announcer とは別に、テキストで特定する）
    await expect(
      page.getByText("LUT ファイルを読み込めませんでした", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // --- ヒストグラム（Issue #68） ---

  /**
   * ヒストグラム SVG パス（`buildHistogramPath` の固定形式 `M0 100 L{x} {y} ... Z`）から
   * 非ゼロビン（y が下辺 100 より上の点）の x 座標一覧を得る
   */
  const histogramSpikeXs = async (
    page: Page,
    testId: string,
  ): Promise<number[]> => {
    const d = await page.getByTestId(testId).getAttribute("d");
    if (!d) {
      return [];
    }
    const xs: number[] = [];
    for (const match of d.matchAll(/L([\d.]+) ([\d.]+)/g)) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      if (y < 99.5) {
        xs.push(x);
      }
    }
    return xs;
  };

  test("ヒストグラムが表示され、輝度分布が調整に追従する", async ({ page }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("hist.png", 16, 16, [128, 128, 128]));

    // プレビュー描画後にヒストグラムパネルが現れる（既定は RGB モードで 3 パス）
    await expect(page.getByTestId("histogram-panel")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("histogram-path-r")).toBeVisible();
    await expect(page.getByTestId("histogram-path-g")).toBeVisible();
    await expect(page.getByTestId("histogram-path-b")).toBeVisible();

    // 輝度モードへ切替（1 パスのみ）。均一グレー 128 のスパイクは中央付近（x ≈ 128.5）
    await page.getByTestId("histogram-mode-luminance").click();
    await expect(page.getByTestId("histogram-path-r")).toHaveCount(0);
    await expect
      .poll(() => histogramSpikeXs(page, "histogram-path-luminance"), {
        timeout: 10_000,
      })
      .not.toHaveLength(0);
    const centered = await histogramSpikeXs(page, "histogram-path-luminance");
    expect(centered.length).toBeLessThan(10);
    for (const x of centered) {
      expect(x).toBeGreaterThan(112);
      expect(x).toBeLessThan(145);
    }

    // 露光量 +100（×2）でグレー 128 は白飛び（255）し、スパイクが右端へ移動する
    await setSlider(page, "露光量", 100);
    await expect
      .poll(
        async () =>
          Math.max(
            0,
            ...(await histogramSpikeXs(page, "histogram-path-luminance")),
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(240);
  });

  test("WebGL2 非対応時もヒストグラムが表示される", async ({ page }) => {
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
      .setInputFiles(rectPngFile("hist-cpu.png", 16, 16, [128, 128, 128]));

    await expect(page.getByTestId("histogram-panel")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("histogram-mode-luminance").click();
    // CPU パス（Canvas2D）でも同じ経路（転写済み 2D キャンバス）から算出される
    await expect
      .poll(() => histogramSpikeXs(page, "histogram-path-luminance"), {
        timeout: 10_000,
      })
      .not.toHaveLength(0);
    const xs = await histogramSpikeXs(page, "histogram-path-luminance");
    for (const x of xs) {
      expect(x).toBeGreaterThan(112);
      expect(x).toBeLessThan(145);
    }
  });

  test("WebGL2 非対応時も LUT が CPU パスで適用される", async ({ page }) => {
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
      .setInputFiles(rectPngFile("cpu-lut.png", 16, 16, [200, 30, 30]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(150);

    await lutFileInput(page).setInputFiles(cubeLutFile("swap.cube"));

    // CPU パス（applyLutToPixel）でも R↔B が入れ替わる
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeLessThan(70);
    expect((await readPreviewPixel(page, 0.5, 0.5))[2]).toBeGreaterThan(180);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    const result = page.locator('img[alt="cpu-lut_edited.png"]');
    await expect(result).toBeVisible();
    const [r, , b] = await readImagePixel(result, 0.5, 0.5);
    expect(r).toBeLessThan(70);
    expect(b).toBeGreaterThan(180);
  });

  // --- トーンカーブ（Issue #68） ---

  /**
   * カーブステージの相対座標 (fx, fy) をクリックして制御点を追加する
   * （fx: 入力 0..1 / fy: SVG の上からの割合。fy=0.25 は出力 0.75 に相当）
   */
  const clickCurveStage = async (page: Page, fx: number, fy: number) => {
    const stage = page.getByTestId("tone-curve-stage");
    const box = await stage.boundingBox();
    if (!box) {
      throw new Error("tone-curve-stage is not visible");
    }
    await stage.click({ position: { x: box.width * fx, y: box.height * fy } });
  };

  test("トーンカーブでプレビューと出力が明るくなり、リセットで戻る（WYSIWYG）", async ({
    page,
  }) => {
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("curve.png", 16, 16, [128, 128, 128]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    // 中央を持ち上げる制御点 (0.5, 0.75) を追加 → グレー 128 が約 191 へ
    await clickCurveStage(page, 0.5, 0.25);
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(170);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });

    // 出力もプレビューと同じく明るい（WYSIWYG）
    const result = page.locator('img[alt="curve_edited.png"]');
    await expect(result).toBeVisible();
    expect((await readImagePixel(result, 0.5, 0.5))[0]).toBeGreaterThan(170);

    // チャンネルリセットで恒等へ戻る
    await page.getByTestId("tone-curve-reset").click();
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeLessThan(150);
  });

  test("輝度チャンネルのカーブが色味を保ったまま明るくする", async ({
    page,
  }) => {
    await page.goto("/edit/");
    // 色味のある画像（R > G > B）で輝度カーブのチャンネル間差の維持を見る
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("curve-luma.png", 16, 16, [150, 120, 90]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(120);

    // 輝度チャンネルへ切り替えて中央を持ち上げる
    await page.getByTestId("tone-curve-mode-luminance").click();
    await clickCurveStage(page, 0.5, 0.25);

    // 全チャンネルが明るくなり（加算シフト）、R > G > B の色味の序列は保たれる
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(180);
    const [r, g, b] = await readPreviewPixel(page, 0.5, 0.5);
    expect(g).toBeGreaterThan(150);
    expect(b).toBeGreaterThan(120);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  test("下部の調整領域までスクロールしてもプレビューが追従して見える（スティッキー）", async ({
    page,
  }) => {
    // 3 カラムレイアウト（>1200px）かつ縦に短いビューポートで検証する
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/edit/");
    await page
      .locator('input[type="file"]')
      .setInputFiles(rectPngFile("sticky.png", 16, 16, [128, 128, 128]));
    await expect(page.getByTestId("tone-curve-stage")).toBeVisible();

    // 右カラム下部（LUT ピッカーの終端）までスクロールする
    await page.mouse.wheel(0, 6000);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(300);

    // プレビュー canvas がビューポート内に見えている（boundingBox はビューポート座標）
    const box = await page.getByTestId("edit-preview-canvas").boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.y + box.height).toBeGreaterThan(0);
    expect(box.y).toBeLessThan(600);
  });

  test("WebGL2 非対応時もトーンカーブが CPU パスで適用される", async ({
    page,
  }) => {
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
      .setInputFiles(rectPngFile("curve-cpu.png", 16, 16, [128, 128, 128]));

    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 15_000,
      })
      .toBeGreaterThan(100);

    await clickCurveStage(page, 0.5, 0.25);

    // CPU パス（applyToneCurveToPixel）でも同様に明るくなる
    await expect
      .poll(async () => (await readPreviewPixel(page, 0.5, 0.5))[0], {
        timeout: 10_000,
      })
      .toBeGreaterThan(170);

    await applyButton(page).click();
    await expect(page.getByRole("heading", { name: /変換結果/ })).toBeVisible({
      timeout: 15_000,
    });
    const result = page.locator('img[alt="curve-cpu_edited.png"]');
    await expect(result).toBeVisible();
    expect((await readImagePixel(result, 0.5, 0.5))[0]).toBeGreaterThan(170);
  });
});
