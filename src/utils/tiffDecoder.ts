/**
 * TIFF デコード処理
 *
 * ブラウザの Image 要素は TIFF をデコードできないため、
 * utif2（純 JS の TIFF デコーダー）でデコードして Canvas に展開する。
 * デコーダーは動的 import により TIFF ファイルの変換時のみロードされる。
 */

import { ERROR_MESSAGES } from "./constants";
import type { DecodedImage } from "./decodedImage";

/**
 * TIFF ファイルをデコードして RGBA の生ピクセル（`ImageData` 化できる形）に展開する。
 *
 * Canvas / DOM 非依存なので Web Worker（OffscreenCanvas 経路）からも利用できる。
 *
 * 既知の制限:
 * - マルチページ TIFF は先頭ページ（最初の IFD）のみを対象とする
 * - Orientation タグ（tag 274）は適用されない（utif2 が解釈しないため、
 *   Orientation ≠ 1 の TIFF は回転・反転が反映されないまま変換される）
 *
 * @param buffer - TIFF ファイルの中身
 */
export const decodeTiffToImageData = async (
  buffer: ArrayBuffer,
): Promise<DecodedImage> => {
  const UTIF = await import("utif2");

  const ifds = UTIF.decode(buffer);
  if (ifds.length === 0) {
    throw new Error(ERROR_MESSAGES.IMAGE_LOAD_ERROR);
  }

  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);

  // toRGBA8 は Uint8Array を返すため ImageData 用に Uint8ClampedArray へ変換する
  return {
    data: new Uint8ClampedArray(rgba),
    width: ifd.width,
    height: ifd.height,
  };
};

/**
 * TIFF ファイルをデコードして Canvas に展開する（メインスレッド用）
 */
export const decodeTiffToCanvas = async (
  file: File,
): Promise<HTMLCanvasElement> => {
  const buffer = await file.arrayBuffer();
  const { data, width, height } = await decodeTiffToImageData(buffer);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(ERROR_MESSAGES.CANVAS_CONTEXT_ERROR);
  }

  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
};
