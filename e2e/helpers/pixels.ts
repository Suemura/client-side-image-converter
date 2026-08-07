import type { Page } from "@playwright/test";

/**
 * ダウンロードした画像バイナリをブラウザ内でデコードし、相対座標 (fx, fy) のピクセル RGB を読む。
 * JPEG 等へエンコードされた出力の色検証（透過部の背景合成など）に使う。
 */
/**
 * readPixelFromBuffer の RGBA 版。アルファ値の検証（透過 PNG / WebP の
 * 背景除去結果など）に使う。
 */
export const readPixelRgbaFromBuffer = (
  page: Page,
  buf: Buffer,
  mime: string,
  fx: number,
  fy: number,
): Promise<[number, number, number, number]> =>
  page.evaluate(
    async ({ arr, mime, fx, fy }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(arr)], { type: mime }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context を取得できませんでした");
      }
      ctx.drawImage(bitmap, 0, 0);
      const x = Math.min(bitmap.width - 1, Math.floor(bitmap.width * fx));
      const y = Math.min(bitmap.height - 1, Math.floor(bitmap.height * fy));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]] as [number, number, number, number];
    },
    { arr: Array.from(buf), mime, fx, fy },
  );

export const readPixelFromBuffer = (
  page: Page,
  buf: Buffer,
  mime: string,
  fx: number,
  fy: number,
): Promise<[number, number, number]> =>
  page.evaluate(
    async ({ arr, mime, fx, fy }) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(arr)], { type: mime }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas 2D context を取得できませんでした");
      }
      ctx.drawImage(bitmap, 0, 0);
      const x = Math.min(bitmap.width - 1, Math.floor(bitmap.width * fx));
      const y = Math.min(bitmap.height - 1, Math.floor(bitmap.height * fy));
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    { arr: Array.from(buf), mime, fx, fy },
  );
