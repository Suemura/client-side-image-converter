"use client";

import { useCallback, useMemo } from "react";
import {
  type ApplyScopeStore,
  useApplyScopeStore,
} from "../../../hooks/useApplyScopeStore";
import {
  type AdjustmentState,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
} from "../../../utils/adjustments";
import { hasNonDefaultValue } from "../../../utils/applyScope";
import {
  DEFAULT_LUT_SELECTION,
  isDefaultLutSelection,
  type LutSelection,
} from "../../../utils/lutState";
import {
  buildToneCurveTable,
  DEFAULT_TONE_CURVE,
  isDefaultToneCurve,
  type ToneCurveState,
} from "../../../utils/toneCurve";

/** useEditScopeStores の返却値 */
export interface EditScopeStores {
  adjustments: ApplyScopeStore<AdjustmentState>;
  lut: ApplyScopeStore<LutSelection>;
  toneCurve: ApplyScopeStore<ToneCurveState>;
  /** プレビューへ渡す焼成済みトーンカーブテーブル（恒等は null） */
  currentCurveTable: Float32Array | null;
  /** 3 ストアすべての現在値を移行先へ引き継ぐ（applyToAll 切替前に呼ぶ） */
  migrateAll: (nextApplyToAll: boolean) => void;
  /** 3 ストアすべてをデフォルトへ戻す */
  resetAll: () => void;
  /** いずれかの画像に調整 / LUT / カーブがあるか（「すべてリセット」の活性判定） */
  hasAdjustments: boolean;
}

/**
 * edit ページの 3 系統 dual-store（調整・LUT 選択・トーンカーブ）を束ねるフック。
 * 3 ストアは同じ applyToAll トグル（ページが所有）を共有し、切替・リセット・
 * 非デフォルト判定を常に 3 系統まとめて行う。
 */
export function useEditScopeStores(
  applyToAll: boolean,
  currentIndex: number,
): EditScopeStores {
  const adjustments = useApplyScopeStore<AdjustmentState>(
    applyToAll,
    currentIndex,
    DEFAULT_ADJUSTMENTS,
  );
  const lut = useApplyScopeStore<LutSelection>(
    applyToAll,
    currentIndex,
    DEFAULT_LUT_SELECTION,
  );
  const toneCurve = useApplyScopeStore<ToneCurveState>(
    applyToAll,
    currentIndex,
    DEFAULT_TONE_CURVE,
  );

  // プレビューへ渡す焼成済みテーブル。恒等は null（GPU/CPU ともサンプリングをスキップ）。
  // カーブ state が変わったときだけ再焼成し、無関係な再レンダーでの GPU 再アップロードを防ぐ
  // （currentLut のメモ化と同方針）。
  const currentToneCurve = toneCurve.current;
  const currentCurveTable = useMemo(
    () =>
      isDefaultToneCurve(currentToneCurve)
        ? null
        : buildToneCurveTable(currentToneCurve),
    [currentToneCurve],
  );

  const migrateAll = useCallback(
    (nextApplyToAll: boolean) => {
      adjustments.migrate(nextApplyToAll);
      lut.migrate(nextApplyToAll);
      toneCurve.migrate(nextApplyToAll);
    },
    [adjustments.migrate, lut.migrate, toneCurve.migrate],
  );

  const resetAll = useCallback(() => {
    adjustments.reset();
    lut.reset();
    toneCurve.reset();
  }, [adjustments.reset, lut.reset, toneCurve.reset]);

  // 一括モードは共有値、画像ごとモードはいずれかの画像に調整 / LUT / カーブがあれば true
  const hasAdjustments =
    hasNonDefaultValue(adjustments.state, isDefaultAdjustments) ||
    hasNonDefaultValue(lut.state, isDefaultLutSelection) ||
    hasNonDefaultValue(toneCurve.state, isDefaultToneCurve);

  return {
    adjustments,
    lut,
    toneCurve,
    currentCurveTable,
    migrateAll,
    resetAll,
    hasAdjustments,
  };
}
