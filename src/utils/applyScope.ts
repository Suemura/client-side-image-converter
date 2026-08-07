/**
 * 適用範囲（全画像一括 / 画像ごと）の dual-store パターンの汎用純粋ロジック。
 *
 * crop（領域・変換）と edit（調整・LUT 選択・トーンカーブ）で同型のまま重複していた
 * resolve*ForIndex / handleApplyModeChange の解決・移行処理を型パラメータ T で一元化する。
 * Canvas / DOM 非依存の単体テスト対象。React への接続は `hooks/useApplyScopeStore.ts` が担う。
 */

/** 一括 / 画像ごとの両モードの値を保持する dual-store 状態 */
export interface ApplyScopeState<T> {
  /** true: 全画像へ共有値を適用 / false: 画像ごとに保持 */
  applyToAll: boolean;
  /** 一括モードの共有値 */
  shared: T;
  /** 画像ごとの値（未設定インデックスはデフォルト扱い） */
  perImage: Record<number, T>;
}

/**
 * 指定インデックスの画像へ適用する値を解決する。
 * 一括モードでは共有値を、画像ごとモードでは当該インデックスの値（未設定はデフォルト）を返す。
 * 保持中の参照をそのまま返すため、呼び出し側のメモ化（参照比較）を壊さない。
 */
export const resolveScopedValueForIndex = <T>(
  index: number,
  state: ApplyScopeState<T>,
  defaultValue: T,
): T => {
  if (state.applyToAll) {
    return state.shared;
  }
  return state.perImage[index] ?? defaultValue;
};

/**
 * 一括 / 画像ごとの切替時、表示が飛ばないよう現在表示中の値を移行先ストアへ引き継いだ
 * 新しい状態を返す。画像ごと→一括では現在値を共有値へ、一括→画像ごとでは現在値を
 * 当該インデックスへ書き込む（他インデックスの既存値は保持）。モード不変ならそのまま返す。
 */
export const migrateApplyScope = <T>(
  state: ApplyScopeState<T>,
  nextApplyToAll: boolean,
  currentIndex: number,
  defaultValue: T,
): ApplyScopeState<T> => {
  if (nextApplyToAll === state.applyToAll) {
    return state;
  }
  const current = resolveScopedValueForIndex(currentIndex, state, defaultValue);
  if (nextApplyToAll) {
    return { ...state, applyToAll: true, shared: current };
  }
  return {
    ...state,
    applyToAll: false,
    perImage: { ...state.perImage, [currentIndex]: current },
  };
};

/**
 * いずれかの画像に非デフォルト値が設定されているかを判定する（「すべてリセット」の活性判定用）。
 * 一括モードは共有値のみ、画像ごとモードは全インデックスの値を調べる。
 */
export const hasNonDefaultValue = <T>(
  state: ApplyScopeState<T>,
  isDefault: (value: T) => boolean,
): boolean => {
  if (state.applyToAll) {
    return !isDefault(state.shared);
  }
  return Object.values(state.perImage).some((value) => !isDefault(value));
};
