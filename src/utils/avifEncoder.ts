/**
 * AVIF エンコード処理
 *
 * Canvas の toBlob("image/avif") は全ブラウザ未実装（PNG にフォールバックする）ため、
 * Squoosh 由来の WASM エンコーダー @jsquash/avif を使用する。
 * WASM（約 3.5MB）は動的 import により AVIF 変換実行時のみロードされる。
 */

/** AVIF エンコードに渡す品質値のデフォルト */
const DEFAULT_AVIF_QUALITY = 90;

/** @jsquash/avif デフォルトと同じエンコード速度（0-10。大きいほど高速・圧縮効率は微減） */
const AVIF_SPEED_DEFAULT = 6;

/** 大画素数画像に適用する高速エンコード速度 */
const AVIF_SPEED_LARGE = 8;

/** 高速エンコードへ切り替える画素数しきい値（8MP。4K 全画面 ≒ 8.3MP 相当より上 = カメラ撮影画像級） */
const AVIF_LARGE_PIXEL_THRESHOLD = 8_000_000;

/**
 * 画素数に応じた AVIF エンコード速度を返す
 *
 * AVIF の WASM エンコードは単一スレッドで極めて低速なため、カメラ撮影画像級
 * （RAW 現像後の数千万画素など）ではデフォルト速度だと数分オーダーになり、
 * Worker のウォッチドッグ超過 → メインスレッド再試行で UI が長時間固まる（Issue #101 動作確認）。
 * 8MP 超では speed を上げてエンコード時間を数分の一に抑える（画質への影響は quality 指定より軽微）。
 */
export const resolveAvifSpeed = (pixelCount: number): number => {
  if (
    !Number.isFinite(pixelCount) ||
    pixelCount <= AVIF_LARGE_PIXEL_THRESHOLD
  ) {
    return AVIF_SPEED_DEFAULT;
  }
  return AVIF_SPEED_LARGE;
};

/**
 * 品質値を UI と同じ 1-100 の整数に正規化する
 *
 * @jsquash/avif 自体は 0-100 を受け付けるが、下限は UI 側のクランプ
 * （ConversionSettings.tsx の 1-100）に合わせて 1 とする
 */
export const normalizeAvifQuality = (quality: number): number => {
  if (!Number.isFinite(quality)) {
    return DEFAULT_AVIF_QUALITY;
  }
  return Math.min(100, Math.max(1, Math.round(quality)));
};

/**
 * Canvas の内容を AVIF 形式の Blob にエンコードする
 *
 * `HTMLCanvasElement`（メインスレッド）と `OffscreenCanvas`（Web Worker）の両方を受け取れる。
 * WASM エンコード（同期実行で重い）を Worker から呼べるようにするため型を一般化している（Issue #47）。
 */
export const encodeCanvasToAvifBlob = async (
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
  const { default: encode } = await import("@jsquash/avif/encode.js");
  const buffer = await encode(imageData, {
    quality: normalizeAvifQuality(quality),
    speed: resolveAvifSpeed(canvas.width * canvas.height),
  });

  return new Blob([buffer], { type: "image/avif" });
};
