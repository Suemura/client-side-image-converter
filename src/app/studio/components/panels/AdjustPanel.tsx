import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { AdjustmentPanel } from "../../../edit/components/AdjustmentPanel";
import { LutPicker } from "../../../edit/components/LutPicker";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./PanelParts.module.css";

interface AdjustPanelProps {
  tools: StudioTools;
  /** 自動補正（オートレベル / 自動 WB / WB スポイト）のハンドラ（page が所有） */
  onAutoLevels: () => void;
  onAutoWhiteBalance: () => void;
  onToggleEyedropper: () => void;
  eyedropperActive: boolean;
  autoDisabled: boolean;
  /** LUT サムネイルのベースにする現在画像（EXIF 補正済み。null は固定グラデーション） */
  previewSource: HTMLCanvasElement | null;
  compact?: boolean;
}

/** 調整パネル（AdjustmentPanel / LutPicker 再利用 + 確定フッター） */
export const AdjustPanel: React.FC<AdjustPanelProps> = ({
  tools,
  onAutoLevels,
  onAutoWhiteBalance,
  onToggleEyedropper,
  eyedropperActive,
  autoDisabled,
  previewSource,
  compact,
}) => {
  const { t } = useTranslation();
  const { adjust, applyingTool } = tools;
  const { scopeStores, lutRegistry } = adjust;

  return (
    <ToolPanel
      title={t("studio.panel.adjustTitle")}
      description={t("studio.panel.adjustDescription")}
      compact={compact}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={adjust.reset}
            disabled={!adjust.canApply}
          >
            {t("studio.adjust.reset")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void adjust.apply()}
            disabled={!adjust.canApply || applyingTool !== null}
            className={styles.applyButton}
          >
            {t("studio.adjust.confirm")}
          </Button>
        </>
      }
    >
      <LutPicker
        selection={scopeStores.lut.current}
        onSelectionChange={scopeStores.lut.setCurrent}
        registerLut={lutRegistry.registerLut}
        customName={lutRegistry.customLutName}
        onCustomLoaded={lutRegistry.setCustomLutName}
        previewSource={previewSource}
      />
      <AdjustmentPanel
        adjustments={scopeStores.adjustments.current}
        onAdjustmentsChange={scopeStores.adjustments.setCurrent}
        onAutoLevels={onAutoLevels}
        onAutoWhiteBalance={onAutoWhiteBalance}
        onToggleEyedropper={onToggleEyedropper}
        eyedropperActive={eyedropperActive}
        autoDisabled={autoDisabled}
      />
      <p className={styles.note}>{t("studio.adjust.confirmHelp")}</p>
    </ToolPanel>
  );
};
