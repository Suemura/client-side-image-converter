/**
 * AI 超解像（/upscale）の Canvas 非依存な純粋ロジック。
 *
 * タイル分割・フェザー（重み付き）合成・テンソル変換・アルファ拡大・2x 用縮小など、
 * ONNX Runtime Web での推論前後のピクセル演算を担う。redactCore.ts / cropGeometry.ts と
 * 同じ「純粋ロジックの切り出し」方針で、単体テストの対象とする。
 * ONNX Runtime とのやり取り（セッション生成・推論実行）は imageUpscaler.ts が担う。
 */

/** 対応する拡大倍率 */
export type UpscaleScale = 2 | 4;

/** モデル（realesr-general-x4v3）の固有倍率。2x は 4x 推論後の 1/2 縮小で実現する */
export const MODEL_SCALE = 4;

/**
 * 推論タイルの一辺（入力解像度 px）。出力は MODEL_SCALE 倍（= 768px 四方）になる。
 * 大きいほどタイル数が減るが、WASM 実行環境でも 1 タイルが数秒で終わり
 * 進捗・キャンセルの粒度が保てるサイズにする。
 */
export const DEFAULT_TILE_SIZE = 192;

/**
 * 隣接タイルとのオーバーラップ幅（入力解像度 px）。
 * 畳み込みの受容野によるタイル境界の劣化をフェザー合成で隠すための重複領域。
 */
export const DEFAULT_TILE_OVERLAP = 16;

/**
 * 入力画像の長辺上限（px）。4x 出力は面積 16 倍になるため、
 * これを超える画像はメモリ・処理時間の観点で受け付けない。
 */
export const MAX_UPSCALE_INPUT_DIMENSION = 4096;

/** タイルの矩形（入力解像度の自然座標） */
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 画像をオーバーラップ付きのタイルへ分割する。
 * - 画像がタイルより小さい軸は画像全体を 1 タイルで覆う
 * - タイル開始位置は stride = tileSize - overlap で進め、末尾タイルは
 *   画像右端 / 下端に揃うよう引き戻す（タイル寸法を一定に保ち、推論の
 *   入力形状変動を最小にする）
 * - 生成順は行優先（左上 → 右下）で決定的
 */
export const computeTileGrid = (
  width: number,
  height: number,
  tileSize: number = DEFAULT_TILE_SIZE,
  overlap: number = DEFAULT_TILE_OVERLAP,
): TileRect[] => {
  if (width <= 0 || height <= 0) {
    return [];
  }
  if (tileSize <= overlap) {
    throw new Error("tileSize must be greater than overlap");
  }
  const stride = tileSize - overlap;
  const positions = (length: number): number[] => {
    if (length <= tileSize) {
      return [0];
    }
    const result: number[] = [];
    for (let pos = 0; ; pos += stride) {
      if (pos + tileSize >= length) {
        result.push(length - tileSize);
        break;
      }
      result.push(pos);
    }
    return result;
  };
  const xs = positions(width);
  const ys = positions(height);
  const tiles: TileRect[] = [];
  for (const y of ys) {
    for (const x of xs) {
      tiles.push({
        x,
        y,
        width: Math.min(tileSize, width),
        height: Math.min(tileSize, height),
      });
    }
  }
  return tiles;
};

/**
 * タイル 1 軸分のフェザー重みを出力解像度で算出する。
 * - 隣接タイルがある側（タイル端が画像端でない側）は overlap 幅で 0 に向かって
 *   線形に減衰させる（正確には (i+1)/(rampWidth+1) で 0 にはしない。全画素で
 *   重み和 > 0 を保証し、合成時のゼロ除算を構造的に排除する）
 * - 画像端に接する側は減衰させない（外側に混ぜる相手がいない）
 * @param tileStart - タイルの開始位置（入力解像度）
 * @param tileLength - タイルの長さ（入力解像度）
 * @param imageLength - 画像の長さ（入力解像度）
 * @param overlap - オーバーラップ幅（入力解像度）
 * @param scale - 出力解像度への倍率（重みは出力解像度の画素単位で返す）
 */
