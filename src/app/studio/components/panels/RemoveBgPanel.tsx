import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { RemoveBgSettings } from "../../../remove-bg/components/RemoveBgSettings";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./PanelParts.module.css";

interface RemoveBgPanelProps {
  tools: StudioTools;
  compact?: boolean;
}

/** AI 背景除去パネル（RemoveBgSettings 再利用 + 進捗 / キャンセル + 実行フッター） */
export const RemoveBgPanel: React.FC<RemoveBgPanelProps> = ({
  tools,
  compact,
}) => {
  const { t } = useTranslation();
  const { removebg, applyingTool, aiProgress, cancelAi } = tools;
  const isRunning = applyingTool === "removebg";

  return (
    <ToolPanel
      title={t("studio.panel.removebgTitle")}
      description={t("studio.panel.removebgDescription")}
      badge={t("studio.panel.aiBadge")}
      compact={compact}
      footer={
        <Button
          variant="primary"
          onClick={() => void removebg.apply()}
          disabled={applyingTool !== null}
          className={styles.applyButton}
        >
          {t("studio.removebg.run")}
        </Button>
      }
    >
      <RemoveBgSettings
        outputFormat={removebg.outputFormat}
        onOutputFormatChange={removebg.setOutputFormat}
        preserveExif={removebg.preserveExif}
        onPreserveExifChange={removebg.setPreserveExif}
        disabled={isRunning}
      />
      <p className={styles.note}>{t("studio.removebg.transparentPreview")}</p>
      {isRunning && aiProgress && (
        <div className={styles.progressBox}>
          <div className={styles.progressRow}>
            <span>
              {aiProgress.stage === "download"
                ? t("removeBg.preparingModel", { percent: aiProgress.percent })
                : t("removeBg.removingProgress", {
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
            {t("removeBg.cancel")}
          </Button>
        </div>
      )}
    </ToolPanel>
  );
};
