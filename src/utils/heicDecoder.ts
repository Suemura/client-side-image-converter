/**
 * HEIC/HEIF デコード処理
 *
 * ブラウザの Image 要素は HEIC をデコードできないため、
 * libheif の WASM ビルド（heic-decode + libheif-js）でデコードして Canvas に展開する。
 * デコーダー（WASM 同梱、約 1.5MB）は動的 import により HEIC ファイルの変換時のみロードされる。
 */

import { ERROR_MESSAGES } from "./constants";
import type { DecodedImage } from "./decodedImage";

/**
 * HEIC/HEIF ファイルをデコードして RGBA の生ピクセル（`ImageData` 化できる形）に展開する。
 *
 * Canvas / DOM 非依存なので Web Worker（OffscreenCanvas 経路）からも利用できる。
 * @param buffer - HEIC ファイルの中身
 */
export const decodeHeicToImageData = async (
  buffer: Uint8Array,
): Promise<DecodedImage> => {
  const { default: decode } = await import("heic-decode");
  const { width, height, data } = await decode({ buffer });
  return { data, width, height };
};

/**
 * HEIC/HEIF ファイルをデコードして Canvas に展開する（メインスレッド用）
 */
export const decodeHeicToCanvas = async (
  file: File,
): Promise<HTMLCanvasElement> => {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const { data, width, height } = await decodeHeicToImageData(buffer);

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