export const computeFeatherWeights = (
  tileStart: number,
  tileLength: number,
  imageLength: number,
  overlap: number,
  scale: number,
): Float32Array => {
  const outLength = tileLength * scale;
  const rampWidth = overlap * scale;
  const weights = new Float32Array(outLength);
  const hasLeftNeighbor = tileStart > 0;
  const hasRightNeighbor = tileStart + tileLength < imageLength;
  for (let i = 0; i < outLength; i++) {
    let w = 1;
    if (hasLeftNeighbor && i < rampWidth) {
      w *= (i + 1) / (rampWidth + 1);
    }
    const fromRight = outLength - 1 - i;
    if (hasRightNeighbor && fromRight < rampWidth) {
      w *= (fromRight + 1) / (rampWidth + 1);
    }
    weights[i] = w;
  }
  return weights;
};

/**
 * RGBA バッファからタイル領域を切り出し、NCHW（1×3×h×w）の float32 テンソルへ
 * 変換する（値域 0..1、アルファは無視する）。realesr-general-x4v3 の入力形式。
 */
export const extractTileTensor = (
  rgba: Uint8ClampedArray,
  imageWidth: number,
  tile: TileRect,
): Float32Array => {
  const plane = tile.width * tile.height;
  const tensor = new Float32Array(plane * 3);
  for (let y = 0; y < tile.height; y++) {
    let srcOffset = ((tile.y + y) * imageWidth + tile.x) * 4;
    let planeIndex = y * tile.width;
    for (let x = 0; x < tile.width; x++) {
      tensor[planeIndex] = rgba[srcOffset] / 255;
      tensor[plane + planeIndex] = rgba[srcOffset + 1] / 255;
      tensor[plane * 2 + planeIndex] = rgba[srcOffset + 2] / 255;
      srcOffset += 4;
      planeIndex += 1;
    }
  }
  return tensor;
};

/** フェザー合成の蓄積バッファ（RGB 重み付き和と重み和） */
export interface BlendAccumulator {
  /** RGB の重み付き和（出力解像度、3ch インターリーブ） */
  rgb: Float32Array;
  /** 重み和（出力解像度、1ch） */
  weight: Float32Array;
  width: number;
  height: number;
}

/** 出力解像度の蓄積バッファを生成する */
export const createBlendAccumulator = (
  outWidth: number,
  outHeight: number,
): BlendAccumulator => ({
  rgb: new Float32Array(outWidth * outHeight * 3),
  weight: new Float32Array(outWidth * outHeight),
  width: outWidth,
  height: outHeight,
});

/**
 * 推論済みタイル（NCHW float32、値域 0..1）をフェザー重み付きで
 * 蓄積バッファへ合成する。タイルの出力先座標は入力タイル座標の scale 倍。
 */
export const accumulateTile = (
  acc: BlendAccumulator,
  tileTensor: Float32Array,
  tile: TileRect,
  scale: number,
  weightsX: Float32Array,
  weightsY: Float32Array,
): void => {
  const tw = tile.width * scale;
  const th = tile.height * scale;
  const plane = tw * th;
  const outX = tile.x * scale;
  const outY = tile.y * scale;
  for (let y = 0; y < th; y++) {
    const wy = weightsY[y];
    const rowBase = (outY + y) * acc.width + outX;
    const planeRow = y * tw;
    for (let x = 0; x < tw; x++) {
      const w = wy * weightsX[x];
      const outIndex = rowBase + x;
      const planeIndex = planeRow + x;
      acc.rgb[outIndex * 3] += tileTensor[planeIndex] * w;
      acc.rgb[outIndex * 3 + 1] += tileTensor[plane + planeIndex] * w;
      acc.rgb[outIndex * 3 + 2] += tileTensor[plane * 2 + planeIndex] * w;
      acc.weight[outIndex] += w;
    }
  }
};

