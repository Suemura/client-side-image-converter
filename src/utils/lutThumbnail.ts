import { applyLutToPixel, type LutData } from "./lutParser";

/**
 * LUT サムネイルの生成寸法。CSS 表示（56×36 相当・cover）の 2 倍で
 * Retina でも滲まない解像度にする（アスペクト比は CSS の 56/36 と一致）。
 */
export const LUT_THUMB_WIDTH = 112;
export const LUT_THUMB_HEIGHT = 72;

/** object-fit: cover 相当で切り出すソース矩形 */
export interface CoverCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * ソース画像から出力アスペクト比を満たす中央トリミング矩形（object-fit: cover 相当）を求める。
 * 不正な寸法（非有限・0 以下）はゼロ矩形を返し、呼び出し側でスキップする
 * （`resolveHistogramSampleSize` と同じ防御パターン）。
 */
export const resolveCoverCropRect = (
  srcWidth: number,
  srcHeight: number,
  destWidth: number,
  destHeight: number,
): CoverCropRect => {
  if (
    !Number.isFinite(srcWidth) ||
    !Number.isFinite(srcHeight) ||
    !Number.isFinite(destWidth) ||
    !Number.isFinite(destHeight) ||
    srcWidth <= 0 ||
    srcHeight <= 0 ||
    destWidth <= 0 ||
    destHeight <= 0
  ) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }
  const srcAspect = srcWidth / srcHeight;
  const destAspect = destWidth / destHeight;
  if (srcAspect > destAspect) {
    // ソースが出力より横長 → 左右を切り落とす
    const sw = Math.max(1, Math.round(srcHeight * destAspect));
    return {
      sx: Math.floor((srcWidth - sw) / 2),
      sy: 0,
      sw,
      sh: srcHeight,
    };
  }
  // ソースが出力より縦長（または同アスペクト）→ 上下を切り落とす
  const sh = Math.max(1, Math.round(srcWidth / destAspect));
  return {
    sx: 0,
    sy: Math.floor((srcHeight - sh) / 2),
    sw: srcWidth,
    sh,
  };
};

/**
 * 画像未投入時のフォールバック用ベース（固定グラデーション）を RGBA で生成する。
 * 幅・高さで色域を広めに走査し、LUT の傾向が一目で分かる配色にする
 * （旧 `LutPicker.makeThumbnail` のグラデーション部を移設）。
 */
export const makeGradientBasePixels = (
  width: number,
  height: number,
): Uint8ClampedArray => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      pixels[p] = Math.round((x / (width - 1)) * 255);
      pixels[p + 1] = Math.round((y / (height - 1)) * 255);
      pixels[p + 2] = Math.round((1 - x / (width - 1)) * 255);
      pixels[p + 3] = 255;
    }
  }
  return pixels;
};

/**
 * RGBA ピクセル列へ LUT をフル強度で適用した新しい配列を返す（入力は変更しない）。
 * サムネイルは「LUT 単体の傾向比較」が目的のため、調整・トーンカーブは反映せず
 * strength も常に 1 で固定する。alpha は素通しする。
 */
export const applyLutToPixels = (
  base: Uint8ClampedArray,
  lut: LutData,
): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(base.length);
  for (let p = 0; p < base.length; p += 4) {
    const [r, g, b] = applyLutToPixel(
      base[p] / 255,
      base[p + 1] / 255,
      base[p + 2] / 255,
      lut,
      1,
    );
    out[p] = Math.round(r * 255);
    out[p + 1] = Math.round(g * 255);
    out[p + 2] = Math.round(b * 255);
    out[p + 3] = base[p + 3];
  }
  return out;
};
