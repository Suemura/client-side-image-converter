/**
 * 統合ワークスペース（/studio）の Canvas / DOM 非依存の純粋ロジック。単体テスト対象。
 *
 * - ツール定義（6 ツール）
 * - ドキュメントモデル（originalFile / currentFile の線形パイプライン）
 * - 履歴パネルの操作ラベル定義（スタック本体は `editHistory.ts`）
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

/**
 * 履歴パネルの操作ラベル種別。
 * i18n キー（`studio.history.labels.*`）と 1:1 で対応する。
 */
export type StudioHistoryLabelKey =
  | "load" // 元画像を読み込み（baseline）
  | "add" // 画像を追加
  | "crop" // 切り抜き（自由比率）
  | "cropRatio" // 切り抜き（比率プリセット指定）
  | "adjust" // 調整の確定
  | "retouchMosaic" // レタッチ（モザイク）
  | "retouchBlur" // レタッチ（ぼかし）
  | "retouchFill" // レタッチ（塗りつぶし）
  | "upscale" // AI 拡大
  | "removebg" // AI 背景除去
  | "metadata"; // メタデータ削除

/** 履歴ノードの表示用ラベル（コンポーネント側で t(key, params) に渡す） */
export interface StudioHistoryLabel {
  key: StudioHistoryLabelKey;
  params?: Record<string, string | number>;
}

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
