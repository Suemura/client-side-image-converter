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
  /** 自動補正: オートレベル（blacks / whites を統計から算出してセット） */
  onAutoLevels: () => void;
  /** 自動補正: 自動ホワイトバランス（temperature / tint を統計から算出してセット） */
  onAutoWhiteBalance: () => void;
  /** 統計（編集前ヒストグラム）が未算出の間は自動補正ボタンを無効化する */
  autoDisabled?: boolean;
}

/**
 * ライト / カラーの調整スライダー群と自動補正（ワンショット）ボタン。
 * `adjustments` + `onAdjustmentsChange` の不変更新契約は `ConversionSettings` を踏襲する。
 * 自動補正は算出結果を直下のスライダー値として可視化するため、このパネルの先頭に置く。
 */
export const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({
  adjustments,
  onAdjustmentsChange,
  onAutoLevels,
  onAutoWhiteBalance,
  autoDisabled = false,
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
      <div className={styles.group}>
        <h4 className={styles.groupTitle}>{t("edit.auto.title")}</h4>
        <div className={styles.autoButtons}>
          <button
            type="button"
            className={styles.autoButton}
            onClick={onAutoLevels}
            disabled={autoDisabled}
          >
            {t("edit.auto.levels")}
          </button>
          <button
            type="button"
            className={styles.autoButton}
            onClick={onAutoWhiteBalance}
            disabled={autoDisabled}
          >
            {t("edit.auto.whiteBalance")}
          </button>
        </div>
      </div>
      {renderGroup(t("edit.light"), LIGHT_ADJUSTMENT_KEYS)}
      {renderGroup(t("edit.color"), COLOR_ADJUSTMENT_KEYS)}
    </div>
  );
};
