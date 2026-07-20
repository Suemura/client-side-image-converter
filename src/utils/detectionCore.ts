/**
 * 顔・ナンバープレート自動検出（/studio レタッチツール）の Canvas 非依存な純粋ロジック。
 *
 * UltraFace（RFB-640・顔）と LPD-YuNet（ナンバープレート）の前後処理
 * （RGBA → テンソル変換・プライア生成・出力復号・NMS・検出矩形 → レタッチ領域化）を担う。
 * removeBgCore.ts / upscaleCore.ts と同じ「純粋ロジックの切り出し」方針で単体テストの
 * 対象とする。ONNX Runtime とのやり取り（セッション生成・推論実行）は
 * imageDetector.ts が担う。
 *
 * モデル固有の定数（入力解像度・正規化係数・しきい値）はここへ集約する。
 * 復号ロジックは各モデルの公式デモ実装をミラーする:
 * - UltraFace: onnx/models validated/vision/body_analysis/ultraface（出力は
 *   softmax 済みスコアと corner 形式の正規化ボックス）
 * - LPD-YuNet: opencv/opencv_zoo models/license_plate_detection_yunet/lpd_yunet.py
 */

import type { CropArea } from "./cropGeometry";

/** 検出カテゴリ（顔 / ナンバープレート） */
export type DetectionCategory = "face" | "plate";

/** 検出候補（rect は元画像の自然座標 px・パディングなしの生の検出矩形） */
export interface DetectionCandidate {
  category: DetectionCategory;
  rect: CropArea;
  /** 検出確度 0..1 */
  score: number;
}

/** 正規化座標（0..1）の corner 形式ボックス + スコア（復号 → NMS の中間表現） */
export interface NormalizedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

/** UltraFace（RFB-640）の入力解像度 */
export const FACE_INPUT_WIDTH = 640;
export const FACE_INPUT_HEIGHT = 480;

/** LPD-YuNet の入力解像度 */
export const PLATE_INPUT_WIDTH = 320;
export const PLATE_INPUT_HEIGHT = 240;

/** スコアしきい値（各モデルの公式デモの既定値） */
export const FACE_SCORE_THRESHOLD = 0.7;
export const PLATE_SCORE_THRESHOLD = 0.8;

/** NMS の IoU しきい値 */
export const DETECTION_NMS_IOU = 0.3;

/**
 * 検出矩形 → レタッチ領域化のパディング係数（片側あたり幅・高さの 15%）。
 * 検出矩形は対象ぎりぎりを囲むため、余白を付けて確実に隠せるようにする（Issue #145）。
 */
export const DETECTION_PADDING_RATIO = 0.15;

/**
 * RGBA バッファを UltraFace の入力テンソル（NCHW 1×3×h×w・RGB）へ変換する。
 * 正規化は (pixel - 127) / 128（公式デモと同じ）。アルファは無視する。
 */
export const rgbaToFaceTensor = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array => {
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    const offset = i * 4;
    tensor[i] = (rgba[offset] - 127) / 128;
    tensor[plane + i] = (rgba[offset + 1] - 127) / 128;
    tensor[plane * 2 + i] = (rgba[offset + 2] - 127) / 128;
  }
  return tensor;
};

/**
 * RGBA バッファを LPD-YuNet の入力テンソル（NCHW 1×3×h×w・BGR）へ変換する。
 * OpenCV の blobFromImage 既定と同じく生の 0..255 値・BGR チャンネル順で渡す
 * （スケーリング・平均減算なし）。アルファは無視する。
 */
export const rgbaToPlateTensor = (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array => {
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    const offset = i * 4;
    // BGR 順（OpenCV デモは BGR 画像のまま学習・推論している）
    tensor[i] = rgba[offset + 2];
    tensor[plane + i] = rgba[offset + 1];
    tensor[plane * 2 + i] = rgba[offset];
  }
  return tensor;
};

