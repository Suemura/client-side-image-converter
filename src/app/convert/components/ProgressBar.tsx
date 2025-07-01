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

        {/* プログレスバー */}
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
