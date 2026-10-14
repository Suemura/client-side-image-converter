import type React from "react";
import { useTranslation } from "react-i18next";
import { RadioButtonGroup } from "../../../components/RadioButtonGroup";
import type { EditOutputFormat } from "../../../utils/imageEditor";
import styles from "./EditToolbar.module.css";

interface EditToolbarProps {
  /** 適用範囲（全画像一括 / 画像ごと）。複数画像時のみ表示 */
  applyToAll: boolean;
  onApplyModeChange: (applyToAll: boolean) => void;
  showApplyMode: boolean;
  /** 出力フォーマット */
  outputFormat: EditOutputFormat;
  onOutputFormatChange: (format: EditOutputFormat) => void;
  /** EXIF 保持 */
  preserveExif: boolean;
  onPreserveExifChange: (preserve: boolean) => void;
  /** 全体リセット */
  onResetAll: () => void;
  /** 調整があるか（全体リセットボタンの活性判定） */
  hasAdjustments: boolean;
}

/**
 * 画像編集のツールバー（適用範囲トグル・出力フォーマット・EXIF 保持・全体リセット）。
 * 適用範囲トグルは `CropToolbar` のチップ UI を踏襲する。
 */
export const EditToolbar: React.FC<EditToolbarProps> = ({
  applyToAll,
  onApplyModeChange,
  showApplyMode,
  outputFormat,
  onOutputFormatChange,
  preserveExif,
  onPreserveExifChange,
  onResetAll,
  hasAdjustments,
}) => {
  const { t } = useTranslation();

  // AVIF はメタデータ書き込み非対応（既存 convert / crop と同基準）
  const canPreserveExif = outputFormat !== "avif";

  const formatOptions: { label: string; value: EditOutputFormat }[] = [
    { label: t("edit.formatOriginal"), value: "original" },
    { label: "JPEG", value: "jpeg" },
    { label: "PNG", value: "png" },
    { label: "WebP", value: "webp" },
    { label: "AVIF", value: "avif" },
  ];

  return (
    <div className={styles.toolbar}>
      {showApplyMode && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>{t("crop.applyMode")}</span>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={`${styles.chip} ${applyToAll ? styles.chipActive : ""}`}
              onClick={() => onApplyModeChange(true)}
              aria-pressed={applyToAll}
            >
              {t("crop.applyToAll")}
            </button>
            <button
              type="button"
              className={`${styles.chip} ${!applyToAll ? styles.chipActive : ""}`}
              onClick={() => onApplyModeChange(false)}
              aria-pressed={!applyToAll}
            >
              {t("crop.perImage")}
            </button>
          </div>
          <p className={styles.help}>{t("edit.applyModeHelp")}</p>
        </div>
      )}

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("edit.outputFormat")}</span>
        <RadioButtonGroup
          name="editOutputFormat"
          options={formatOptions}
          selectedValue={outputFormat}
          onChange={(value) => onOutputFormatChange(value as EditOutputFormat)}
        />
      </div>

      <div className={styles.group}>
        <label
          className={`${styles.checkboxLabel} ${canPreserveExif ? "" : styles.checkboxDisabled}`}
        >
          <input
            type="checkbox"
            checked={preserveExif && canPreserveExif}
            onChange={() => onPreserveExifChange(!preserveExif)}
            disabled={!canPreserveExif}
            className={styles.checkbox}
          />
          <span className={styles.checkboxText}>{t("edit.preserveExif")}</span>
        </label>
        <p className={styles.help}>
          {canPreserveExif
            ? t("edit.preserveExifHelp")
            : t("edit.preserveExifUnsupported")}
        </p>
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={styles.resetAll}
          onClick={onResetAll}
          disabled={!hasAdjustments}
        >
          {t("edit.resetAll")}
        </button>
      </div>
    </div>
  );
};
