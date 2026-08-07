import type React from "react";
import { useTranslation } from "react-i18next";
import {
  STUDIO_TOOL_ORDER,
  type StudioToolId,
} from "../../../utils/studioCore";
import styles from "./MobileTabBar.module.css";
import { ToolIcon } from "./ToolIcon";

interface MobileTabBarProps {
  tool: StudioToolId;
  onToolChange: (tool: StudioToolId) => void;
}

/** スマホ版の下ツールタブバー（6 タブ。ツールレール相当） */
export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  tool,
  onToolChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.bar} role="tablist">
      {STUDIO_TOOL_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tool === id}
          className={`${styles.tab}${tool === id ? ` ${styles.active}` : ""}`}
          onClick={() => onToolChange(id)}
          data-testid={`studio-tab-${id}`}
        >
          <ToolIcon tool={id} size={21} />
          <span className={styles.label}>{t(`studio.tools.${id}`)}</span>
        </button>
      ))}
    </div>
  );
};
