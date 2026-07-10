import type React from "react";
import { useTranslation } from "react-i18next";
import type { HandoffNoticeInfo } from "../hooks/useHandoffReceiver";
import { findHandoffTool } from "../utils/handoff";
import styles from "./HandoffNotice.module.css";

interface HandoffNoticeProps {
  notice: HandoffNoticeInfo | null;
  onDismiss: () => void;
}

/**
 * ハンドオフ到着時の非ブロッキングバナー。
 * 引き継ぎ元のツール名と件数を表示し、取り込めなかった分があれば補足する。
 */
export const HandoffNotice: React.FC<HandoffNoticeProps> = ({
  notice,
  onDismiss,
}) => {
  const { t } = useTranslation();

  if (!notice) {
    return null;
  }

  const originTool = findHandoffTool(notice.origin);
  const toolLabel = originTool ? t(originTool.labelKey) : notice.origin;

  return (
    <div className={styles.container} role="status">
      <div className={styles.textContainer}>
        <p className={styles.text}>
          {t("handoff.received", {
            tool: toolLabel,
            count: notice.receivedCount,
          })}
        </p>
        {notice.skippedCount > 0 && (
          <p className={styles.skippedText}>
            {t("handoff.skipped", { count: notice.skippedCount })}
          </p>
        )}
      </div>
      <button
        type="button"
        className={styles.dismissButton}
        onClick={onDismiss}
        aria-label={t("handoff.dismiss")}
      >
        ×
      </button>
    </div>
  );
};
