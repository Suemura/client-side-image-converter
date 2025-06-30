import Link from "next/link";
import type React from "react";
import { useTranslation } from "react-i18next";

export const Navigation: React.FC = () => {
  const { t } = useTranslation();

  const navItems = [
    { label: t("navigation.top"), href: "/" },
    { label: t("navigation.crop"), href: "/crop" },
    { label: t("navigation.convert"), href: "/convert" },
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
