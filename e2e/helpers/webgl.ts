import type { Page } from "@playwright/test";

/**
 * ページの WebGL / WebGL2 コンテキスト取得を無効化し、
 * Canvas2D の CPU フォールバックパスを強制する。
 * `page.goto()` の前に呼ぶこと（addInitScript は以降のナビゲーションに適用される）。
 */
export const disableWebGL = async (page: Page): Promise<void> => {
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
};
