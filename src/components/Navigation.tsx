import Link from "next/link";
import type React from "react";
import { useTranslation } from "react-i18next";
import { HANDOFF_TOOLS } from "../utils/handoff";

export const Navigation: React.FC = () => {
  const { t } = useTranslation();

  // ツールのメタ定義（パス・ラベルキー）はハンドオフと共有の HANDOFF_TOOLS を単一の真実とする
  const navItems = [
    { label: t("navigation.top"), href: "/" },
    ...HANDOFF_TOOLS.map((tool) => ({
      label: t(tool.labelKey),
      href: tool.path,
    })),
  ];

  return (
    <nav className="flex items-center gap-9">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
};
