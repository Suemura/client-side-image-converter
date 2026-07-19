"use client";

import { useCallback, useState } from "react";

/** useImageNavigation の返却値 */
export interface ImageNavigation {
  /** 現在表示中の画像インデックス */
  currentIndex: number;
  /** インデックスを直接設定する（クリア時の 0 リセット等） */
  setCurrentIndex: (index: number) => void;
  /** 前の画像へ（先頭では末尾へ循環） */
  handlePrevious: () => void;
  /** 次の画像へ（末尾では先頭へ循環） */
  handleNext: () => void;
}

/**
 * プレビューの前後画像ナビゲーション（循環）を管理する汎用フック。
 * crop / edit で同一実装だった handlePreviousImage / handleNextImage を一元化する。
 */
export function useImageNavigation(totalImages: number): ImageNavigation {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrevious = useCallback(() => {
    if (totalImages === 0) return;
    setCurrentIndex((i) => (i > 0 ? i - 1 : totalImages - 1));
  }, [totalImages]);

  const handleNext = useCallback(() => {
    if (totalImages === 0) return;
    setCurrentIndex((i) => (i < totalImages - 1 ? i + 1 : 0));
  }, [totalImages]);

  return { currentIndex, setCurrentIndex, handlePrevious, handleNext };
}
