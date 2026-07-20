import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { RedactToolbar } from "../../../redact/components/RedactToolbar";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./PanelParts.module.css";

interface RetouchPanelProps {
  tools: StudioTools;
  compact?: boolean;
}

/** レタッチパネル（RedactToolbar 再利用 + 領域数 + 適用フッター） */
export const RetouchPanel: React.FC<RetouchPanelProps> = ({
  tools,
  compact,
}) => {
  const { t } = useTranslation();
  const { retouch, applyingTool } = tools;

  return (
    <ToolPanel
      title={t("studio.panel.retouchTitle")}
      description={t("studio.panel.retouchDescription")}
      compact={compact}
      footer={
        <Button
          variant="primary"
          onClick={() => void retouch.apply()}
          disabled={!retouch.canApply || applyingTool !== null}
          className={styles.applyButton}
        >
          {t("studio.retouch.apply")}
        </Button>
      }
    >
      <RedactToolbar
        redactStyle={retouch.style}
        onStyleChange={retouch.setStyle}
        regionCount={retouch.currentRegions.length}
        onClearRegions={retouch.clearRegions}
      />
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={retouch.preserveExif}
          onChange={(event) => retouch.setPreserveExif(event.target.checked)}
          className={styles.checkbox}
        />
        <span>{t("redact.preserveExif")}</span>
      </label>
    </ToolPanel>
  );
};
