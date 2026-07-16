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
 * （resolveCropForIndex / resolveAdjustmentForIndex と同じ解決パターン）
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

      // ブロック内の平均色を求める
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = by; y < by + blockHeight; y++) {
        let offset = (y * width + bx) * 4;
        for (let x = 0; x < blockWidth; x++) {
          r += data[offset];
          g += data[offset + 1];
          b += data[offset + 2];
          a += data[offset + 3];
          offset += 4;
        }
      }
      const count = blockWidth * blockHeight;
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      a = Math.round(a / count);

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

/**
 * ぼかし: 領域内を分離型ボックスブラー（水平→垂直を BLUR_PASSES 回）でぼかす。
 * サンプリングは領域内にクランプし、領域外の画素を読まず・書き換えない。
 */
const applyBlurToRegion = (
  image: RgbaImage,
  area: CropArea,
  radius: number,
): void => {
  const { data, width } = image;
  const { width: w, height: h } = area;

  // 領域を RGBA 各チャンネルの平面バッファへ抜き出す（Float32 で誤差蓄積を防ぐ）
  const size = w * h;
  const src = new Float32Array(size * 4);
  for (let y = 0; y < h; y++) {
    let offset = ((area.y + y) * width + area.x) * 4;
    let planeIndex = y * w;
    for (let x = 0; x < w; x++) {
      src[planeIndex] = data[offset];
      src[planeIndex + size] = data[offset + 1];
      src[planeIndex + size * 2] = data[offset + 2];
      src[planeIndex + size * 3] = data[offset + 3];
      offset += 4;
      planeIndex += 1;
    }
  }

  const tmp = new Float32Array(size * 4);
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    for (let channel = 0; channel < 4; channel++) {
      const base = channel * size;
      // 水平方向（src → tmp）
      for (let y = 0; y < h; y++) {
        boxBlurLine(src, tmp, base + y * w, 1, w, radius);
      }
      // 垂直方向（tmp → src）
      for (let x = 0; x < w; x++) {
        boxBlurLine(tmp, src, base + x, w, h, radius);
      }
    }
  }

  // 領域へ書き戻す
  for (let y = 0; y < h; y++) {
    let offset = ((area.y + y) * width + area.x) * 4;
    let planeIndex = y * w;
    for (let x = 0; x < w; x++) {
      data[offset] = Math.round(src[planeIndex]);
      data[offset + 1] = Math.round(src[planeIndex + size]);
      data[offset + 2] = Math.round(src[planeIndex + size * 2]);
      data[offset + 3] = Math.round(src[planeIndex + size * 3]);
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
