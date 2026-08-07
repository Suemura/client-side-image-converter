import type React from "react";
import { useTranslation } from "react-i18next";
import {
  STUDIO_TOOL_ORDER,
  type StudioToolId,
} from "../../../utils/studioCore";
import { ToolIcon } from "./ToolIcon";
import styles from "./ToolRail.module.css";

interface ToolRailProps {
  tool: StudioToolId;
  onToolChange: (tool: StudioToolId) => void;
  /** 履歴パネルの開閉（レール最下部のボタン） */
  historyOpen: boolean;
  onToggleHistory: () => void;
}

/** PC 版の左ツールレール（6 ツール + 最下部の履歴トグル） */
export const ToolRail: React.FC<ToolRailProps> = ({
  tool,
  onToolChange,
  historyOpen,
  onToggleHistory,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.rail} role="tablist" aria-orientation="vertical">
      {STUDIO_TOOL_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tool === id}
          className={`${styles.item}${tool === id ? ` ${styles.active}` : ""}`}
          onClick={() => onToolChange(id)}
          data-testid={`studio-rail-${id}`}
        >
          <ToolIcon tool={id} />
          <span className={styles.label}>{t(`studio.tools.${id}`)}</span>
        </button>
      ))}

      <button
        type="button"
        className={`${styles.item} ${styles.historyButton}${historyOpen ? ` ${styles.active}` : ""}`}
        onClick={onToggleHistory}
        aria-pressed={historyOpen}
        data-testid="studio-history-toggle"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15.5 14" />
        </svg>
        <span className={styles.label}>{t("studio.history.title")}</span>
      </button>
    </div>
  );
};
