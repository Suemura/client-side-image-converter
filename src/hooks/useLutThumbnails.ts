"use client";

import { useMemo } from "react";
import type { LutData } from "../utils/lutParser";
import {
  applyLutToPixels,
  LUT_THUMB_HEIGHT,
  LUT_THUMB_WIDTH,
  makeGradientBasePixels,
  resolveCoverCropRect,
} from "../utils/lutThumbnail";

/** useLutThumbnails の返却値 */
export interface LutThumbnails {
  /** LUT id → サムネイル dataURL（読み込み済み LUT のみ） */
  thumbnails: Record<string, string>;
  /** 「なし」ボタン用のベース画像 dataURL（画像未投入時は null → 既存 CSS フォールバック） */
  noneThumb: string | null;
}

/** RGBA ピクセル列をサムネイル寸法のキャンバスへ書き出し dataURL 化する */
const pixelsToDataUrl = (pixels: Uint8ClampedArray): string => {
  const canvas = document.createElement("canvas");
  canvas.width = LUT_THUMB_WIDTH;
  canvas.height = LUT_THUMB_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  const image = ctx.createImageData(LUT_THUMB_WIDTH, LUT_THUMB_HEIGHT);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
};

/**
 * LUT 選択ボタン用サムネイルを生成する共有フック（/edit の LutPicker と /studio で共用）。
 *
 * - `previewSource` があれば現在画像の縮小版（object-fit: cover 相当の中央トリミング）を
 *   ベースに、各 LUT を**単体・フル強度**で適用する（調整・トーンカーブは反映しない）
 * - `previewSource` が null の間は従来の固定グラデーションをベースにする
 * - ベースの再計算は `previewSource` の参照変化時のみ。ソースは画像切替時にしか
 *   新しいキャンバスへ差し替わらないため、スライダー操作等では再生成されない
 */
export function useLutThumbnails(
  previewSource: HTMLCanvasElement | null,
  luts: Record<string, LutData>,
): LutThumbnails {
  // ベースピクセル（現在画像の縮小版、なければグラデーション）
  const base = useMemo((): {
    pixels: Uint8ClampedArray;
    fromImage: boolean;
  } => {
    const fallback = {
      pixels: makeGradientBasePixels(LUT_THUMB_WIDTH, LUT_THUMB_HEIGHT),
      fromImage: false,
    };
    if (!previewSource) {
      return fallback;
    }
    const { sx, sy, sw, sh } = resolveCoverCropRect(
      previewSource.width,
      previewSource.height,
      LUT_THUMB_WIDTH,
      LUT_THUMB_HEIGHT,
    );
    if (sw <= 0 || sh <= 0) {
      return fallback;
    }
    const canvas = document.createElement("canvas");
    canvas.width = LUT_THUMB_WIDTH;
    canvas.height = LUT_THUMB_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return fallback;
    }
    ctx.drawImage(
      previewSource,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      LUT_THUMB_WIDTH,
      LUT_THUMB_HEIGHT,
    );
    return {
      pixels: ctx.getImageData(0, 0, LUT_THUMB_WIDTH, LUT_THUMB_HEIGHT).data,
      fromImage: true,
    };
  }, [previewSource]);

  // 各 LUT のサムネイル。112×72 × 十数 LUT の CPU トライリニアで数十 ms 未満のため
  // 同期生成で足りる（従来の makeThumbnail と同オーダー）
  const thumbnails = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [id, lut] of Object.entries(luts)) {
      result[id] = pixelsToDataUrl(applyLutToPixels(base.pixels, lut));
    }
    return result;
  }, [base, luts]);

  const noneThumb = useMemo(
    () => (base.fromImage ? pixelsToDataUrl(base.pixels) : null),
    [base],
  );

  return { thumbnails, noneThumb };
}
