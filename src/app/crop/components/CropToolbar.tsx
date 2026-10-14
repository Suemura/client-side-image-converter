import type React from "react";
import { useTranslation } from "react-i18next";
import {
  ASPECT_RATIO_PRESETS,
  type CropTransform,
} from "../../../utils/cropGeometry";
import styles from "./CropToolbar.module.css";

interface CropToolbarProps {
  /** 選択中のアスペクト比プリセット id（"free" / "1:1" など） */
  aspectRatioId: string;
  onAspectRatioChange: (id: string) => void;
  /** 現在の回転・反転状態 */
  transform: CropTransform;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onToggleFlipHorizontal: () => void;
  onToggleFlipVertical: () => void;
  /** 適用範囲（全画像一括 / 画像ごと）の切替。複数画像時のみ表示 */
  applyToAll: boolean;
  onApplyModeChange: (applyToAll: boolean) => void;
  showApplyMode: boolean;
}

export const CropToolbar: React.FC<CropToolbarProps> = ({
  aspectRatioId,
  onAspectRatioChange,
  transform,
  onRotateLeft,
  onRotateRight,
  onToggleFlipHorizontal,
  onToggleFlipVertical,
  applyToAll,
  onApplyModeChange,
  showApplyMode,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.toolbar}>
      {/* アスペクト比プリセット */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("crop.aspectRatio")}</span>
        <div className={styles.buttonRow}>
          {ASPECT_RATIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`${styles.chip} ${
                aspectRatioId === preset.id ? styles.chipActive : ""
              }`}
              onClick={() => onAspectRatioChange(preset.id)}
              aria-pressed={aspectRatioId === preset.id}
            >
              {preset.id === "free" ? t("crop.aspectFree") : preset.id}
            </button>
          ))}
        </div>
      </div>

      {/* 回転・反転 */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("crop.transform")}</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRotateLeft}
            aria-label={t("crop.rotateLeft")}
            title={t("crop.rotateLeft")}
          >
            ↺
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onRotateRight}
            aria-label={t("crop.rotateRight")}
            title={t("crop.rotateRight")}
          >
            ↻
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${
              transform.flipHorizontal ? styles.iconButtonActive : ""
            }`}
            onClick={onToggleFlipHorizontal}
            aria-label={t("crop.flipHorizontal")}
            aria-pressed={transform.flipHorizontal}
            title={t("crop.flipHorizontal")}
          >
            ⇆
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${
              transform.flipVertical ? styles.iconButtonActive : ""
            }`}
            onClick={onToggleFlipVertical}
            aria-label={t("crop.flipVertical")}
            aria-pressed={transform.flipVertical}
            title={t("crop.flipVertical")}
          >
            ⇅
          </button>
        </div>
      </div>

      {/* 適用範囲（全画像一括 / 画像ごと） */}
      {showApplyMode && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>{t("crop.applyMode")}</span>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${styles.chip} ${
                applyToAll ? styles.chipActive : ""
              }`}
              onClick={() => onApplyModeChange(true)}
              aria-pressed={applyToAll}
            >
              {t("crop.applyToAll")}
            </button>
            <button
              type="button"
              className={`${styles.chip} ${
                !applyToAll ? styles.chipActive : ""
              }`}
              onClick={() => onApplyModeChange(false)}
              aria-pressed={!applyToAll}
            >
              {t("crop.perImage")}
            </button>
          </div>
          <p className={styles.help}>{t("crop.applyModeHelp")}</p>
        </div>
      )}
    </div>
  );
};
