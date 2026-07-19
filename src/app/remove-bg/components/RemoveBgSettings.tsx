import type React from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_REMOVE_BG_INPUT_DIMENSION,
  type RemoveBgOutputFormat,
} from "../../../utils/removeBgCore";
import styles from "./RemoveBgSettings.module.css";

interface RemoveBgSettingsProps {
  outputFormat: RemoveBgOutputFormat;
  onOutputFormatChange: (format: RemoveBgOutputFormat) => void;
  preserveExif: boolean;
  onPreserveExifChange: (preserveExif: boolean) => void;
  /** 処理中は設定変更を無効化する */
  disabled: boolean;
}

/** 出力形式の選択肢（表示順） */
const FORMATS: { format: RemoveBgOutputFormat; labelKey: string }[] = [
  { format: "png", labelKey: "removeBg.formatPng" },
  { format: "webp", labelKey: "removeBg.formatWebp" },
];

/**
 * 出力形式（PNG / WebP）と EXIF 保持の設定 UI（UpscaleSettings のチップ型単一選択を踏襲）。
 */
export const RemoveBgSettings: React.FC<RemoveBgSettingsProps> = ({
  outputFormat,
  onOutputFormatChange,
  preserveExif,
  onPreserveExifChange,
  disabled,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.settings}>
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("removeBg.formatLabel")}</span>
        <div className={styles.buttonRow}>
          {FORMATS.map(({ format: value, labelKey }) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${
                outputFormat === value ? styles.chipActive : ""
              }`}
              onClick={() => onOutputFormatChange(value)}
              aria-pressed={outputFormat === value}
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
            {t("removeBg.preserveExif")}
          </span>
        </label>
        <div className={styles.helpText}>{t("removeBg.preserveExifHelp")}</div>
        <div className={styles.helpText}>{t("removeBg.transparentNote")}</div>
        <div className={styles.helpText}>{t("removeBg.modelNote")}</div>
        <div className={styles.helpText}>
          {t("removeBg.sizeLimitNote", { max: MAX_REMOVE_BG_INPUT_DIMENSION })}
        </div>
      </div>
    </div>
  );
};
