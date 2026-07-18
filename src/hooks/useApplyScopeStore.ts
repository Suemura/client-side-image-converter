"use client";

import { useCallback, useMemo, useState } from "react";
import {
  type ApplyScopeState,
  migrateApplyScope,
  resolveScopedValueForIndex,
} from "../utils/applyScope";

/** useApplyScopeStore の返却値 */
export interface ApplyScopeStore<T> {
  /** 現在表示中の画像へ適用する値（一括 / 画像ごとで解決済み） */
  current: T;
  /** 現在モードの適切なストア（共有 / 当該インデックス）へ書き込む */
  setCurrent: (next: T) => void;
  /** 出力ジョブ構築・非デフォルト判定用の状態スナップショット */
  state: ApplyScopeState<T>;
  /** 一括 / 画像ごとの切替時、現在値を移行先へ引き継ぐ（ページが applyToAll を切り替える前に呼ぶ） */
  migrate: (nextApplyToAll: boolean) => void;
  /** 共有値・画像ごとの値をデフォルトへ戻す */
  reset: () => void;
}

/**
 * 適用範囲（全画像一括 / 画像ごと）の dual-store を管理する汎用フック。
 * crop（領域・変換）と edit（調整・LUT 選択・トーンカーブ）の同型実装を一元化する。
 *
 * applyToAll トグル自体はページが所有する（edit は 3 ストアで 1 つのトグルを共有するため）。
 * 切替時は各ストアの `migrate()` を呼んでからページ側の applyToAll を更新すること。
 *
 * @param defaultValue 未設定インデックスの解決・リセットに使うデフォルト値。
 *   参照が変わると setCurrent 等のメモ化が無効になるため、モジュール定数を渡すこと。
 */
export function useApplyScopeStore<T>(
  applyToAll: boolean,
  currentIndex: number,
  defaultValue: T,
): ApplyScopeStore<T> {
  const [shared, setShared] = useState<T>(defaultValue);
  const [perImage, setPerImage] = useState<Record<number, T>>({});

  const state = useMemo<ApplyScopeState<T>>(
    () => ({ applyToAll, shared, perImage }),
    [applyToAll, shared, perImage],
  );

  // 保持中の参照をそのまま返す（毎レンダーで新オブジェクトを作らず、下流のメモ化を壊さない）
  const current = resolveScopedValueForIndex(currentIndex, state, defaultValue);

  const setCurrent = useCallback(
    (next: T) => {
      if (applyToAll) {
        setShared(next);
      } else {
        setPerImage((prev) => ({ ...prev, [currentIndex]: next }));
      }
    },
    [applyToAll, currentIndex],
  );

  const migrate = useCallback(
    (nextApplyToAll: boolean) => {
      const next = migrateApplyScope(
        state,
        nextApplyToAll,
        currentIndex,
        defaultValue,
      );
      if (next === state) {
        return;
      }
      setShared(next.shared);
      setPerImage(next.perImage);
    },
    [state, currentIndex, defaultValue],
  );

  const reset = useCallback(() => {
    setShared(defaultValue);
    setPerImage({});
  }, [defaultValue]);

  return { current, setCurrent, state, migrate, reset };
}
