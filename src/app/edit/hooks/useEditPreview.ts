"use client";

import { useCallback, useEffect, useState } from "react";
import {
  computeHistogram,
  type HistogramData,
  resolveHistogramSampleSize,
} from "../../../utils/histogram";
import { renderOrientedImage } from "../../../utils/imageCropper";

/**
 * 編集前ソース（EXIF 補正済みキャンバス）から輝度ヒストグラムを縮小サンプリングで算出する。
 * トーンカーブ背景用（x 軸＝カーブ入力値に対する分布）で、画像切替時に 1 回だけ実行される。
 * CompareView の編集後サンプリングと同じく point sampling（smoothing 無効）で決定的に縮小する。
 */
const computeSourceHistogram = (
  canvas: HTMLCanvasElement,
): HistogramData | null => {
  const { width, height } = resolveHistogramSampleSize(
    canvas.width,
    canvas.height,
  );
  if (width <= 0 || height <= 0) {
    return null;
  }
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, width, height);
  return computeHistogram(ctx.getImageData(0, 0, width, height).data);
};

/** useEditPreview の返却値 */
export interface EditPreview {
  /** EXIF 補正済みのプレビューソース（未読込・ファイルなしは null） */
  previewSource: HTMLCanvasElement | null;
  /** プレビューソースの寸法 */
  previewSize: { width: number; height: number };
  /** 編集前（カーブ適用前）の輝度ヒストグラム（デコード中は null） */
  sourceHistogram: HistogramData | null;
  /** リストクリア時にプレビュー・ヒストグラムを破棄する */
  resetPreview: () => void;
}

/**
 * 画像切替に合わせて EXIF 補正済みのプレビューソース（キャンバス）と
 * 編集前ヒストグラムを生成する edit ページ固有フック。
 *
 * プレビューソースは WB スポイトが getImageData で近傍を読むため
 * EditableSource ではなく 2D キャンバスに絞って保持する（renderOrientedImage の実返却型）。
 */
export function useEditPreview(
  files: File[],
  currentIndex: number,
): EditPreview {
  const [previewSource, setPreviewSource] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  // トーンカーブ背景用の編集前（カーブ適用前）ヒストグラム。編集後の histogram を流用すると
  // カーブのドラッグで背景の分布自体が動くフィードバックループになるため分離する
  // （HistogramPanel = 適用後のモニタ / カーブ背景 = 入力側の安定した参照、と役割を分ける）
  const [sourceHistogram, setSourceHistogram] = useState<HistogramData | null>(
    null,
  );

  useEffect(() => {
    if (files.length === 0) {
      setPreviewSource(null);
      return;
    }
    const file = files[currentIndex];
    if (!file) {
      return;
    }
    // 新しい画像の読み込み開始時点で編集前ヒストグラムを破棄する。
    // currentIndex は同期的に切り替わる一方 sourceHistogram はデコード完了後に
    // しか更新されないため、破棄しないとデコード中に前の画像の統計で自動補正が押せて
    // しまう（stale 統計の適用）。null の間は autoDisabled が自動補正ボタンを無効化する。
    setSourceHistogram(null);
    let cancelled = false;
    renderOrientedImage(file)
      .then((canvas) => {
        if (cancelled) {
          return;
        }
        setPreviewSource(canvas);
        setPreviewSize({ width: canvas.width, height: canvas.height });
        setSourceHistogram(computeSourceHistogram(canvas));
      })
      .catch((error) => {
        console.error("Preview generation failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [files, currentIndex]);

  const resetPreview = useCallback(() => {
    setPreviewSource(null);
    setSourceHistogram(null);
  }, []);

  return { previewSource, previewSize, sourceHistogram, resetPreview };
}
