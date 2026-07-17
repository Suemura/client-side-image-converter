/**
 * RAW デコード結果の純粋変換ロジック（Canvas / WASM 非依存・単体テスト対象）
 *
 * libraw-wasm の `imageData()` が返す生ピクセル（RGB / RGBA、8bit / 16bit）を、
 * `ImageData` にそのまま渡せる RGBA 8bit の `DecodedImage` へ変換する。
 */

import type { DecodedImage } from "./decodedImage";

/** libraw-wasm の `imageData()` 戻り値のうち、変換に必要な最小構造 */
export interface RawImageDataLike {
  /** ピクセル列（colors チャンネルのインターリーブ。bits=16 のときは Uint16Array） */
  data: Uint8Array | Uint16Array;
  width: number;
  height: number;
  /**
   * チャンネル数（3 = RGB / 4 = RGBA）
   *
   * libraw-wasm の `imageData()` は LibRaw の `dcraw_make_mem_image()` のラッパーで、
   * この API は四色フィルタセンサー（旧型機種の RGBG/CMYG 等）を含め、
   * 常に colors=3（RGB）または 1（グレー）へ後処理して返す。
   * そのため実運用で 4 が返ることは通常なく、下記の colors===4 分岐は
   * 型定義上の可能性に対する防御的なフォールバックである
   * （4番目のチャンネルが常に透過情報であることを保証するものではない）。
   */
  colors: number;
  /** チャンネルあたりのビット数（8 または 16） */
  bits: number;
}

/**
 * RAW デコード結果を RGBA 8bit の `DecodedImage` へ変換する
 *
 * - colors=3（RGB）はアルファ 255 を補って RGBA 化する
 * - bits=16 は上位 8bit を取り出して 8bit へ縮退する（`>> 8`）
 * - 不正な colors / bits / データ長不整合は例外を投げる（呼び出し側で失敗一覧に載る）
 * @param raw - libraw-wasm の `imageData()` 戻り値
 */
export const rawImageDataToRgba = (raw: RawImageDataLike): DecodedImage => {
  const { data, width, height, colors, bits } = raw;

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`RAW 画像の寸法が不正です: ${width}x${height}`);
  }
  if (width <= 0 || height <= 0) {
    throw new Error(`RAW 画像の寸法が不正です: ${width}x${height}`);
  }
  if (colors !== 3 && colors !== 4) {
    throw new Error(`RAW 画像のチャンネル数に対応していません: ${colors}`);
  }
  if (bits !== 8 && bits !== 16) {
    throw new Error(`RAW 画像のビット深度に対応していません: ${bits}`);
  }
  const pixelCount = width * height;
  if (data.length !== pixelCount * colors) {
    throw new Error(
      `RAW 画像のデータ長が寸法と一致しません: length=${data.length}, expected=${pixelCount * colors}`,
    );
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  // 16bit は上位 8bit のみ使用する（256 = 2^8 で割るのと同義）
  const shift = bits === 16 ? 8 : 0;

  for (let i = 0; i < pixelCount; i++) {
    const src = i * colors;
    const dst = i * 4;
    rgba[dst] = data[src] >> shift;
    rgba[dst + 1] = data[src + 1] >> shift;
    rgba[dst + 2] = data[src + 2] >> shift;
    // colors===4 は通常発生しない防御的フォールバック（上記 RawImageDataLike#colors 参照）
    rgba[dst + 3] = colors === 4 ? data[src + 3] >> shift : 255;
  }

  return { data: rgba, width, height };
};
