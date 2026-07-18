/**
 * カメラ RAW（CR2 / CR3 / NEF / ARW / DNG / RAF / ORF 等）デコード処理
 *
 * ブラウザの Image 要素は RAW をデコードできないため、
 * LibRaw の WASM ビルド（libraw-wasm、約 1.5MB）でデコードして RGBA に展開する。
 * デコーダーは動的 import により RAW ファイルの変換時のみロードされる。
 *
 * 現像パラメータ（露出補正・WB・ハイライト復元）は `RawDevelopParams` で受け取り、
 * `buildLibRawSettings` で LibRaw の設定へ変換する（Issue #132）。未指定時は
 * カメラ設定準拠のデフォルト現像（useCameraWb・8bps 出力 = Issue #101 時点の固定挙動）。
 */

import { ERROR_MESSAGES } from "./constants";
import type { DecodedImage } from "./decodedImage";
import { buildLibRawSettings, type RawDevelopParams } from "./rawDevelopment";
import { rawImageDataToRgba } from "./rawImage";

/**
 * RAW ファイルをデコードして RGBA の生ピクセル（`ImageData` 化できる形）に展開する。
 *
 * Canvas / DOM 非依存なので Web Worker（OffscreenCanvas 経路）からも利用できる
 * （libraw-wasm は内部で自前の Worker を生成するため、この場合はネスト Worker になる。
 * 非対応環境では例外になり、呼び出し側のメインスレッドフォールバックで再試行される）。
 *
 * @param buffer - RAW ファイルの中身
 * @param params - 現像パラメータ（未指定時はカメラ設定準拠のデフォルト現像）
 * @param options - halfSize: プレビュー用の半分サイズ現像（大幅高速化）
 */
export const decodeRawToImageData = async (
  buffer: ArrayBuffer,
  params?: RawDevelopParams,
  options?: { halfSize?: boolean },
): Promise<DecodedImage> => {
  const { default: LibRaw } = await import("libraw-wasm");
  const raw = new LibRaw();
  try {
    await raw.open(
      new Uint8Array(buffer),
      buildLibRawSettings(params, options),
    );
    const image = await raw.imageData();
    if (!image) {
      throw new Error(ERROR_MESSAGES.IMAGE_LOAD_ERROR);
    }
    return rawImageDataToRgba(image);
  } finally {
    // WASM 側のメモリと内部 Worker を必ず解放する（数十 MB の RAW を扱うため即時解放が重要）
    raw.dispose();
  }
};

/**
 * RAW ファイルをデコードして Canvas に展開する（メインスレッド用）
 */
export const decodeRawToCanvas = async (
  file: File,
  params?: RawDevelopParams,
): Promise<HTMLCanvasElement> => {
  const buffer = await file.arrayBuffer();
  const { data, width, height } = await decodeRawToImageData(buffer, params);

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
