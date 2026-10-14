/**
 * モザイク / ぼかしレタッチ（/redact）のコア型と Canvas 非依存の純粋ロジック。
 *
 * 領域リストの管理・隠し方の設定・RGBA バッファへのピクセル演算（モザイク / ぼかし /
 * 塗りつぶし）を提供する。Canvas / DOM に依存しないため単体テストの対象とする
 * （cropGeometry.ts / conversionCore.ts と同じ「純粋ロジックの切り出し」方針）。
 * ブラウザ側のオーケストレーション（Canvas との橋渡し）は imageRedactor.ts が担う。
 */

import type { CropArea } from "./cropGeometry";

/** 隠し方の種類 */
export type RedactMode = "mosaic" | "blur" | "fill";

/**
 * 隠し方の設定。ページ全体で 1 つを保持し、領域には持たせない
 * （「顔を全部モザイク」という主用途に十分で、領域ごとの選択状態管理を不要にする。
 * 領域別スタイルが必要になったら RedactRegion へ optional フィールドを足して拡張する）。
 */
export interface RedactStyle {
  mode: RedactMode;
  /** モザイクのブロックサイズ（自然座標 px。領域サイズ相対の下限で引き上げられる） */
  mosaicBlockSize: number;
  /** ぼかし半径（自然座標 px。領域サイズ相対の下限で引き上げられる） */
  blurRadius: number;
  /** 塗りつぶし色（#rrggbb 形式） */
  fillColor: string;
}

/**
 * 既定の隠し方。弱いぼかしには復元攻撃のリスクがあるため、
 * 既定モードは復元耐性の高いモザイクとする（Issue #98）。
 */
export const DEFAULT_REDACT_STYLE: RedactStyle = {
  mode: "mosaic",
  mosaicBlockSize: 16,
  blurRadius: 12,
  fillColor: "#000000",
};

/** モザイクブロックサイズの UI 範囲（自然座標 px） */
export const MOSAIC_BLOCK_SIZE_MIN = 8;
export const MOSAIC_BLOCK_SIZE_MAX = 64;

/** ぼかし半径の UI 範囲（自然座標 px） */
export const BLUR_RADIUS_MIN = 4;
export const BLUR_RADIUS_MAX = 32;

/** レタッチ領域（自然座標）。id は追加順の連番で、更新・削除のキーに使う */
export interface RedactRegion {
  id: number;
  area: CropArea;
}

/**
 * redact ページが保持するレタッチ状態。
 * 領域指定は画像ごとが本質のため（crop の「画像ごと」モード相当）、
 * per-image ストアのみを持つ（dual-store の共有側は持たない）。
 */
export interface RedactState {
  /** 画像インデックス → レタッチ領域リスト（自然座標） */
  perImageRegions: Record<number, RedactRegion[]>;
}

/**
 * 出力時、指定インデックスの画像に適用するレタッチ領域を解決する。
 * 未設定のインデックスは空リスト（無加工）を返す。
 * （applyScope.resolveScopedValueForIndex と同じ解決パターン）
 */
export const resolveRegionsForIndex = (
  index: number,
  state: RedactState,
): RedactRegion[] => state.perImageRegions[index] ?? [];

/** 領域を末尾へ追加した新しいリストを返す（不変更新） */
export const addRegion = (
  regions: readonly RedactRegion[],
  region: RedactRegion,
): RedactRegion[] => [...regions, region];

/**
 * 指定 id の領域の矩形を差し替えた新しいリストを返す（不変更新）。
 * id が見つからない場合は同一配列参照を返す（toneCurve.ts の点操作と同じ契約）。
 */
export const updateRegionArea = (
  regions: readonly RedactRegion[],
  id: number,
  area: CropArea,
): RedactRegion[] => {
  const index = regions.findIndex((region) => region.id === id);
  if (index === -1) {
    return regions as RedactRegion[];
  }
  const next = [...regions];
  next[index] = { ...next[index], area };
  return next;
};

/**
 * 指定 id の領域を取り除いた新しいリストを返す（不変更新）。
 * id が見つからない場合は同一配列参照を返す。
 */
export const removeRegion = (
  regions: readonly RedactRegion[],
  id: number,
): RedactRegion[] => {
  if (!regions.some((region) => region.id === id)) {
    return regions as RedactRegion[];
  }
  return regions.filter((region) => region.id !== id);
};

/**
 * モザイクの実効ブロックサイズを解決する。
 * 大きな領域に小さなブロックを敷くと高解像度では判読可能なまま残るため、
 * 領域の短辺が最大 24 ブロックに収まるよう下限を引き上げる（復元攻撃への構造的対策）。
 */
export const resolveMosaicBlockSize = (
  blockSize: number,
  area: CropArea,
): number =>
  Math.max(
    Math.max(1, Math.round(blockSize)),
    Math.ceil(Math.min(area.width, area.height) / 24),
  );

/**
 * ぼかしの実効半径を解決する。
 * 領域サイズに対して弱すぎるぼかしは復元攻撃のリスクがあるため、
 * 領域の短辺に応じた下限（短辺 / 16）を設ける。
 */
