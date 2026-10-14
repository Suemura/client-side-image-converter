import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { resolveOutputSize } from "../../../../utils/upscaleCore";
import { UpscaleSettings } from "../../../upscale/components/UpscaleSettings";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./PanelParts.module.css";

interface UpscalePanelProps {
  tools: StudioTools;
  /** 現在画像の寸法（未読込は 0）。出力解像度プレビューに使う */
  previewSize: { width: number; height: number };
  compact?: boolean;
}

/** AI アップスケールパネル（UpscaleSettings 再利用 + 進捗 / キャンセル + 実行フッター） */
export const UpscalePanel: React.FC<UpscalePanelProps> = ({
  tools,
  previewSize,
  compact,
}) => {
  const { t } = useTranslation();
  const { upscale, applyingTool, aiProgress, cancelAi } = tools;
  const isRunning = applyingTool === "upscale";

  const outputSize =
    previewSize.width > 0
      ? resolveOutputSize(previewSize.width, previewSize.height, upscale.scale)
      : null;

  return (
    <ToolPanel
      title={t("studio.panel.upscaleTitle")}
      description={t("studio.panel.upscaleDescription")}
      badge={t("studio.panel.aiBadge")}
      compact={compact}
      footer={
        <Button
          variant="primary"
          onClick={() => void upscale.apply()}
          disabled={applyingTool !== null}
          className={styles.applyButton}
        >
          {t("studio.upscale.run")}
        </Button>
      }
    >
      <UpscaleSettings
        scale={upscale.scale}
        onScaleChange={upscale.setScale}
        preserveExif={upscale.preserveExif}
        onPreserveExifChange={upscale.setPreserveExif}
        disabled={isRunning}
      />
      {outputSize && (
        <p className={styles.sizeRow}>
          {previewSize.width}×{previewSize.height} →{" "}
          <b>
            {outputSize.width}×{outputSize.height}
          </b>
        </p>
      )}
      {isRunning && aiProgress && (
        <div className={styles.progressBox}>
          <div className={styles.progressRow}>
            <span>
              {aiProgress.stage === "download"
                ? t("upscale.preparingModel", { percent: aiProgress.percent })
                : t("upscale.upscalingProgress", {
                    current: aiProgress.currentFile,
                    total: aiProgress.totalFiles,
                  })}
            </span>
            <span>{aiProgress.percent}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${aiProgress.percent}%` }}
            />
          </div>
          <Button variant="secondary" onClick={cancelAi}>
            {t("upscale.cancel")}
          </Button>
        </div>
      )}
    </ToolPanel>
  );
};
