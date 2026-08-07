import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFileSize } from "../utils/fileName";
import { calculateCompressionRatio } from "../utils/imageConverter";
import { Button } from "./Button";
import styles from "./ImageComparisonModal.module.css";

/**
 * 処理前後の画像をスライダーで見比べる共通モーダル。
 * 変換（ConversionResult）・トリミング / レタッチ / 拡大（CropResult）のどちらの
 * 結果形式にも依存しない中立な props を受け取り、呼び出し側（Results.tsx）が
 * それぞれの結果から URL・サイズ・ダウンロード処理を組み立てて渡す。
 */
interface ImageComparisonModalProps {
  fileName: string;
  /** 処理前画像の URL（空文字なら表示しない） */
  originalImageUrl: string;
  /** 処理後画像の URL */
  resultImageUrl: string;
  originalSize: number;
  resultSize: number;
  /**
   * サイズ削減率バッジを表示するか（変換 / 最適化用）。
   * 拡大などサイズ増が前提のツールでは false にしてノイズを避ける。
   */
  showCompressionRatio?: boolean;
  /** 処理後側のラベル（未指定は「変換後」= comparison.converted） */
  resultLabel?: string;
  onDownload: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageComparisonModal: React.FC<ImageComparisonModalProps> = ({
  fileName,
  originalImageUrl,
  resultImageUrl,
  originalSize,
  resultSize,
  showCompressionRatio = true,
  resultLabel,
  onDownload,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    [isDragging],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // マウスイベントをドキュメントレベルで処理
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    isDragging,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // モーダルが開いている間は背景のスクロールを無効化
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleDownload = useCallback(() => {
    onDownload();
  }, [onDownload]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isOpen || !originalImageUrl) return null;

  const compressionRatio = calculateCompressionRatio(originalSize, resultSize);

  return (
    <div className={styles.modalOverlay} onClick={handleBackdropClick}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>{fileName}</h3>
            <div className={styles.modalSubtitle}>
              <span className={styles.fileSizeText}>
                {formatFileSize(originalSize)} → {formatFileSize(resultSize)}
              </span>
              {showCompressionRatio && (
                <span
                  className={`${styles.compressionRatio} ${
                    compressionRatio > 0
                      ? styles.compressionRatioPositive
                      : styles.compressionRatioNegative
                  }`}
                >
                  {compressionRatio > 0 ? "-" : "+"}
                  {Math.abs(compressionRatio)}%
                </span>
              )}
            </div>
          </div>
          <div className={styles.buttonGroup}>
            <Button variant="primary" onClick={handleDownload}>
              {t("results.download")}
            </Button>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t("common.close")}
            >
              ×
            </button>
          </div>
        </div>

        {/* 画像比較エリア */}
        <div className={styles.imageComparisonArea}>
          <div
            ref={containerRef}
            className={`${styles.comparisonContainer} ${
              isDragging
                ? styles.comparisonContainerDragging
                : styles.comparisonContainerIdle
            }`}
          >
            {/* 処理後の画像（背景） */}
            <img
              src={resultImageUrl}
              alt={`${fileName} (result)`}
              className={styles.backgroundImage}
              draggable={false}
            />

            {/* 処理前の画像（クリップされる）。clipPath はスライダー位置から計算される
                動的値のため style 経由で渡す（DESIGN.md「例外: 動的値の style 属性渡し」） */}
            <div
              className={styles.foregroundImageContainer}
              style={{
                clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
              }}
            >
              <img
                src={originalImageUrl}
                alt={`${fileName} (original)`}
                className={styles.foregroundImage}
                draggable={false}
              />
            </div>

            {/* スライダーライン。left はドラッグ位置から計算される動的値のため
                style 経由で渡す（DESIGN.md「例外: 動的値の style 属性渡し」） */}
            <div
              className={styles.sliderLine}
              style={{
                left: `${sliderPosition}%`,
              }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              {/* スライダーハンドル */}
              <div className={styles.sliderHandle}>
                <div className={styles.sliderHandleDot} />
              </div>
            </div>

            {/* ラベル */}
            <div className={`${styles.imageLabel} ${styles.imageLabelLeft}`}>
              {t("comparison.original")}
            </div>
            <div className={`${styles.imageLabel} ${styles.imageLabelRight}`}>
              {resultLabel ?? t("comparison.converted")}
            </div>
          </div>

          {/* 操作説明 */}
          <p className={styles.instruction}>{t("comparison.instruction")}</p>
        </div>
      </div>
    </div>
  );
};
