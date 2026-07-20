/**
 * ラベル付き編集履歴スタックの純粋ロジック（Canvas / DOM 非依存。単体テスト対象）。
 *
 * 統合ワークスペース（/studio）の undo / redo と履歴パネルを同一のスタックで駆動する。
 * - ノード = { 状態スナップショット, 表示用ラベル, タイムスタンプ }
 * - 先頭ノード（baseline。「元画像を読み込み」）は上限による間引きから保護（pin）する
 * - 任意位置へのジャンプ（jumpEditHistory）後も後方ノードは保持し redo 可能。
 *   新しいノードを push した時点で後方（分岐）を破棄する
 *
 * 状態スナップショットに File を持たせるため、AI 拡大 / AI 背景除去の結果も
 * ノードに実体として残る（復帰時の再推論は発生しない）。
 * React への配線は `src/app/studio/hooks/useStudioDocuments.ts` が担う。
 */

/** 履歴の 1 ノード */
export interface EditHistoryNode<S, L> {
  /** この操作を適用した後の状態スナップショット */
  state: S;
  /** 履歴パネルの表示用ラベル（i18n キー + パラメータ等） */
  label: L;
  /** 操作時刻（epoch ms） */
  timestamp: number;
}

/** ラベル付き編集履歴スタック（index が現在位置） */
export interface EditHistoryStack<S, L> {
  /** 古い順のノード列。先頭は常に baseline（元画像を読み込み） */
  nodes: EditHistoryNode<S, L>[];
  /** 現在位置（nodes のインデックス） */
  index: number;
}

/** baseline を除く後続ノードの既定上限（メモリ膨張防止） */
export const EDIT_HISTORY_LIMIT = 20;

/** baseline ノードだけの履歴を作る */
export const createEditHistory = <S, L>(
  state: S,
  label: L,
  timestamp: number,
): EditHistoryStack<S, L> => ({
  nodes: [{ state, label, timestamp }],
  index: 0,
});

/**
 * 現在位置の直後へ新しいノードを積む。
 * - 現在位置より後方のノード（redo 分岐）は破棄する
 * - baseline を除くノード数が limit を超えたら、baseline 直後から古い順に間引く
 * - 到達不能になった状態スナップショットは evicted で返す（リソース解放判定用）
 */
export const pushEditHistory = <S, L>(
  stack: EditHistoryStack<S, L>,
  state: S,
  label: L,
  timestamp: number,
  limit: number = EDIT_HISTORY_LIMIT,
): { stack: EditHistoryStack<S, L>; evicted: S[] } => {
  // 分岐破棄: 現在位置より後方を捨てて積む
  const discarded = stack.nodes.slice(stack.index + 1);
  const nodes = [
    ...stack.nodes.slice(0, stack.index + 1),
    { state, label, timestamp },
  ];
  // baseline（先頭）は pin し、超過分は index 1 から間引く
  const overflow = Math.max(0, nodes.length - 1 - limit);
  const trimmed = overflow > 0 ? nodes.splice(1, overflow) : [];
  return {
    stack: { nodes, index: nodes.length - 1 },
    evicted: [...discarded, ...trimmed].map((node) => node.state),
  };
};

export const canUndoEditHistory = <S, L>(
  stack: EditHistoryStack<S, L>,
): boolean => stack.index > 0;

export const canRedoEditHistory = <S, L>(
  stack: EditHistoryStack<S, L>,
): boolean => stack.index < stack.nodes.length - 1;

/** 1 つ戻る（不可なら同じ参照を返す） */
export const undoEditHistory = <S, L>(
  stack: EditHistoryStack<S, L>,
): EditHistoryStack<S, L> =>
  canUndoEditHistory(stack) ? { ...stack, index: stack.index - 1 } : stack;

/** 1 つ進む（不可なら同じ参照を返す） */
export const redoEditHistory = <S, L>(
  stack: EditHistoryStack<S, L>,
): EditHistoryStack<S, L> =>
  canRedoEditHistory(stack) ? { ...stack, index: stack.index + 1 } : stack;

/**
 * 任意のノードへ移動する（履歴パネルの行クリック）。
 * 範囲外・現在位置と同じ場合は同じ参照を返す。後方ノードは破棄しない（redo 可能のまま）。
 */
export const jumpEditHistory = <S, L>(
  stack: EditHistoryStack<S, L>,
  index: number,
): EditHistoryStack<S, L> => {
  if (!Number.isInteger(index) || index < 0 || index >= stack.nodes.length) {
    return stack;
  }
  if (index === stack.index) {
    return stack;
  }
  return { ...stack, index };
};

/** 現在位置の状態スナップショットを返す */
export const currentEditState = <S, L>(stack: EditHistoryStack<S, L>): S =>
  stack.nodes[stack.index].state;
