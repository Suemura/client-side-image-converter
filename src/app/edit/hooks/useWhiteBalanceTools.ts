"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdjustmentState } from "../../../utils/adjustments";
import {
  averageRgb,
  clampSampleWindow,
  computeAutoLevels,
  computeAutoWhiteBalance,
  computeWhiteBalanceForNeutralPoint,
  WB_SAMPLE_RADIUS,
} from "../../../utils/autoAdjust";
import type { HistogramData } from "../../../utils/histogram";

/** useWhiteBalanceTools の入力 */
export interface WhiteBalanceToolsParams {
  files: File[];
  currentIndex: number;
  /** 編集前のプレビューソース（WB スポイトのサンプル元） */
  previewSource: HTMLCanvasElement | null;
  /** 編集前ヒストグラム（自動補正の統計元。null の間は自動補正を無効化する） */
  sourceHistogram: HistogramData | null;
  currentAdjustments: AdjustmentState;
  setCurrentAdjustments: (next: AdjustmentState) => void;
}

/** useWhiteBalanceTools の返却値 */
export interface WhiteBalanceTools {
  /** WB スポイトモード（モード中はプレビューのクリックで中性点を指定する） */
  wbEyedropperActive: boolean;
  handleToggleEyedropper: () => void;
  handleAutoLevels: () => void;
  handleAutoWhiteBalance: () => void;
  handleEyedropperPick: (x: number, y: number) => void;
}

/**
 * 自動補正（レベル / WB）と WB スポイトを管理する edit ページ固有フック。
 *
 * 自動補正はワンショット: 編集前ヒストグラムの統計から該当スライダー値を算出して
 * 上書きする。書き込みは setCurrentAdjustments 経由のため一括 / 画像ごとの挙動は
 * 手動スライダー操作と同一。編集前統計基準なので同じ画像で再押下しても値は変わらない（冪等）。
 */
export function useWhiteBalanceTools({
  files,
  currentIndex,
  previewSource,
  sourceHistogram,
  currentAdjustments,
  setCurrentAdjustments,
}: WhiteBalanceToolsParams): WhiteBalanceTools {
  const [wbEyedropperActive, setWbEyedropperActive] = useState(false);

  // 画像切替・ファイル変更時は WB スポイトモードを解除する（前の画像を狙った
  // クリックが新しい画像のソースをサンプルする誤適用を防ぐ）
  // biome-ignore lint/correctness/useExhaustiveDependencies: files / currentIndex の変化そのものを解除トリガとして購読する
  useEffect(() => {
    setWbEyedropperActive(false);
  }, [files, currentIndex]);

  // Esc キーでスポイトモードを解除する（モード中のみ購読）
  useEffect(() => {
    if (!wbEyedropperActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWbEyedropperActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wbEyedropperActive]);

  const handleAutoLevels = useCallback(() => {
    if (!sourceHistogram) return;
    const result = computeAutoLevels(sourceHistogram);
    if (!result) return;
    setCurrentAdjustments({ ...currentAdjustments, ...result });
  }, [sourceHistogram, currentAdjustments, setCurrentAdjustments]);

  const handleAutoWhiteBalance = useCallback(() => {
    if (!sourceHistogram) return;
    const result = computeAutoWhiteBalance(sourceHistogram);
    if (!result) return;
    setCurrentAdjustments({ ...currentAdjustments, ...result });
  }, [sourceHistogram, currentAdjustments, setCurrentAdjustments]);

  const handleToggleEyedropper = useCallback(() => {
    setWbEyedropperActive((active) => !active);
  }, []);

  // WB スポイト: クリック点（ソース自然座標）の編集前ソース近傍（5×5）平均から
  // temperature / tint を逆算してセットする。編集後キャンバスから読むと補正結果が
  // 次のサンプル値へ混入するフィードバックになるため、必ず編集前ソースを読む
  // （同じ点の再クリックで値が変わらない = 冪等。自動補正と同じ編集前統計基準）。
  // 適用後はワンショットとして自動解除する。透明画素（サンプル無効）はモード維持。
  const handleEyedropperPick = useCallback(
    (x: number, y: number) => {
      if (!previewSource) return;
      const sampleWindow = clampSampleWindow(
        x,
        y,
        WB_SAMPLE_RADIUS,
        previewSource.width,
        previewSource.height,
      );
      if (!sampleWindow) return;
      const ctx = previewSource.getContext("2d");
      if (!ctx) return;
      const rgb = averageRgb(
        ctx.getImageData(
          sampleWindow.x,
          sampleWindow.y,
          sampleWindow.width,
          sampleWindow.height,
        ).data,
      );
      if (!rgb) return;
      setCurrentAdjustments({
        ...currentAdjustments,
        ...computeWhiteBalanceForNeutralPoint(rgb),
      });
      setWbEyedropperActive(false);
    },
    [previewSource, currentAdjustments, setCurrentAdjustments],
  );

  return {
    wbEyedropperActive,
    handleToggleEyedropper,
    handleAutoLevels,
    handleAutoWhiteBalance,
    handleEyedropperPick,
  };
}
