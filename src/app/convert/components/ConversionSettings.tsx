import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { RadioButtonGroup } from "../../../components/RadioButtonGroup";
import type {
  ConversionFormat,
  ConversionMode,
} from "../../../utils/imageConverter";
import styles from "./ConversionSettings.module.css";

export interface ConversionSettings {
  /** 処理モード（"convert": 別形式へ変換 / "optimize": 形式を維持して最適化） */
  mode: ConversionMode;
  targetFormat: ConversionFormat;
  quality: number;
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
  preserveExif: boolean;
  targetFileSizeKB?: number;
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
  const [localTargetFileSize, setLocalTargetFileSize] = useState(
    settings.targetFileSizeKB?.toString() || "",
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

  useEffect(() => {
    setLocalTargetFileSize(settings.targetFileSizeKB?.toString() || "");
  }, [settings.targetFileSizeKB]);

  // 目標ファイルサイズ指定は JPEG / WebP のみ対応（PNG は可逆・AVIF は WASM が低速なため）
  const supportsTargetSize =
    settings.targetFormat === "jpeg" || settings.targetFormat === "webp";
  // 有効な目標サイズが入力されている場合は品質を自動調整するため、品質入力を無効化する
  const targetSizeActive =
    supportsTargetSize &&
    settings.targetFileSizeKB !== undefined &&
    settings.targetFileSizeKB > 0;

  // EXIF 保持は JPEG / PNG / WebP で対応（AVIF はメタデータ書き込み非対応）
  const canPreserveExif = settings.targetFormat !== "avif";

  // value に型注釈を付け、選択肢と ConversionFormat の整合を型で担保する
  const formatOptions: { label: string; value: ConversionFormat }[] = [
    { label: "JPEG", value: "jpeg" },
    { label: "PNG", value: "png" },
    { label: "WebP", value: "webp" },
    { label: "AVIF", value: "avif" },
  ];

  const isOptimize = settings.mode === "optimize";

  const modeOptions: { label: string; value: ConversionMode }[] = [
    { label: t("convert.modeConvert"), value: "convert" },
    { label: t("convert.modeOptimize"), value: "optimize" },
  ];

  const handleModeChange = (mode: string) => {
    onSettingsChange({
      ...settings,
      mode: mode as ConversionMode,
    });
  };

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

  const handleTargetFileSizeChange = useCallback(
    (value: string) => {
      setLocalTargetFileSize(value);
      const numeric = Number.parseInt(value, 10);
      // 正の整数のみ有効な目標サイズとして扱い、それ以外（空・0・NaN）は未指定にする
      onSettingsChange({
        ...settings,
        targetFileSizeKB:
          !Number.isNaN(numeric) && numeric > 0 ? numeric : undefined,
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

      <h3 className={styles.sectionTitle}>{t("convert.mode")}</h3>

      <RadioButtonGroup
        name="conversionMode"
        options={modeOptions}
        selectedValue={settings.mode}
        onChange={handleModeChange}
      />

      {isOptimize && (
        <div className={styles.helpText}>
          {t("convert.optimizeDescription")}
        </div>
      )}

      {isOptimize ? null : (
        <>
          <h3 className={styles.sectionTitle}>{t("convert.targetFormat")}</h3>

          <RadioButtonGroup
            name="targetFormat"
            options={formatOptions}
            selectedValue={settings.targetFormat}
            onChange={handleFormatChange}
          />

          <h3 className={styles.sectionTitle}>
            {t("convert.qualitySettings")}
          </h3>

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
              disabled={targetSizeActive}
            />
          </div>

          <div className={styles.helpText}>
            {targetSizeActive
              ? t("convert.qualityDisabledByTargetSize")
              : settings.targetFormat === "png"
                ? t("convert.pngQualityHelp")
                : t("convert.qualityDescription")}
          </div>

          <h3 className={styles.sectionTitle}>{t("convert.targetFileSize")}</h3>

          <div className={styles.inputGroup}>
            <Input
              label={t("convert.targetFileSizeLabel")}
              value={localTargetFileSize}
              onChange={handleTargetFileSizeChange}
              placeholder={t("convert.auto")}
              type="number"
              disabled={!supportsTargetSize}
            />
          </div>

          <div className={styles.helpText}>
            {supportsTargetSize
              ? t("convert.targetFileSizeHelp")
              : t("convert.targetFileSizeUnsupported")}
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

          <h3 className={styles.sectionTitle}>
            {t("convert.metadataSettings")}
          </h3>

          <div className={styles.checkboxContainer}>
            <label
              className={`${styles.checkboxLabel} ${canPreserveExif ? "" : styles.checkboxDisabled}`}
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
                disabled={!canPreserveExif}
                className={styles.checkbox}
              />
              <span className={styles.checkboxText}>
                {t("convert.preserveExif")}
              </span>
            </label>
          </div>
          <div className={styles.helpText}>
            {canPreserveExif
              ? t("convert.preserveExifHelp")
              : t("convert.preserveExifUnsupported")}
          </div>
        </>
      )}

      <div className={styles.buttonContainer}>
        <Button
          variant="primary"
          size="medium"
          onClick={onConvert}
          disabled={!hasFiles || isConverting}
        >
          {isConverting
            ? isOptimize
              ? t("convert.optimizing")
              : t("convert.converting")
            : isOptimize
              ? t("convert.optimize")
              : t("convert.convert")}
        </Button>
      </div>
    </div>
  );
};
