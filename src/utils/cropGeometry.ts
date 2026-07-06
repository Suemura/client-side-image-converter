/**
 * トリミングの座標計算に関する Canvas 非依存の純粋ロジック。
 *
 * CropSelector（表示座標での操作）・crop ページ（自然座標での保持）・imageCropper（出力）で
 * 共有する。Canvas / DOM に依存しないため単体テストの対象とする
 * （conversionCore.ts と同じ「純粋ロジックの切り出し」方針）。
 */

/** トリミング領域（表示座標・自然座標いずれの空間でも使う矩形） */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 90 度刻みの回転角 */
export type Rotation = 0 | 90 | 180 | 270;

/** ユーザーが指定する回転・反転の変換 */
export interface CropTransform {
  rotation: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

/** 無変換（回転 0・反転なし） */
export const IDENTITY_TRANSFORM: CropTransform = {
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
};

/** アスペクト比プリセット */
export interface AspectRatioPreset {
  /** 選択値 兼 i18n キー接尾辞（crop.aspect<Id> 等では使わず表示ラベルは別途） */
  id: string;
  /** 幅 / 高さ。自由（制約なし）は null */
  ratio: number | null;
}

/** 利用可能なアスペクト比プリセット（自由 / 1:1 / 16:9 / 4:3 / 3:2） */
export const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { id: "free", ratio: null },
  { id: "1:1", ratio: 1 },
  { id: "16:9", ratio: 16 / 9 },
  { id: "4:3", ratio: 4 / 3 },
  { id: "3:2", ratio: 3 / 2 },
];

/** 8 方向リサイズハンドル + 移動 */
export type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "move";

/** トリミング領域の最小サイズ（表示座標 px） */
export const MIN_CROP_SIZE = 10;

/** 右回転（90 度 CW）した回転角を返す */
export const rotateRight = (rotation: Rotation): Rotation =>
  ((rotation + 90) % 360) as Rotation;

/** 左回転（90 度 CCW）した回転角を返す */
export const rotateLeft = (rotation: Rotation): Rotation =>
  ((rotation + 270) % 360) as Rotation;

/**
 * 回転後の寸法。90 / 270 度で幅・高さが入れ替わる。
 * プレビュー用キャンバスと出力寸法の算出に使う。
 */
export const orientedSize = (
  width: number,
  height: number,
  rotation: Rotation,
): { width: number; height: number } =>
  rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };

/**
 * トリミング領域を境界内・最小サイズにクランプする。
 * 既存 CropSelector.constrainCropArea と同等の挙動を保った純粋版
 * （表示座標・自然座標のどちらにも適用できる）。
 */
export const clampCropArea = (
  area: CropArea,
  boundsWidth: number,
  boundsHeight: number,
  minSize = MIN_CROP_SIZE,
): CropArea => {
  const constrained: CropArea = {
    x: Math.max(0, area.x),
    y: Math.max(0, area.y),
    width: Math.max(minSize, area.width),
    height: Math.max(minSize, area.height),
  };

  // 右端の制約
  if (constrained.x + constrained.width > boundsWidth) {
    if (constrained.x >= boundsWidth - minSize) {
      constrained.x = Math.max(0, boundsWidth - minSize);
      constrained.width = minSize;
    } else {
      constrained.width = boundsWidth - constrained.x;
    }
  }

  // 下端の制約
  if (constrained.y + constrained.height > boundsHeight) {
    if (constrained.y >= boundsHeight - minSize) {
      constrained.y = Math.max(0, boundsHeight - minSize);
      constrained.height = minSize;
    } else {
      constrained.height = boundsHeight - constrained.y;
    }
  }

  return constrained;
};

/**
 * 表示座標のトリミング領域を自然座標（実ピクセル）へ変換する。
 * scaleX / scaleY = 自然サイズ / 表示サイズ。丸め後に画像境界内へ収める。
 */