/**
 * 蓄積バッファを RGBA バッファへ確定する（重み和で正規化 + 0..255 へ量子化）。
 * @param alpha - 出力解像度のアルファ平面（null なら全画素不透明）
 */
export const finalizeToRgba = (
  acc: BlendAccumulator,
  alpha: Uint8ClampedArray | null,
): Uint8ClampedArray => {
  const pixelCount = acc.width * acc.height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const w = acc.weight[i];
    // computeFeatherWeights が重み 0 を作らないため w > 0 が保証されるが、
    // 万一の呼び出しミスでも NaN を出力しないよう防御する
    const inv = w > 0 ? 255 / w : 0;
    rgba[i * 4] = acc.rgb[i * 3] * inv;
    rgba[i * 4 + 1] = acc.rgb[i * 3 + 1] * inv;
    rgba[i * 4 + 2] = acc.rgb[i * 3 + 2] * inv;
    rgba[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return rgba;
};

/** RGBA バッファに完全不透明でない画素が含まれるか（アルファ拡大の要否判定） */
export const hasTransparency = (rgba: Uint8ClampedArray): boolean => {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) {
      return true;
    }
  }
  return false;
};

/**
 * RGBA バッファのアルファ平面をバイリニア補間で拡大する。
 * モデルは RGB のみ扱うため、透過画像のアルファはここで別途拡大して合成する。
 */
export const resizeAlphaBilinear = (
  rgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8ClampedArray => {
  const dst = new Uint8ClampedArray(dstWidth * dstHeight);
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
      const a00 = rgba[(y0 * srcWidth + x0) * 4 + 3];
      const a10 = rgba[(y0 * srcWidth + x1) * 4 + 3];
      const a01 = rgba[(y1 * srcWidth + x0) * 4 + 3];
      const a11 = rgba[(y1 * srcWidth + x1) * 4 + 3];
      const top = a00 + (a10 - a00) * fx;
      const bottom = a01 + (a11 - a01) * fx;
      dst[y * dstWidth + x] = top + (bottom - top) * fy;
    }
  }
  return dst;
};

/**
 * RGBA バッファを 1/2 に縮小する（2×2 ボックス平均）。
 * 2x 指定は「4x 推論 → 1/2 縮小」で実現するための後段処理
 * （Real-ESRGAN 公式実装の outscale と同じ方式）。
 * 入力の幅・高さは偶数であることを前提とする（4x 出力は常に偶数）。
 */
export const downscaleRgbaByHalf = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } => {
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error("downscaleRgbaByHalf requires even dimensions");
  }
  const dstWidth = width / 2;
  const dstHeight = height / 2;
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  for (let y = 0; y < dstHeight; y++) {
    const row0 = y * 2 * width;
    const row1 = row0 + width;
    for (let x = 0; x < dstWidth; x++) {
      const i00 = (row0 + x * 2) * 4;
      const i10 = i00 + 4;
      const i01 = (row1 + x * 2) * 4;
      const i11 = i01 + 4;
      const dstIndex = (y * dstWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        dst[dstIndex + c] =
          (rgba[i00 + c] + rgba[i10 + c] + rgba[i01 + c] + rgba[i11 + c]) / 4;
      }
    }
  }
  return { data: dst, width: dstWidth, height: dstHeight };
};

/**
 * 指定倍率の出力寸法を返す。
 */
export const resolveOutputSize = (
  width: number,
  height: number,
  scale: UpscaleScale,
): { width: number; height: number } => ({
  width: width * scale,
  height: height * scale,
});

/** 入力画像が処理可能なサイズかを判定する */
export const isUpscalableSize = (width: number, height: number): boolean =>
  width > 0 &&
  height > 0 &&
  Math.max(width, height) <= MAX_UPSCALE_INPUT_DIMENSION;

/**
 * タイル推論の進捗率（0..1）を算出する。
 * @param completedTiles - 完了タイル数
 * @param totalTiles - 総タイル数
 */
export const computeTileProgress = (
  completedTiles: number,
  totalTiles: number,
): number => {
  if (totalTiles <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, completedTiles / totalTiles));
};
