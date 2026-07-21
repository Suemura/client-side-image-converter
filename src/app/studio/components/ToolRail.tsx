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
}

/** PC 版の左ツールレール（6 ツール） */
export const ToolRail: React.FC<ToolRailProps> = ({ tool, onToolChange }) => {
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
    </div>
  );
};
