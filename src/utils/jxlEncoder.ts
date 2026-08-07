/**
 * JPEG XL（JXL）エンコード処理
 *
 * Canvas の toBlob("image/jxl") は全ブラウザ未実装（PNG にフォールバックする）ため、
 * Squoosh 由来の WASM エンコーダー @jsquash/jxl を使用する。
 * WASM は動的 import により JXL 変換実行時のみロードされる（avifEncoder.ts と同じ構成）。
 */

/** JXL エンコードに渡す品質値のデフォルト */
const DEFAULT_JXL_QUALITY = 90;

/** @jsquash/jxl デフォルトと同じエンコード努力度（1-9。小さいほど高速・圧縮効率は微減） */
const JXL_EFFORT_DEFAULT = 7;

/** 大画素数画像に適用する高速エンコード努力度 */
const JXL_EFFORT_LARGE = 3;

/** 高速エンコードへ切り替える画素数しきい値（8MP。avifEncoder と同じ基準） */
const JXL_LARGE_PIXEL_THRESHOLD = 8_000_000;

/**
 * 画素数に応じた JXL エンコード努力度（effort）を返す
 *
 * JXL の WASM エンコードは単一スレッドで、デフォルトの effort 7 だとカメラ撮影画像級
 * （RAW 現像後の数千万画素など）で数分〜十数分オーダーになり、変換が進まないように
 * 見える（Issue #132 動作確認。AVIF の speed 調整 = PR #130 と同型の問題）。
 * 8MP 超では effort を下げてエンコード時間を数分の一に抑える。
 */
export const resolveJxlEffort = (pixelCount: number): number => {
  if (!Number.isFinite(pixelCount) || pixelCount <= JXL_LARGE_PIXEL_THRESHOLD) {
    return JXL_EFFORT_DEFAULT;
  }
  return JXL_EFFORT_LARGE;
};

/**
 * 品質値を UI と同じ 1-100 の整数に正規化する
 *
 * @jsquash/jxl 自体は 0-100 を受け付けるが、下限は UI 側のクランプ
 * （ConversionSettings.tsx の 1-100）に合わせて 1 とする。
 *
 * 内部的には libjxl の butteraugli distance スケールへ変換されるため、
 * JPEG/WebP の quality と圧縮率カーブの体感が一致するわけではない点に注意
 * （高品質域の挙動が JPEG/WebP と異なる場合がある）。
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
    effort: resolveJxlEffort(canvas.width * canvas.height),
  });

  return new Blob([buffer], { type: "image/jxl" });
};