/**
 * UltraFace の出力を復号する。
 * scores は (N, 2) の softmax 済み確率（[背景, 顔]）、boxes は (N, 4) の
 * corner 形式・0..1 正規化座標。しきい値を超えた候補を返す（NMS は別途）。
 */
export const decodeFaceOutputs = (
  scores: Float32Array,
  boxes: Float32Array,
  threshold: number = FACE_SCORE_THRESHOLD,
): NormalizedBox[] => {
  const count = Math.floor(scores.length / 2);
  const results: NormalizedBox[] = [];
  for (let i = 0; i < count; i++) {
    const score = scores[i * 2 + 1];
    if (score <= threshold) {
      continue;
    }
    results.push({
      x1: boxes[i * 4],
      y1: boxes[i * 4 + 1],
      x2: boxes[i * 4 + 2],
      y2: boxes[i * 4 + 3],
      score,
    });
  }
  return results;
};

/** LPD-YuNet のプライア生成パラメータ（lpd_yunet.py と同一） */
const PLATE_MIN_SIZES = [
  [10, 16, 24],
  [32, 48],
  [64, 96],
  [128, 192, 256],
] as const;
const PLATE_STRIDES = [8, 16, 32, 64] as const;
const PLATE_VARIANCE = [0.1, 0.2] as const;

/**
 * LPD-YuNet の SSD 型プライア（cx, cy, s_kx, s_ky の flat 配列・0..1 正規化）を生成する。
 * 320×240 入力で 4385 個（lpd_yunet.py の _priorGen と同一の手順）。
 */
export const generatePlatePriors = (
  width: number = PLATE_INPUT_WIDTH,
  height: number = PLATE_INPUT_HEIGHT,
): Float32Array => {
  // 2 段目の特徴マップから半減させていく（[h, w] 順）
  const featureMap2 = [
    Math.floor(Math.floor((height + 1) / 2) / 2),
    Math.floor(Math.floor((width + 1) / 2) / 2),
  ];
  const featureMaps: number[][] = [];
  let previous = featureMap2;
  for (let level = 0; level < 5; level++) {
    const next = [Math.floor(previous[0] / 2), Math.floor(previous[1] / 2)];
    // 3 段目（level 0 の生成結果）以降の 4 スケールを使う
    featureMaps.push(next);
    previous = next;
  }
  const usedMaps = featureMaps.slice(0, 4);

  const priors: number[] = [];
  usedMaps.forEach(([mapHeight, mapWidth], k) => {
    for (let i = 0; i < mapHeight; i++) {
      for (let j = 0; j < mapWidth; j++) {
        for (const minSize of PLATE_MIN_SIZES[k]) {
          priors.push(
            ((j + 0.5) * PLATE_STRIDES[k]) / width,
            ((i + 0.5) * PLATE_STRIDES[k]) / height,
            minSize / width,
            minSize / height,
          );
        }
      }
    }
  });
  return new Float32Array(priors);
};

/**
 * LPD-YuNet の出力（loc: N×14 / conf: N×2 / iou: N×1）を復号する。
 * スコアは sqrt(クラス確率 × IoU 予測（0..1 へクランプ））。ボックスは
 * loc の 4 隅点（列 4:6, 6:8, 10:12, 12:14）をプライアで復号し、
 * その外接矩形（corner 形式・0..1 正規化）を返す（NMS は別途）。
 */
