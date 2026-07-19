/**
 * 編集の出力ジョブ（画像ごとの調整・LUT・トーンカーブテーブル）を dual-store 状態から
 * 組み立てる Canvas / WebGL / DOM 非依存の純粋ロジック。単体テスト対象。
 */

import { type AdjustmentState, DEFAULT_ADJUSTMENTS } from "./adjustments";
import { type ApplyScopeState, resolveScopedValueForIndex } from "./applyScope";
import type { EditJob } from "./imageEditor";
import { DEFAULT_LUT_SELECTION, type LutSelection } from "./lutState";
import {
  buildToneCurveTable,
  DEFAULT_TONE_CURVE,
  isDefaultToneCurve,
  type ToneCurveState,
} from "./toneCurve";
import type { LutApplication } from "./webglImageRenderer";

/**
 * 全画像分の EditJob を組み立てる。
 * 同じ ToneCurveState（一括モードでは全画像で共有）のテーブルは重複焼成しない。
 * 恒等カーブは null（GPU/CPU ともサンプリングをスキップ）。
 */
export const buildEditJobs = (
  count: number,
  adjustmentsState: ApplyScopeState<AdjustmentState>,
  lutState: ApplyScopeState<LutSelection>,
  resolveLutApplication: (selection: LutSelection) => LutApplication | null,
  toneCurveState: ApplyScopeState<ToneCurveState>,
): EditJob[] => {
  const curveTableCache = new Map<ToneCurveState, Float32Array | null>();
  const curveTableFor = (index: number): Float32Array | null => {
    const resolved = resolveScopedValueForIndex(
      index,
      toneCurveState,
      DEFAULT_TONE_CURVE,
    );
    let table = curveTableCache.get(resolved);
    if (table === undefined) {
      table = isDefaultToneCurve(resolved)
        ? null
        : buildToneCurveTable(resolved);
      curveTableCache.set(resolved, table);
    }
    return table;
  };
  return Array.from({ length: count }, (_, index) => ({
    adjustments: resolveScopedValueForIndex(
      index,
      adjustmentsState,
      DEFAULT_ADJUSTMENTS,
    ),
    lut: resolveLutApplication(
      resolveScopedValueForIndex(index, lutState, DEFAULT_LUT_SELECTION),
    ),
    curve: curveTableFor(index),
  }));
};
