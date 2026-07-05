/**
 * AVIF エンコード処理
 *
 * Canvas の toBlob("image/avif") は全ブラウザ未実装（PNG にフォールバックする）ため、
 * Squoosh 由来の WASM エンコーダー @jsquash/avif を使用する。
 * WASM（約 1MB）は動的 import により AVIF 変換実行時のみロードされる。
 */

/** AVIF エンコードに渡す品質値のデフォルト（@jsquash/avif の quality は 0-100） */
const DEFAULT_AVIF_QUALITY = 90;

/**
 * 品質値を @jsquash/avif が受け付ける 1-100 の整数に正規化する
 */
export const normalizeAvifQuality = (quality: number): number => {
  if (!Number.isFinite(quality)) {
    return DEFAULT_AVIF_QUALITY;
  }
  return Math.min(100, Math.max(1, Math.round(quality)));
};

/**
 * Canvas の内容を AVIF 形式の Blob にエンコードする
 */
export const encodeCanvasToAvifBlob = async (
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context を取得できませんでした");
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // index.js 経由だと不要な decode 側も取り込まれるため encode モジュールを直接 import する
  const { default: encode } = await import("@jsquash/avif/encode.js");
  const buffer = await encode(imageData, {
    quality: normalizeAvifQuality(quality),
  });

  return new Blob([buffer], { type: "image/avif" });
};
