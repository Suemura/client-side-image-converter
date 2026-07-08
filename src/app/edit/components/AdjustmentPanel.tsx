import type React from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../../components/Slider";
import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_MIN,
  type AdjustmentKey,
  type AdjustmentState,
  COLOR_ADJUSTMENT_KEYS,
  LIGHT_ADJUSTMENT_KEYS,
} from "../../../utils/adjustments";
import styles from "./AdjustmentPanel.module.css";

interface AdjustmentPanelProps {
  adjustments: AdjustmentState;
  /** 不変契約: 常に新しい state オブジェクトを渡す（ConversionSettings と同方針） */
  onAdjustmentsChange: (adjustments: AdjustmentState) => void;
}

/**
 * ライト / カラーの調整スライダー群。
 * `adjustments` + `onAdjustmentsChange` の不変更新契約は `ConversionSettings` を踏襲する。
 */
export const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({
  adjustments,
  onAdjustmentsChange,
}) => {
  const { t } = useTranslation();

  const renderGroup = (title: string, keys: readonly AdjustmentKey[]) => (
    <div className={styles.group}>
      <h4 className={styles.groupTitle}>{title}</h4>
      {keys.map((key) => (
        <Slider
          key={key}
          label={t(`edit.${key}`)}
          value={adjustments[key]}
          min={ADJUSTMENT_MIN}
          max={ADJUSTMENT_MAX}
          defaultValue={0}
          resetLabel={t("edit.reset")}
          onChange={(value) =>
            onAdjustmentsChange({ ...adjustments, [key]: value })
          }
          onReset={() => onAdjustmentsChange({ ...adjustments, [key]: 0 })}
        />
      ))}
    </div>
  );

  return (
    <div className={styles.panel}>
      {renderGroup(t("edit.light"), LIGHT_ADJUSTMENT_KEYS)}
      {renderGroup(t("edit.color"), COLOR_ADJUSTMENT_KEYS)}
    </div>
  );
};
