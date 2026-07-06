/**
 * デコード済み画像の生ピクセル表現（Canvas / DOM 非依存）
 *
 * HEIC / TIFF など Image 要素でデコードできない形式を、メインスレッドの Canvas と
 * Web Worker の OffscreenCanvas の両方に展開できるよう、RGBA バイト列として受け渡す。
 */
export interface DecodedImage {
  /** RGBA の生ピクセル（`new ImageData(data, width, height)` にそのまま渡せる） */
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}
