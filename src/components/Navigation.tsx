import Link from "next/link";
import type React from "react";
import { useTranslation } from "react-i18next";
import { HANDOFF_TOOLS, STUDIO_NAV_ITEM } from "../utils/handoff";
import styles from "./Navigation.module.css";

export const Navigation: React.FC = () => {
  const { t } = useTranslation();

  // ツールのメタ定義（パス・ラベルキー）はハンドオフと共有の HANDOFF_TOOLS を単一の真実とする
  const navItems = [
    { label: t("navigation.top"), href: "/" },
    { label: t(STUDIO_NAV_ITEM.labelKey), href: STUDIO_NAV_ITEM.path },
    ...HANDOFF_TOOLS.map((tool) => ({
      label: t(tool.labelKey),
      href: tool.path,
    })),
  ];

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href} className={styles.link}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
};