export const scaleCropArea = (
  displayArea: CropArea,
  scaleX: number,
  scaleY: number,
  naturalWidth: number,
  naturalHeight: number,
): CropArea => {
  const area: CropArea = {
    x: Math.round(displayArea.x * scaleX),
    y: Math.round(displayArea.y * scaleY),
    width: Math.round(displayArea.width * scaleX),
    height: Math.round(displayArea.height * scaleY),
  };

  area.x = Math.max(0, Math.min(area.x, naturalWidth));
  area.y = Math.max(0, Math.min(area.y, naturalHeight));
  if (area.x + area.width > naturalWidth) {
    area.width = naturalWidth - area.x;
  }
  if (area.y + area.height > naturalHeight) {
    area.height = naturalHeight - area.y;
  }
  return area;
};

/**
 * 自然座標のトリミング領域を表示座標へ変換する（初期領域の復元に使う）。
 * scaleX / scaleY = 自然サイズ / 表示サイズ。
 */
export const toDisplayArea = (
  naturalArea: CropArea,
  scaleX: number,
  scaleY: number,
): CropArea => ({
  x: naturalArea.x / scaleX,
  y: naturalArea.y / scaleY,
  width: naturalArea.width / scaleX,
  height: naturalArea.height / scaleY,
});

/**
 * 指定領域の内側に収まる最大の「ratio（幅/高さ）」矩形を左上アンカーで返す。
 * アスペクト比プリセット選択時に現在の選択へ比率を当てはめるのに使う。
 */
export const fitAspectRatio = (
  area: CropArea,
  ratio: number | null,
): CropArea => {
  if (!ratio) {
    return area;
  }
  let width = area.width;
  let height = width / ratio;
  if (height > area.height) {
    height = area.height;
    width = height * ratio;
  }
  return { x: area.x, y: area.y, width, height };
};

/**
 * リサイズ中の領域にアスペクト比を強制する。
 * 操作中のハンドルに応じて固定端（アンカー）を保ちながら、もう一方の寸法を比率に合わせて補正する。
 */
export const enforceAspectRatio = (
  area: CropArea,
  handle: ResizeHandle,
  ratio: number | null,
): CropArea => {
  if (!ratio || handle === "move") {
    return area;
  }

  let width = area.width;
  let height = area.height;

  // 主動方向を決めてもう一方を比率で導出する
  if (handle === "n" || handle === "s") {
    // 上下ハンドルは高さ主動 → 幅を導出
    width = height * ratio;
  } else {
    // 左右・四隅は幅主動 → 高さを導出
    height = width / ratio;
  }

  let x = area.x;
  let y = area.y;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;

  switch (handle) {
    case "se":
      // 左上を固定
      break;
    case "nw":
      x = right - width;
      y = bottom - height;
      break;
    case "ne":
      // 左下を固定（左端そのまま・下端固定）
      y = bottom - height;
      break;
    case "sw":
      // 右上を固定（右端固定・上端そのまま）
      x = right - width;
      break;
    case "n":
      // 下端固定・水平中心維持
      x = centerX - width / 2;
      y = bottom - height;
      break;
    case "s":
      // 上端固定・水平中心維持
      x = centerX - width / 2;
      break;
    case "e":
      // 左端固定・垂直中心維持
      y = centerY - height / 2;
      break;
    case "w":
      // 右端固定・垂直中心維持
      x = right - width;
      y = centerY - height / 2;
      break;
  }

  return { x, y, width, height };
};

/**
 * アスペクト比を保ったままトリミング領域を境界内へ収める。
 *
 * `clampCropArea` は幅・高さを独立にクランプするため、比率固定リサイズ中に領域が
 * 画像の端へ到達すると片方の寸法だけが詰められて比率が崩れる。この関数は操作中の
 * ハンドルが示す固定端（アンカー）を保ちつつ、比率を維持したまま境界内へ収まる
 * 最大寸法へ一様に縮小する（`ratio` が null / `move` の場合は通常の `clampCropArea`）。
 * 呼び出し側は `enforceAspectRatio` で比率を整えた領域を渡す想定。
 */
