/**
 * LUT フィルタの選択状態（選択中の LUT + 適用強度）と、適用範囲（全画像一括 / 画像ごと）の
 * dual-store 解決を扱う Canvas / WebGL / DOM 非依存の純粋ロジック。
 *
 * LUT データ本体（`LutData`）は重く、また非同期に読み込まれるため調整（`AdjustmentState`）とは
 * 分離した軽量な参照（`lutId` + `strength`）だけを状態として持つ。実データは `lutId → LutData` の
 * レジストリ（edit ページの ref）側に保持し、本モジュールは選択の解決のみを担う。
 *
 * dual-store の解決は `adjustments.ts` の `resolveAdjustmentForIndex`（crop の
 * `cropGeometry.resolveCropForIndex` 由来）を鏡写しにする。単体テスト対象。
 */

/** 選択中の LUT と適用強度 */
export interface LutSelection {
  /** 選択中の LUT の ID（プリセット ID / カスタム。未選択は null） */
  lutId: string | null;
  /** 適用強度（UI 単位 [0,100]）。書き出し時に /100 して [0,1] のブレンド比に正規化する */
  strength: number;
}

/** 適用強度スライダーの範囲 */
export const LUT_STRENGTH_MIN = 0;
export const LUT_STRENGTH_MAX = 100;
/** 既定の適用強度（フル適用） */
export const DEFAULT_LUT_STRENGTH = 100;

/** 未選択（LUT なし）の既定選択 */
export const DEFAULT_LUT_SELECTION: LutSelection = {
  lutId: null,
  strength: DEFAULT_LUT_STRENGTH,
};

/** カスタムアップロード LUT を指す予約 ID（アップロードのたびにレジストリのこのスロットを上書きする） */
export const CUSTOM_LUT_ID = "custom";

/** 同梱プリセット LUT の定義 */
export interface LutPreset {
  /** レジストリ / 選択で使う ID */
  id: string;
  /** 表示名の i18n キー（`edit.lut.presets.<nameKey>`） */
  nameKey: string;
  /** public/luts/ 配下のファイル名 */
  file: string;
}

/**
 * 同梱プリセット LUT のカタログ。実データは `public/luts/` から動的 fetch する（初期バンドル非影響）。
 *
 * 内訳（ライセンス詳細は `public/luts/CREDITS.md`）:
 * - `cinematic` / `warm` / `cool` / `mono` / `vintage`: `scripts/generate-luts.ts` が
 *   アルゴリズム生成したオリジナル（CC0）。
 * - `movie` / `film` / `teal` / `nightfall` / `urban` / `retro`: freshluts.com から取得した CC0 の
 *   `.cube`。UI にはブランド名・個人名を出さないクリーンな名称へリネームして同梱する。
 */
export const LUT_PRESETS: readonly LutPreset[] = [
  { id: "cinematic", nameKey: "cinematic", file: "cinematic.cube" },
  { id: "movie", nameKey: "movie", file: "movie.cube" },
  { id: "film", nameKey: "film", file: "film.cube" },
  { id: "teal", nameKey: "teal", file: "teal.cube" },
  { id: "nightfall", nameKey: "nightfall", file: "nightfall.cube" },
  { id: "cool", nameKey: "cool", file: "cool.cube" },
  { id: "warm", nameKey: "warm", file: "warm.cube" },
  { id: "urban", nameKey: "urban", file: "urban.cube" },
  { id: "retro", nameKey: "retro", file: "retro.cube" },
  { id: "vintage", nameKey: "vintage", file: "vintage.cube" },
  { id: "mono", nameKey: "mono", file: "mono.cube" },
];

/** ID からプリセット定義を引く（未知 ID は undefined） */
export const findLutPreset = (id: string): LutPreset | undefined =>
  LUT_PRESETS.find((preset) => preset.id === id);

/** LUT が未選択かどうか */
export const isDefaultLutSelection = (selection: LutSelection): boolean =>
  selection.lutId === null;

/** edit ページが保持する LUT 選択状態（全画像一括 / 画像ごと） */
export interface LutSelectionState {
  /** true: 全画像へ共有選択を適用 / false: 画像ごとに保持 */
  applyToAll: boolean;
  /** 一括モードの共有選択 */
  sharedLut: LutSelection;
  /** 画像ごとの選択（未設定インデックスは未選択） */
  perImageLut: Record<number, LutSelection>;
}

/**
 * 出力時、指定インデックスの画像へ適用する LUT 選択を解決する。
 * 一括モードでは共有選択を、画像ごとモードでは当該インデックスの選択（未設定は未選択）を返す。
 * （`resolveAdjustmentForIndex` を踏襲）
 */
export const resolveLutForIndex = (
  index: number,
  state: LutSelectionState,
): LutSelection => {
  if (state.applyToAll) {
    return state.sharedLut;
  }
  return state.perImageLut[index] ?? DEFAULT_LUT_SELECTION;
};
