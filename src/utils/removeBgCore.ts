/**
 * 背景除去（/remove-bg）の Canvas 非依存な純粋ロジック。
 *
 * U²-Net（u2netp）の前後処理（RGBA → 正規化テンソル変換・サリエンシーマップの
 * min-max 正規化・マスクの元解像度への拡大・アルファ合成）を担う。
 * upscaleCore.ts / redactCore.ts と同じ「純粋ロジックの切り出し」方針で、
 * 単体テストの対象とする。ONNX Runtime とのやり取り（セッション生成・推論実行）は
 * imageBackgroundRemover.ts が担う。
 *
 * モデル固有の定数（入力解像度・正規化係数）はここへ集約する。将来より高品質な
 * 同系モデル（silueta 等。入出力シグネチャは u2netp と互換）へ差し替える場合は
 * modelLoader.ts の URL とここの定数変更だけで済むようにする。
 */

/** 出力形式（透過を保持できる形式のみ。JPEG は透過非対応のため選べない） */
export type RemoveBgOutputFormat = "png" | "webp";

/** 出力形式 → MIME タイプ */
export const removeBgOutputMime = (
  format: RemoveBgOutputFormat,
): "image/png" | "image/webp" =>
  format === "png" ? "image/png" : "image/webp";

/** モデル（u2netp）の入力一辺（px）。入力画像はこの正方形へリサイズして推論する */
export const REMOVE_BG_INPUT_SIZE = 320;

/** 入力正規化の平均（ImageNet。RGB 順） */
export const REMOVE_BG_NORM_MEAN: readonly [number, number, number] = [
  0.485, 0.456, 0.406,
];

/** 入力正規化の標準偏差（ImageNet。RGB 順） */
export const REMOVE_BG_NORM_STD: readonly [number, number, number] = [
  0.229, 0.224, 0.225,
];

/**
 * 入力画像の長辺上限（px）。推論自体は固定解像度だが、デコード・アルファ合成・
 * 再エンコードで元解像度の Canvas を扱うため、メモリの観点で上限を設ける。
 */
export const MAX_REMOVE_BG_INPUT_DIMENSION = 8192;

/** 入力画像が処理可能なサイズかを判定する */
export const isRemovableSize = (width: number, height: number): boolean =>
  width > 0 &&
  height > 0 &&
  Math.max(width, height) <= MAX_REMOVE_BG_INPUT_DIMENSION;

/**
 * RGBA バッファをバイリニア補間で任意サイズへリサイズする。
 * モデル入力用の縮小（アスペクト比は保持せず正方形へ引き伸ばす。u2netp の
 * 標準前処理と同じ）に使う。アルファも補間するが入力テンソル化では無視される。
 */
export const resizeRgbaBilinear = (
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8ClampedArray<ArrayBuffer> => {
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;
  for (let y = 0; y < dstHeight; y++) {
    // 画素中心を合わせるための半画素オフセット
    const srcY = Math.min(srcHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.min(
        srcWidth - 1,
        Math.max(0, (x + 0.5) * scaleX - 0.5),
      );
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const fx = srcX - x0;
      const dstIndex = (y * dstWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = rgba[(y0 * srcWidth + x0) * 4 + c];
        const v10 = rgba[(y0 * srcWidth + x1) * 4 + c];
        const v01 = rgba[(y1 * srcWidth + x0) * 4 + c];
        const v11 = rgba[(y1 * srcWidth + x1) * 4 + c];
        const top = v00 + (v10 - v00) * fx;
        const bottom = v01 + (v11 - v01) * fx;
        dst[dstIndex + c] = top + (bottom - top) * fy;
      }
    }
  }
  return dst;
};

/**
 * RGBA バッファを NCHW（1×3×h×w）の float32 テンソルへ変換する。
 * 値域を 0..1 にした上で ImageNet の平均・標準偏差で正規化する（u2netp の入力形式。
 * アルファは無視する）。
 */
export const rgbaToNormalizedTensor = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mean: readonly [number, number, number] = REMOVE_BG_NORM_MEAN,
  std: readonly [number, number, number] = REMOVE_BG_NORM_STD,
): Float32Array => {
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    const offset = i * 4;
    tensor[i] = (rgba[offset] / 255 - mean[0]) / std[0];
    tensor[plane + i] = (rgba[offset + 1] / 255 - mean[1]) / std[1];
    tensor[plane * 2 + i] = (rgba[offset + 2] / 255 - mean[2]) / std[2];
  }
  return tensor;
};

/**
 * サリエンシーマップを min-max 正規化して 0..1 のマスクにする（u2netp の標準後処理）。
 * 全画素が同値（min == max）の場合は 0 除算を避けて全画素 0 を返す。
 * 入力は変更せず新しいバッファを返す。
 */
export const normalizeMaskMinMax = (mask: Float32Array): Float32Array => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of mask) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const result = new Float32Array(mask.length);
  const range = max - min;
  if (!(range > 0)) {
    return result;
  }
  for (let i = 0; i < mask.length; i++) {
    result[i] = (mask[i] - min) / range;
  }
  return result;
};

/**
 * マスク（0..1 の 1ch 平面）をバイリニア補間で任意サイズへ拡大する。
 * 320×320 の推論結果を元画像の解像度へ戻すのに使う。
 */
export const resizeMaskBilinear = (
  mask: Float32Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Float32Array => {
  const dst = new Float32Array(dstWidth * dstHeight);
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;
  for (let y = 0; y < dstHeight; y++) {
    const srcY = Math.min(srcHeight - 1, Math.max(0, (y + 0.5) * scaleY - 0.5));
    const y0 = Math.floor(srcY);
    const y1 = Math.min(srcHeight - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.min(
        srcWidth - 1,
        Math.max(0, (x + 0.5) * scaleX - 0.5),
      );
      const x0 = Math.floor(srcX);
      const x1 = Math.min(srcWidth - 1, x0 + 1);
      const fx = srcX - x0;
      const top =
        mask[y0 * srcWidth + x0] +
        (mask[y0 * srcWidth + x1] - mask[y0 * srcWidth + x0]) * fx;
      const bottom =
        mask[y1 * srcWidth + x0] +
        (mask[y1 * srcWidth + x1] - mask[y1 * srcWidth + x0]) * fx;
      dst[y * dstWidth + x] = top + (bottom - top) * fy;
    }
  }
  return dst;
};

/**
 * マスクを RGBA バッファのアルファへ合成する（前景 = マスク値が高い画素を残す）。
 * 元画像に既に透過がある場合も尊重し、合成後のアルファは「元アルファ × マスク」。
 * 入力は変更せず新しいバッファを返す。
 * @param mask - rgba と同じ画素数の 0..1 マスク平面
 */
export const applyMaskToAlpha = (
  rgba: Uint8ClampedArray,
  mask: Float32Array,
): Uint8ClampedArray<ArrayBuffer> => {
  const pixelCount = mask.length;
  const result = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    // 0..1 を外れた補間誤差はクランプする（Uint8ClampedArray の代入でも
    // クランプされるが、乗算前に正規化しておく）
    const m = Math.min(1, Math.max(0, mask[i]));
    result[offset] = rgba[offset];
    result[offset + 1] = rgba[offset + 1];
    result[offset + 2] = rgba[offset + 2];
    result[offset + 3] = rgba[offset + 3] * m;
  }
  return result;
};