export const clampCropAreaToAspect = (
  area: CropArea,
  handle: ResizeHandle,
  ratio: number | null,
  boundsWidth: number,
  boundsHeight: number,
  minSize = MIN_CROP_SIZE,
): CropArea => {
  if (!ratio || handle === "move") {
    return clampCropArea(area, boundsWidth, boundsHeight, minSize);
  }

  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const centerX = area.x + area.width / 2;
  const centerY = area.y + area.height / 2;

  // ハンドルごとに、固定端（アンカー）から各軸へ伸ばせる境界内の最大寸法を求める
  let maxWidth: number;
  let maxHeight: number;
  switch (handle) {
    case "se":
      maxWidth = boundsWidth - area.x;
      maxHeight = boundsHeight - area.y;
      break;
    case "nw":
      maxWidth = right;
      maxHeight = bottom;
      break;
    case "ne":
      maxWidth = boundsWidth - area.x;
      maxHeight = bottom;
      break;
    case "sw":
      maxWidth = right;
      maxHeight = boundsHeight - area.y;
      break;
    case "n":
      // 水平中心を維持するため左右どちらの余白も超えない幅に制限する
      maxWidth = 2 * Math.min(centerX, boundsWidth - centerX);
      maxHeight = bottom;
      break;
    case "s":
      maxWidth = 2 * Math.min(centerX, boundsWidth - centerX);
      maxHeight = boundsHeight - area.y;
      break;
    case "e":
      maxWidth = boundsWidth - area.x;
      maxHeight = 2 * Math.min(centerY, boundsHeight - centerY);
      break;
    default:
      // "w"
      maxWidth = right;
      maxHeight = 2 * Math.min(centerY, boundsHeight - centerY);
      break;
  }

  // 比率を保ったまま境界内へ収める（1 を上限にして拡大はしない）
  const scale = Math.min(1, maxWidth / area.width, maxHeight / area.height);
  let width = area.width * scale;
  let height = area.height * scale;

  // 最小サイズを下回った場合も比率を保って引き上げる
  if (width < minSize || height < minSize) {
    const upscale = Math.max(minSize / width, minSize / height);
    width *= upscale;
    height *= upscale;
  }

  // アンカー（固定端）を保つよう原点を再計算する
  let x = area.x;
  let y = area.y;
  switch (handle) {
    case "se":
      break;
    case "nw":
      x = right - width;
      y = bottom - height;
      break;
    case "ne":
      y = bottom - height;
      break;
    case "sw":
      x = right - width;
      break;
    case "n":
      x = centerX - width / 2;
      y = bottom - height;
      break;
    case "s":
      x = centerX - width / 2;
      break;
    case "e":
      y = centerY - height / 2;
      break;
    default:
      // "w"
      x = right - width;
      y = centerY - height / 2;
      break;
  }

  return { x, y, width, height };
};

/** crop ページが保持するトリミング状態（一括 / 画像ごとの両モード） */
export interface CropState {
  /** true: 全画像へ共有領域・共有変換を適用 / false: 画像ごとに保持 */
  applyToAll: boolean;
  /** 一括モードの共有トリミング領域（自然座標） */
  sharedArea: CropArea | null;
  /** 一括モードの共有変換 */
  sharedTransform: CropTransform;
  /** 画像ごとのトリミング領域（自然座標） */
  perImageArea: Record<number, CropArea | null>;
  /** 画像ごとの変換 */
  perImageTransform: Record<number, CropTransform>;
}

/**
 * 出力時、指定インデックスの画像に適用するトリミング領域と変換を解決する。
 * 一括モードでは共有値を、画像ごとモードでは当該インデックスの値（未設定は無変換・全体）を返す。
 */
export const resolveCropForIndex = (
  index: number,
  state: CropState,
): { area: CropArea | null; transform: CropTransform } => {
  if (state.applyToAll) {
    return { area: state.sharedArea, transform: state.sharedTransform };
  }
  return {
    area: state.perImageArea[index] ?? null,
    transform: state.perImageTransform[index] ?? IDENTITY_TRANSFORM,
  };
};
