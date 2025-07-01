import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CropResult } from "../../../utils/imageCropper";
import { Button } from "../../../components/Button";
import styles from "./CropPreviewModal.module.css";

interface CropPreviewModalProps {
  cropResult: CropResult;
  originalImageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export const CropPreviewModal: React.FC<CropPreviewModalProps> = ({
  cropResult,
  originalImageUrl,
  isOpen,
  onClose,
  onDownload,
}) => {
  const { t } = useTranslation();
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // クロップされた画像のURLを生成
  useEffect(() => {
    if (cropResult.success) {
      const url = URL.createObjectURL(cropResult.croppedBlob);
      setCroppedImageUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [cropResult]);

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
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    [isDragging],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "unset";
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{t("crop.preview")}</h3>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("fileDetails.close")}
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.comparisonContainer} ref={containerRef}>
            <div className={styles.imageContainer}>
              {/* 元画像 */}
              <img
                src={originalImageUrl}
                alt={t("results.originalImage")}
                className={styles.image}
              />

              {/* クロップ後画像 */}
              <div
                className={styles.overlayImage}
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
              >
                <img
                  src={croppedImageUrl}
                  alt={t("results.croppedImage")}
                  className={styles.image}
                />
              </div>
            </div>

            {/* スライダー */}
            <div
              className={styles.slider}
              style={{ left: `${sliderPosition}%` }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              <div className={styles.sliderLine} />
              <div className={styles.sliderHandle}>
                <div className={styles.sliderIcon}>↔</div>
              </div>
            </div>
          </div>

          <div className={styles.imageInfo}>
            <div className={styles.infoSection}>
              <h4>{t("results.originalImage")}</h4>
              <p>{t("crop.fileName")}: {cropResult.originalFile.name}</p>
              <p>{t("crop.fileSize")}: {(cropResult.originalFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <div className={styles.infoSection}>
              <h4>{t("results.croppedImage")}</h4>
              <p>{t("crop.fileName")}: {cropResult.fileName}</p>
              <p>{t("crop.fileSize")}: {(cropResult.croppedBlob.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <Button variant="primary" onClick={onDownload}>
            {t("crop.downloadCroppedImage")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("fileDetails.close")}
          </Button>
        </div>
      </div>
    </div>
  );
};