export const resolveBlurRadius = (radius: number, area: CropArea): number =>
  Math.max(
    Math.max(1, Math.round(radius)),
    Math.ceil(Math.min(area.width, area.height) / 16),
  );

/** #rrggbb / #rgb 形式の色文字列を RGB 値へ変換する（不正な形式は null） */
export const parseHexColor = (
  hex: string,
): { r: number; g: number; b: number } | null => {
  const long = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (long) {
    const value = Number.parseInt(long[1], 16);
    return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split("").map((c) => Number.parseInt(c + c, 16));
    return { r, g, b };
  }
  return null;
};

/**
 * RGBA バッファ（ImageData 互換の構造）。
 * ImageData は構造的にこのインターフェースを満たすため、そのまま渡せる。
 */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * 領域を画像境界内の整数矩形へクランプする（空になったら null）。
 * ピクセル演算の添字が範囲外へ出ないことをここで一元的に保証する。
 */
export const clampRegionToImage = (
  area: CropArea,
  imageWidth: number,
  imageHeight: number,
): CropArea | null => {
  const x = Math.max(0, Math.min(Math.round(area.x), imageWidth));
  const y = Math.max(0, Math.min(Math.round(area.y), imageHeight));
  const right = Math.max(
    x,
    Math.min(Math.round(area.x + area.width), imageWidth),
  );
  const bottom = Math.max(
    y,
    Math.min(Math.round(area.y + area.height), imageHeight),
  );
  const width = right - x;
  const height = bottom - y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
};

/** 塗りつぶし: 領域内の全ピクセルを指定色（不透明）で上書きする */
const applyFillToRegion = (
  image: RgbaImage,
  area: CropArea,
  color: { r: number; g: number; b: number },
): void => {
  const { data, width } = image;
  for (let y = area.y; y < area.y + area.height; y++) {
    let offset = (y * width + area.x) * 4;
    for (let x = 0; x < area.width; x++) {
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = 255;
      offset += 4;
    }
  }
};

/**
 * モザイク: 領域を blockSize 四方のブロックに分割し、各ブロックを平均色で塗る。
 * 領域端の端数ブロックは実際に含まれるピクセル数で平均する。決定的（乱数不使用）。
 */
const applyMosaicToRegion = (
  image: RgbaImage,
  area: CropArea,
  blockSize: number,
): void => {
  const { data, width } = image;
  for (let by = area.y; by < area.y + area.height; by += blockSize) {
    const blockHeight = Math.min(blockSize, area.y + area.height - by);
    for (let bx = area.x; bx < area.x + area.width; bx += blockSize) {
      const blockWidth = Math.min(blockSize, area.x + area.width - bx);

      // ブロック内の平均色を求める（RGB はアルファ加重平均）。
      // 完全透明画素の RGB は getImageData 上ほぼ (0,0,0) のため、
      // 単純平均だと透過部分と重なるブロックが黒側へ引っ張られてしまう
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      for (let y = by; y < by + blockHeight; y++) {
        let offset = (y * width + bx) * 4;
        for (let x = 0; x < blockWidth; x++) {
          const alpha = data[offset + 3];
          rSum += data[offset] * alpha;
          gSum += data[offset + 1] * alpha;
          bSum += data[offset + 2] * alpha;
          aSum += alpha;
          offset += 4;
        }
      }
      const count = blockWidth * blockHeight;
      // 全画素が完全透明のブロックは色情報を持たないため黒（不可視）とする
      const r = aSum > 0 ? Math.round(rSum / aSum) : 0;
      const g = aSum > 0 ? Math.round(gSum / aSum) : 0;
      const b = aSum > 0 ? Math.round(bSum / aSum) : 0;
      const a = Math.round(aSum / count);

      // ブロック全体を平均色で塗る
      for (let y = by; y < by + blockHeight; y++) {
        let offset = (y * width + bx) * 4;
        for (let x = 0; x < blockWidth; x++) {
          data[offset] = r;
          data[offset + 1] = g;
          data[offset + 2] = b;
          data[offset + 3] = a;
          offset += 4;
        }
      }
    }
  }
};

/** ボックスブラーの反復回数（3 回でガウス近似になる） */
const BLUR_PASSES = 3;

/**
 * 1 チャンネル分の水平ボックスブラー（窓幅 2r+1・累積和で O(n)）。
 * サンプリングは行の端でクランプする（領域外の画素は読まない）。
 */
const boxBlurLine = (
  src: Float32Array,
  dst: Float32Array,
  lineStart: number,
  stride: number,
  length: number,
  radius: number,
): void => {
  const window = 2 * radius + 1;
  // 初期窓: 左端をクランプして [−r, r] を合算する
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const clamped = Math.min(length - 1, Math.max(0, i));
    sum += src[lineStart + clamped * stride];
  }
  for (let i = 0; i < length; i++) {
    dst[lineStart + i * stride] = sum / window;
    const addIndex = Math.min(length - 1, i + radius + 1);
    const removeIndex = Math.max(0, i - radius);
    sum +=
      src[lineStart + addIndex * stride] -
      src[lineStart + removeIndex * stride];
  }
};

