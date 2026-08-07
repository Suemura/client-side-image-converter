import type React from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_UPSCALE_INPUT_DIMENSION,
  type UpscaleScale,
} from "../../../utils/upscaleCore";
import styles from "./UpscaleSettings.module.css";

interface UpscaleSettingsProps {
  scale: UpscaleScale;
  onScaleChange: (scale: UpscaleScale) => void;
  preserveExif: boolean;
  onPreserveExifChange: (preserveExif: boolean) => void;
  /** 処理中は設定変更を無効化する */
  disabled: boolean;
}

/** 拡大倍率の選択肢（表示順） */
const SCALES: { scale: UpscaleScale; labelKey: string }[] = [
  { scale: 2, labelKey: "upscale.scale2x" },
  { scale: 4, labelKey: "upscale.scale4x" },
];

/**
 * 拡大倍率（2x / 4x）と EXIF 保持の設定 UI（RedactToolbar のチップ型単一選択を踏襲）。
 */
export const UpscaleSettings: React.FC<UpscaleSettingsProps> = ({
  scale,
  onScaleChange,
  preserveExif,
  onPreserveExifChange,
  disabled,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.settings}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("upscale.scaleLabel")}</span>
        <div className={styles.buttonRow}>
          {SCALES.map(({ scale: value, labelKey }) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${
                scale === value ? styles.chipActive : ""
              }`}
              onClick={() => onScaleChange(value)}
              aria-pressed={scale === value}
              disabled={disabled}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.options}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={preserveExif}
            onChange={(e) => onPreserveExifChange(e.target.checked)}
            className={styles.checkbox}
            disabled={disabled}
          />
          <span className={styles.checkboxText}>
            {t("upscale.preserveExif")}
          </span>
        </label>
        <div className={styles.helpText}>{t("upscale.preserveExifHelp")}</div>
        <div className={styles.helpText}>{t("upscale.modelNote")}</div>
        <div className={styles.helpText}>
          {t("upscale.sizeLimitNote", { max: MAX_UPSCALE_INPUT_DIMENSION })}
        </div>
      </div>
    </div>
  );
};
