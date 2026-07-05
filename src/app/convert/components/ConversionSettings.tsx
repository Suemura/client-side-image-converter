import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { RadioButtonGroup } from "../../../components/RadioButtonGroup";
import type { ConversionFormat } from "../../../utils/imageConverter";
import styles from "./ConversionSettings.module.css";

export interface ConversionSettings {
  targetFormat: ConversionFormat;
  quality: number;
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
  preserveExif: boolean;
}

interface ConversionSettingsProps {
  settings: ConversionSettings;
  onSettingsChange: (settings: ConversionSettings) => void;
  onConvert: () => void;
  isConverting?: boolean;
  hasFiles?: boolean;
}

export const ConversionSettings: React.FC<ConversionSettingsProps> = ({
  settings,
  onSettingsChange,
  onConvert,
  isConverting = false,
  hasFiles = false,
}) => {
  const { t } = useTranslation();

  // ローカル状態で入力値を管理
  const [localQuality, setLocalQuality] = useState(settings.quality.toString());
  const [localWidth, setLocalWidth] = useState(
    settings.width?.toString() || "",
  );
  const [localHeight, setLocalHeight] = useState(
    settings.height?.toString() || "",
  );

  // 外部のsettingsが変更された時にローカル状態を同期
  useEffect(() => {
    setLocalQuality(settings.quality.toString());
  }, [settings.quality]);

  useEffect(() => {
    setLocalWidth(settings.width?.toString() || "");
  }, [settings.width]);

  useEffect(() => {
    setLocalHeight(settings.height?.toString() || "");
  }, [settings.height]);

  // value に型注釈を付け、選択肢と ConversionFormat の整合を型で担保する
  const formatOptions: { label: string; value: ConversionFormat }[] = [
    { label: "JPEG", value: "jpeg" },
    { label: "PNG", value: "png" },
    { label: "WebP", value: "webp" },
    { label: "AVIF", value: "avif" },
  ];

  const handleFormatChange = (format: string) => {
    onSettingsChange({
      ...settings,
      targetFormat: format as ConversionFormat,
    });
  };

  const handleQualityChange = useCallback(
    (quality: string) => {
      setLocalQuality(quality);

      // 空文字列の場合はローカル状態のみ更新し、onSettingsChangeは呼ばない
      if (quality === "") {
        return;
      }

      const numericQuality = Number.parseInt(quality, 10);
      // 有効な数値の場合のみ更新
      if (!Number.isNaN(numericQuality)) {
        onSettingsChange({
          ...settings,
          quality: Math.min(100, Math.max(1, numericQuality)),
        });
      }
    },
    [settings, onSettingsChange],
  );

  const handleWidthChange = useCallback(
    (width: string) => {
      setLocalWidth(width);
      const numericWidth = Number.parseInt(width, 10) || undefined;
      onSettingsChange({
        ...settings,
        width: numericWidth,
      });
    },
    [settings, onSettingsChange],
  );

  const handleHeightChange = useCallback(
    (height: string) => {
      setLocalHeight(height);
      const numericHeight = Number.parseInt(height, 10) || undefined;
      onSettingsChange({
        ...settings,
        height: numericHeight,
      });
    },
    [settings, onSettingsChange],
  );

  const handleAspectRatioToggle = () => {
    onSettingsChange({
      ...settings,
      maintainAspectRatio: !settings.maintainAspectRatio,
    });
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t("convert.title")}</h2>

      <h3 className={styles.sectionTitle}>{t("convert.targetFormat")}</h3>

      <RadioButtonGroup
        name="targetFormat"
        options={formatOptions}
        selectedValue={settings.targetFormat}
        onChange={handleFormatChange}
      />

      <h3 className={styles.sectionTitle}>{t("convert.qualitySettings")}</h3>

      {settings.targetFormat === "png" && (
        <div className={styles.warningBox}>
          <p className={styles.warningText}>
            💡 {t("convert.pngQualityExperimental")}
          </p>
        </div>
      )}

      <div className={styles.inputGroup}>
        <Input
          label={t("convert.quality")}
          value={localQuality}
          onChange={handleQualityChange}
          placeholder="90"
          type="number"
        />
      </div>

      <div className={styles.helpText}>
        {settings.targetFormat === "png"
          ? t("convert.pngQualityHelp")
          : t("convert.qualityDescription")}
      </div>

      <h3 className={styles.sectionTitle}>{t("convert.imageSize")}</h3>

      <div className={styles.inputGroup}>
        <Input
          label={t("convert.width")}
          value={localWidth}
          onChange={handleWidthChange}
          placeholder={t("convert.auto")}
          type="number"
        />
        <Input
          label={t("convert.height")}
          value={localHeight}
          onChange={handleHeightChange}
          placeholder={t("convert.auto")}
          type="number"
        />
      </div>

      <div className={styles.checkboxContainer}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.maintainAspectRatio}
            onChange={handleAspectRatioToggle}
            className={styles.checkbox}
          />
          <span className={styles.checkboxText}>
            {t("convert.maintainAspectRatio")}
          </span>
        </label>
      </div>

      <h3 className={styles.sectionTitle}>{t("convert.metadataSettings")}</h3>

      <div className={styles.checkboxContainer}>
        <label
          className={`${styles.checkboxLabel} ${settings.targetFormat !== "jpeg" ? styles.checkboxDisabled : ""}`}
        >
          <input
            type="checkbox"
            checked={settings.preserveExif}
            onChange={() =>
              onSettingsChange({
                ...settings,
                preserveExif: !settings.preserveExif,
              })
            }
            disabled={settings.targetFormat !== "jpeg"}
            className={styles.checkbox}
          />
          <span className={styles.checkboxText}>
            {t("convert.preserveExif")}
          </span>
        </label>
      </div>
      <div className={styles.helpText}>
        {settings.targetFormat === "jpeg"
          ? t("convert.preserveExifHelp")
          : t("convert.preserveExifJpegOnly")}
      </div>

      <div className={styles.buttonContainer}>
        <Button
          variant="primary"
          size="medium"
          onClick={onConvert}
          disabled={!hasFiles || isConverting}
        >
          {isConverting ? t("convert.converting") : t("convert.convert")}
        </Button>
      </div>
    </div>
  );
};
