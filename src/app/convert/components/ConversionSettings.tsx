import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { RadioButtonGroup } from "../../../components/RadioButtonGroup";

export interface ConversionSettings {
  targetFormat: "jpeg" | "png" | "webp";
  quality: number;
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
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

  const formatOptions = [
    { label: "JPEG", value: "jpeg" },
    { label: "PNG", value: "png" },
    { label: "WebP", value: "webp" },
  ];

  const handleFormatChange = (format: string) => {
    onSettingsChange({
      ...settings,
      targetFormat: format as "jpeg" | "png" | "webp",
    });
  };

  const handleQualityChange = (quality: string) => {
    const numericQuality = Number.parseInt(quality) || 90;
    onSettingsChange({
      ...settings,
      quality: Math.min(100, Math.max(1, numericQuality)),
    });
  };

  const handleWidthChange = (width: string) => {
    const numericWidth = Number.parseInt(width) || undefined;
    onSettingsChange({
      ...settings,
      width: numericWidth,
    });
  };

  const handleHeightChange = (height: string) => {
    const numericHeight = Number.parseInt(height) || undefined;
    onSettingsChange({
      ...settings,
      height: numericHeight,
    });
  };

  const handleAspectRatioToggle = () => {
    onSettingsChange({
      ...settings,
      maintainAspectRatio: !settings.maintainAspectRatio,
    });
  };

  return (
    <div className="flex flex-col flex-1" style={{ maxWidth: "960px" }}>
      <h2
        className="text-28 font-bold px-4 text-left pb-3 pt-5"
        style={{
          color: "var(--foreground)",
          letterSpacing: "-0.02em",
        }}
      >
        {t("convert.title")}
      </h2>

      <h3
        className="text-lg font-bold px-4 pb-2 pt-4"
        style={{
          color: "var(--foreground)",
          letterSpacing: "-0.015em",
        }}
      >
        {t("convert.targetFormat")}
      </h3>

      <RadioButtonGroup
        name="targetFormat"
        options={formatOptions}
        selectedValue={settings.targetFormat}
        onChange={handleFormatChange}
      />

      <h3
        className="text-lg font-bold px-4 pb-2 pt-4"
        style={{
          color: "var(--foreground)",
          letterSpacing: "-0.015em",
        }}
      >
        {t("convert.qualitySettings")}
      </h3>

      <div
        className="flex items-end gap-4 px-4 py-3"
        style={{ maxWidth: "480px", flexWrap: "wrap" }}
      >
        <Input
          label={t("convert.quality")}
          value={settings.quality.toString()}
          onChange={handleQualityChange}
          placeholder="90"
          type="number"
        />
      </div>

      <h3
        className="text-lg font-bold px-4 pb-2 pt-4"
        style={{
          color: "var(--foreground)",
          letterSpacing: "-0.015em",
        }}
      >
        {t("convert.imageSize")}
      </h3>

      <div
        className="flex items-end gap-4 px-4 py-3"
        style={{ maxWidth: "480px", flexWrap: "wrap" }}
      >
        <Input
          label={t("convert.width")}
          value={settings.width?.toString() || ""}
          onChange={handleWidthChange}
          placeholder={t("convert.auto")}
          type="number"
        />
        <Input
          label={t("convert.height")}
          value={settings.height?.toString() || ""}
          onChange={handleHeightChange}
          placeholder={t("convert.auto")}
          type="number"
        />
      </div>

      <div className="px-4 py-2">
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={settings.maintainAspectRatio}
            onChange={handleAspectRatioToggle}
            style={{
              width: "16px",
              height: "16px",
              accentColor: "var(--primary)",
            }}
          />
          <span style={{ fontSize: "14px", color: "var(--foreground)" }}>
            {t("convert.maintainAspectRatio")}
          </span>
        </label>
      </div>

      <div className="flex px-4 py-3 justify-end">
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
