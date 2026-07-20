/**
 * 統合ワークスペース（/studio）の Canvas / DOM 非依存の純粋ロジック。単体テスト対象。
 *
 * - ツール定義（6 ツール）
 * - ドキュメントモデル（originalFile / currentFile の線形パイプライン）
 * - コミット単位の undo / redo 履歴（深さ上限付き）
 * - 書き出し時のリサイズ寸法計算・対象解決
 *
 * React への配線は `src/app/studio/hooks/` が担う。
 */

/** ワークスペースのツール識別子（モックのレール / タブ順） */
export type StudioToolId =
  | "crop"
  | "adjust"
  | "retouch"
  | "upscale"
  | "removebg"
  | "info";

/** ツールレール / タブバーの表示順 */
export const STUDIO_TOOL_ORDER: readonly StudioToolId[] = [
  "crop",
  "adjust",
  "retouch",
  "upscale",
  "removebg",
  "info",
];

/**
 * ワークスペース上の 1 画像。破壊的適用（切り抜き・レタッチ・AI・メタデータ削除）の
 * たびに currentFile を差し替える線形モデル（順序を固定しないパイプライン内部化）。
 */
export interface StudioDocument {
  /** ドキュメント識別子（ファイル差し替え後も不変） */
  id: string;
  /** 投入時の元ファイル（前後比較の「編集前」に使う） */
  originalFile: File;
  /** 現在の作業ファイル（適用結果で差し替わる） */
  currentFile: File;
}

/** undo / redo 履歴（past が古い順・future が新しい順） */
export interface StudioHistory<T> {
  past: T[];
  present: T;
  future: T[];
}

/** 履歴の深さ上限（present を除く past の最大数。メモリ膨張防止） */
export const STUDIO_HISTORY_LIMIT = 20;

/** 初期状態の履歴を作る */
export const createHistory = <T>(initial: T): StudioHistory<T> => ({
  past: [],
  present: initial,
  future: [],
});

/**
 * 新しい状態を履歴へ積む。future は破棄し、past が上限を超えたら最古を捨てる。
 * 捨てられたスナップショットは戻り値 evicted で返す（object URL の解放判定用）。
 */
export const pushHistory = <T>(
  history: StudioHistory<T>,
  next: T,
  limit: number = STUDIO_HISTORY_LIMIT,
): { history: StudioHistory<T>; evicted: T[] } => {
  const past = [...history.past, history.present];
  const evicted =
    past.length > limit ? past.splice(0, past.length - limit) : [];
  return {
    history: { past, present: next, future: [] },
    evicted,
  };
};

export const canUndo = <T>(history: StudioHistory<T>): boolean =>
  history.past.length > 0;

export const canRedo = <T>(history: StudioHistory<T>): boolean =>
  history.future.length > 0;

/** 1 つ戻る（不可なら同じ参照を返す） */
export const undoHistory = <T>(history: StudioHistory<T>): StudioHistory<T> => {
  if (!canUndo(history)) {
    return history;
  }
  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];
  return { past, present, future: [history.present, ...history.future] };
};

/** 1 つ進む（不可なら同じ参照を返す） */
export const redoHistory = <T>(history: StudioHistory<T>): StudioHistory<T> => {
  if (!canRedo(history)) {
    return history;
  }
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present, future };
};

/** 書き出しのリサイズ指定（幅・高さは片方だけでもよい。未指定は「自動」） */
export interface ResizeRequest {
  width?: number;
  height?: number;
  /** アスペクト比を維持する（既定 true 扱いは呼び出し側で行う） */
  keepAspect: boolean;
}

const isValidDimension = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 1;

/**
 * リサイズ指定と元寸法から出力寸法を解決する。
 * - 幅・高さとも未指定（または不正値）→ null（リサイズなし）
 * - keepAspect: 片方指定はもう片方をアスペクト比から算出、両方指定は内接（contain）
 * - keepAspect でない場合、未指定側は元寸法を維持する
 * - 結果が元寸法と同じなら null（無駄な再サンプリングを避ける）
 */
export const resolveResizeDimensions = (
  sourceWidth: number,
  sourceHeight: number,
  request: ResizeRequest,
): { width: number; height: number } | null => {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }
  const reqWidth = isValidDimension(request.width)
    ? Math.round(request.width)
    : undefined;
  const reqHeight = isValidDimension(request.height)
    ? Math.round(request.height)
    : undefined;
  if (reqWidth === undefined && reqHeight === undefined) {
    return null;
  }

  let width: number;
  let height: number;
  if (request.keepAspect) {
    const aspect = sourceWidth / sourceHeight;
    if (reqWidth !== undefined && reqHeight !== undefined) {
      // 両方指定は指定ボックスへの内接（contain）
      const scale = Math.min(reqWidth / sourceWidth, reqHeight / sourceHeight);
      width = Math.round(sourceWidth * scale);
      height = Math.round(sourceHeight * scale);
    } else if (reqWidth !== undefined) {
      width = reqWidth;
      height = Math.round(reqWidth / aspect);
    } else {
      // reqHeight のみ
      height = reqHeight as number;
      width = Math.round(height * aspect);
    }
  } else {
    width = reqWidth ?? sourceWidth;
    height = reqHeight ?? sourceHeight;
  }

  width = Math.max(1, width);
  height = Math.max(1, height);
  if (width === sourceWidth && height === sourceHeight) {
    return null;
  }
  return { width, height };
};

/** 書き出し対象（モックの「この画像 | 全 N 枚（ZIP）」） */
export type ExportTarget = "current" | "all";

/**
 * 書き出し対象のドキュメントインデックス一覧を解決する。
 * currentIndex が範囲外（画像なし等）の場合は空配列を返す。
 */
export const resolveExportIndices = (
  target: ExportTarget,
  currentIndex: number,
  count: number,
): number[] => {
  if (count <= 0) {
    return [];
  }
  if (target === "all") {
    return Array.from({ length: count }, (_, i) => i);
  }
  if (currentIndex < 0 || currentIndex >= count) {
    return [];
  }
  return [currentIndex];
};