/** 1 チャンネル分の平面バッファ（w×h）へ分離型ボックスブラーを BLUR_PASSES 回適用する（結果は src） */
const blurPlane = (
  src: Float32Array,
  tmp: Float32Array,
  w: number,
  h: number,
  radius: number,
): void => {
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    // 水平方向（src → tmp）
    for (let y = 0; y < h; y++) {
      boxBlurLine(src, tmp, y * w, 1, w, radius);
    }
    // 垂直方向（tmp → src）
    for (let x = 0; x < w; x++) {
      boxBlurLine(tmp, src, x, w, h, radius);
    }
  }
};

/**
 * ぼかし: 領域内を分離型ボックスブラー（水平→垂直を BLUR_PASSES 回）でぼかす。
 * サンプリングは領域内にクランプし、領域外の画素を読まず・書き換えない。
 *
 * - メモリ: チャンネルは互いに独立なため 1 チャンネルずつ処理し、一時確保を
 *   領域 1px あたり Float32 3 個（src / tmp / ぼかし済みアルファ）に抑える
 *   （RGBA 一括展開の 32 バイト/px → 12 バイト/px。高解像度 × 大領域での
 *   タブクラッシュ対策）
 * - 色: RGB はアルファ乗算済み（premultiplied）でぼかし、書き戻し時に
 *   ぼかし済みアルファで割って戻す。完全透明画素の RGB（getImageData 上
 *   ほぼ 0）が平均へ混ざって透過部分が黒ずむのを防ぐ。不透明画像では
 *   ストレートアルファのぼかしと同じ結果になる
 */
const applyBlurToRegion = (
  image: RgbaImage,
  area: CropArea,
  radius: number,
): void => {
  const { data, width } = image;
  const { width: w, height: h } = area;
  const size = w * h;
  const src = new Float32Array(size);
  const tmp = new Float32Array(size);

  // アルファチャンネルを先にぼかす（RGB の書き戻し時の除算に使う）
  for (let y = 0; y < h; y++) {
    let offset = ((area.y + y) * width + area.x) * 4 + 3;
    let planeIndex = y * w;
    for (let x = 0; x < w; x++) {
      src[planeIndex] = data[offset];
      offset += 4;
      planeIndex += 1;
    }
  }
  blurPlane(src, tmp, w, h, radius);
  const blurredAlpha = src.slice();

  // RGB は元のアルファを乗算した状態でぼかし、ぼかし済みアルファで割って戻す
  for (let channel = 0; channel < 3; channel++) {
    for (let y = 0; y < h; y++) {
      let offset = ((area.y + y) * width + area.x) * 4;
      let planeIndex = y * w;
      for (let x = 0; x < w; x++) {
        src[planeIndex] = data[offset + channel] * data[offset + 3];
        offset += 4;
        planeIndex += 1;
      }
    }
    blurPlane(src, tmp, w, h, radius);
    for (let y = 0; y < h; y++) {
      let offset = ((area.y + y) * width + area.x) * 4;
      let planeIndex = y * w;
      for (let x = 0; x < w; x++) {
        const alpha = blurredAlpha[planeIndex];
        // 近傍が全て完全透明の画素は色情報を持たないため黒（不可視）とする
        data[offset + channel] =
          alpha > 0 ? Math.round(src[planeIndex] / alpha) : 0;
        offset += 4;
        planeIndex += 1;
      }
    }
  }

  // アルファチャンネルを書き戻す
  for (let y = 0; y < h; y++) {
    let offset = ((area.y + y) * width + area.x) * 4 + 3;
    let planeIndex = y * w;
    for (let x = 0; x < w; x++) {
      data[offset] = Math.round(blurredAlpha[planeIndex]);
      offset += 4;
      planeIndex += 1;
    }
  }
};

/**
 * レタッチ領域のリストを RGBA バッファへ焼き込む（in-place で変更する）。
 * 領域は画像境界内へクランプし、モザイク / ぼかしの強度は領域サイズ相対の
 * 下限で引き上げる。プレビューと出力の両方がこの関数を通る（WYSIWYG）。
 */
export const applyRedactionsToImageData = (
  image: RgbaImage,
  regions: readonly RedactRegion[],
  style: RedactStyle,
): void => {
  const fillColor = parseHexColor(style.fillColor) ?? { r: 0, g: 0, b: 0 };
  for (const region of regions) {
    const area = clampRegionToImage(region.area, image.width, image.height);
    if (!area) {
      continue;
    }
    switch (style.mode) {
      case "fill":
        applyFillToRegion(image, area, fillColor);
        break;
      case "mosaic":
        applyMosaicToRegion(
          image,
          area,
          resolveMosaicBlockSize(style.mosaicBlockSize, area),
        );
        break;
      case "blur":
        applyBlurToRegion(
          image,
          area,
          resolveBlurRadius(style.blurRadius, area),
        );
        break;
    }
  }
};
