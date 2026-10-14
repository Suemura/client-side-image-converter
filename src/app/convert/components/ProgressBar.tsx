import type React from "react";
import { useTranslation } from "react-i18next";
import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  current: number;
  total: number;
  isVisible: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  isVisible,
}) => {
  const { t } = useTranslation();

  if (!isVisible || total === 0) {
    return null;
  }

  const percentage = Math.round((current / total) * 100);

  return (
    <div className={styles.container}>
      <div className={styles.progressContent}>
        <div className={styles.progressHeader}>
          <h4 className={styles.title}>{t("progress.converting")}</h4>
          <span className={styles.progressText}>
            {current} / {total} ({percentage}%)
          </span>
        </div>

        {/* プログレスバー。バー幅は実行時に計算される進捗率（動的値）のため
            style 属性で渡す（DESIGN.md「例外: 動的値の style 属性渡し」準拠） */}
        <div className={styles.progressBarContainer}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <p className={styles.waitMessage}>{t("progress.pleaseWait")}</p>
    </div>
  );
};
