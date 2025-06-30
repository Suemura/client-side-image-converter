import type React from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "./LanguageSwitch";
import { Logo } from "./Logo";
import { Navigation } from "./Navigation";

export const Header: React.FC = () => {
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-gray px-10 py-3">
      <div
        className="flex items-center gap-4"
        style={{ color: "var(--foreground)" }}
      >
        <Logo />
        <h2 className="text-lg font-bold" style={{ letterSpacing: "-0.015em" }}>
          {t("header.title")}
        </h2>
      </div>
      <div className="flex flex-1 justify-end gap-8">
        <Navigation />
        <LanguageSwitch />
      </div>
    </header>
  );
};
