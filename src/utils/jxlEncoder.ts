/**
 * JPEG XL（JXL）エンコード処理
 *
 * Canvas の toBlob("image/jxl") は全ブラウザ未実装（PNG にフォールバックする）ため、
 * Squoosh 由来の WASM エンコーダー @jsquash/jxl を使用する。
 * WASM は動的 import により JXL 変換実行時のみロードされる（avifEncoder.ts と同じ構成）。
 */

/** JXL エンコードに渡す品質値のデフォルト */
const DEFAULT_JXL_QUALITY = 90;

/**
 * 品質値を UI と同じ 1-100 の整数に正規化する
 *
 * @jsquash/jxl 自体は 0-100 を受け付けるが、下限は UI 側のクランプ
 * （ConversionSettings.tsx の 1-100）に合わせて 1 とする
 */
export const normalizeJxlQuality = (quality: number): number => {
  if (!Number.isFinite(quality)) {
    return DEFAULT_JXL_QUALITY;
  }
  return Math.min(100, Math.max(1, Math.round(quality)));
};

/**
 * Canvas の内容を JPEG XL 形式の Blob にエンコードする
 *
 * `HTMLCanvasElement`（メインスレッド）と `OffscreenCanvas`（Web Worker）の両方を受け取れる。
 * WASM エンコード（同期実行で重い）を Worker から呼べるようにするため型を一般化している
 * （AVIF の Worker 化 Issue #47 と同じ構成）。
 */
export const encodeCanvasToJxlBlob = async (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob> => {
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    throw new Error("Canvas context を取得できませんでした");
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // index.js 経由だと不要な decode 側も取り込まれるため encode モジュールを直接 import する
  const { default: encode } = await import("@jsquash/jxl/encode.js");
  const buffer = await encode(imageData, {
    quality: normalizeJxlQuality(quality),
  });

  return new Blob([buffer], { type: "image/jxl" });
};
