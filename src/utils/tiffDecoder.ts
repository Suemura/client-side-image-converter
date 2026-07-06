/**
 * TIFF デコード処理
 *
 * ブラウザの Image 要素は TIFF をデコードできないため、
 * utif2（純 JS の TIFF デコーダー）でデコードして Canvas に展開する。
 * デコーダーは動的 import により TIFF ファイルの変換時のみロードされる。
 */

import { ERROR_MESSAGES } from "./constants";

/**
 * TIFF ファイルをデコードして Canvas に展開する
 *
 * 既知の制限:
 * - マルチページ TIFF は先頭ページ（最初の IFD）のみを対象とする
 * - Orientation タグ（tag 274）は適用されない（utif2 が解釈しないため、
 *   Orientation ≠ 1 の TIFF は回転・反転が反映されないまま変換される）
 */
export const decodeTiffToCanvas = async (
  file: File,
): Promise<HTMLCanvasElement> => {
  const buffer = await file.arrayBuffer();
  const UTIF = await import("utif2");

  const ifds = UTIF.decode(buffer);
  if (ifds.length === 0) {
    throw new Error(ERROR_MESSAGES.IMAGE_LOAD_ERROR);
  }

  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);

  const canvas = document.createElement("canvas");
  canvas.width = ifd.width;
  canvas.height = ifd.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(ERROR_MESSAGES.CANVAS_CONTEXT_ERROR);
  }

  // toRGBA8 は Uint8Array を返すため ImageData 用に Uint8ClampedArray へ変換する
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height),
    0,
    0,
  );
  return canvas;
};
