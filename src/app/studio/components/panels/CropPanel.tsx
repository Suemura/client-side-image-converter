import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { rotateLeft, rotateRight } from "../../../../utils/cropGeometry";
import { CropToolbar } from "../../../crop/components/CropToolbar";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./PanelParts.module.css";

interface CropPanelProps {
  tools: StudioTools;
  imageCount: number;
  compact?: boolean;
}

/** 切り抜きパネル（CropToolbar 再利用 + EXIF 保持 + 適用フッター） */
export const CropPanel: React.FC<CropPanelProps> = ({
  tools,
  imageCount,
  compact,
}) => {
  const { t } = useTranslation();
  const { crop, applyingTool, applyToAll, setApplyToAllMode } = tools;
  const transform = crop.currentTransform;

  const handleRotateLeft = useCallback(() => {
    crop.setCurrentTransform(
      { ...transform, rotation: rotateLeft(transform.rotation) },
      true,
    );
  }, [crop.setCurrentTransform, transform]);

  const handleRotateRight = useCallback(() => {
    crop.setCurrentTransform(
      { ...transform, rotation: rotateRight(transform.rotation) },
      true,
    );
  }, [crop.setCurrentTransform, transform]);

  const handleFlipHorizontal = useCallback(() => {
    crop.setCurrentTransform({
      ...transform,
      flipHorizontal: !transform.flipHorizontal,
    });
  }, [crop.setCurrentTransform, transform]);

  const handleFlipVertical = useCallback(() => {
    crop.setCurrentTransform({
      ...transform,
      flipVertical: !transform.flipVertical,
    });
  }, [crop.setCurrentTransform, transform]);

  return (
    <ToolPanel
      title={t("studio.panel.cropTitle")}
      description={t("studio.panel.cropDescription")}
      compact={compact}
      footer={
        <>
          <Button variant="secondary" onClick={crop.reset}>
            {t("studio.crop.reset")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void crop.apply()}
            disabled={!crop.canApply || applyingTool !== null}
            className={styles.applyButton}
          >
            {t("studio.crop.apply")}
          </Button>
        </>
      }
    >
      <CropToolbar
        aspectRatioId={crop.aspectRatioId}
        onAspectRatioChange={crop.setAspectRatioId}
        transform={transform}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onToggleFlipHorizontal={handleFlipHorizontal}
        onToggleFlipVertical={handleFlipVertical}
        applyToAll={applyToAll}
        onApplyModeChange={setApplyToAllMode}
        showApplyMode={imageCount > 1}
      />
      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={crop.preserveExif}
          onChange={(event) => crop.setPreserveExif(event.target.checked)}
          className={styles.checkbox}
        />
        <span>{t("crop.preserveExif")}</span>
      </label>
    </ToolPanel>
  );
};