export const decodePlateOutputs = (
  loc: Float32Array,
  conf: Float32Array,
  iou: Float32Array,
  priors: Float32Array,
  threshold: number = PLATE_SCORE_THRESHOLD,
): NormalizedBox[] => {
  const count = Math.floor(priors.length / 4);
  const results: NormalizedBox[] = [];
  // 4 隅点に対応する loc の列オフセット（lpd_yunet.py の _decode と同一）
  const cornerOffsets = [4, 6, 10, 12];
  for (let i = 0; i < count; i++) {
    const cls = conf[i * 2 + 1];
    const iouScore = Math.min(1, Math.max(0, iou[i]));
    const score = Math.sqrt(cls * iouScore);
    if (score <= threshold) {
      continue;
    }
    const cx = priors[i * 4];
    const cy = priors[i * 4 + 1];
    const sx = priors[i * 4 + 2];
    const sy = priors[i * 4 + 3];
    let x1 = Number.POSITIVE_INFINITY;
    let y1 = Number.POSITIVE_INFINITY;
    let x2 = Number.NEGATIVE_INFINITY;
    let y2 = Number.NEGATIVE_INFINITY;
    for (const offset of cornerOffsets) {
      const px = cx + loc[i * 14 + offset] * PLATE_VARIANCE[0] * sx;
      const py = cy + loc[i * 14 + offset + 1] * PLATE_VARIANCE[0] * sy;
      x1 = Math.min(x1, px);
      y1 = Math.min(y1, py);
      x2 = Math.max(x2, px);
      y2 = Math.max(y2, py);
    }
    results.push({ x1, y1, x2, y2, score });
  }
  return results;
};

/** 2 つの corner 形式ボックスの IoU */
const boxIou = (a: NormalizedBox, b: NormalizedBox): number => {
  const interX1 = Math.max(a.x1, b.x1);
  const interY1 = Math.max(a.y1, b.y1);
  const interX2 = Math.min(a.x2, b.x2);
  const interY2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
};

/**
 * ハード NMS（スコア降順に走査し、確定済みボックスとの IoU がしきい値を
 * 超える候補を捨てる）。入力は変更しない。
 */
export const nonMaxSuppression = (
  boxes: readonly NormalizedBox[],
  iouThreshold: number = DETECTION_NMS_IOU,
): NormalizedBox[] => {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: NormalizedBox[] = [];
  for (const box of sorted) {
    if (kept.every((keep) => boxIou(box, keep) <= iouThreshold)) {
      kept.push(box);
    }
  }
  return kept;
};

/**
 * 正規化ボックスを元画像の自然座標矩形へ変換する（クランプ付き）。
 * 面積が失われる（1px 未満になる）候補は誤検出とみなして null を返す。
 */
export const normalizedBoxToRect = (
  box: NormalizedBox,
  imageWidth: number,
  imageHeight: number,
): CropArea | null => {
  const x1 = Math.max(0, Math.min(box.x1 * imageWidth, imageWidth));
  const y1 = Math.max(0, Math.min(box.y1 * imageHeight, imageHeight));
  const x2 = Math.max(0, Math.min(box.x2 * imageWidth, imageWidth));
  const y2 = Math.max(0, Math.min(box.y2 * imageHeight, imageHeight));
  const width = x2 - x1;
  const height = y2 - y1;
  if (width < 1 || height < 1) {
    return null;
  }
  return { x: x1, y: y1, width, height };
};

/**
 * 検出矩形へパディングを付けてレタッチ領域の矩形にする。
 * 片側あたり幅・高さの paddingRatio ぶん広げ、画像境界内へクランプする。
 */
export const expandDetectionRect = (
  rect: CropArea,
  imageWidth: number,
  imageHeight: number,
  paddingRatio: number = DETECTION_PADDING_RATIO,
): CropArea => {
  const padX = rect.width * paddingRatio;
  const padY = rect.height * paddingRatio;
  const x1 = Math.max(0, rect.x - padX);
  const y1 = Math.max(0, rect.y - padY);
  const x2 = Math.min(imageWidth, rect.x + rect.width + padX);
  const y2 = Math.min(imageHeight, rect.y + rect.height + padY);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

/** カテゴリ別の検出件数を数える */
export const countByCategory = (
  candidates: readonly DetectionCandidate[],
): Record<DetectionCategory, number> => {
  const counts: Record<DetectionCategory, number> = { face: 0, plate: 0 };
  for (const candidate of candidates) {
    counts[candidate.category] += 1;
  }
  return counts;
};
