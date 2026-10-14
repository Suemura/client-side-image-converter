import type React from "react";
import styles from "./ToolPanel.module.css";

interface ToolPanelProps {
  title: string;
  description: string;
  /** AI ツールのバッジ表示（"AI"） */
  badge?: string;
  children: React.ReactNode;
  /** フッター（適用ボタン等）。未指定はフッターなし */
  footer?: React.ReactNode;
  /** スマホのボトムシートではヘッダーを小さくする */
  compact?: boolean;
}

/** 右パネル / ボトムシートで共有するツールパネルの器（ヘッダー・本文・フッター） */
export const ToolPanel: React.FC<ToolPanelProps> = ({
  title,
  description,
  badge,
  children,
  footer,
  compact = false,
}) => {
  return (
    <div className={`${styles.panel}${compact ? ` ${styles.compact}` : ""}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>
        <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
};
