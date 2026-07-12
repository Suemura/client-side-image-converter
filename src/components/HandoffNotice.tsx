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
 * role="status" のライブリージョンは空の状態で常時マウントし、到着時に中身だけを
 * 差し込む（内容付きの条件付きマウントだとスクリーンリーダーによっては
 * 告知が読み上げられないため）。
 */
export const HandoffNotice: React.FC<HandoffNoticeProps> = ({
  notice,
  onDismiss,
}) => {
  const { t } = useTranslation();

  const originTool = notice ? findHandoffTool(notice.origin) : undefined;
  const toolLabel =
    notice && (originTool ? t(originTool.labelKey) : notice.origin);

  return (
    <div role="status">
      {notice && (
        <div className={styles.container}>
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
      )}
    </div>
  );
};
