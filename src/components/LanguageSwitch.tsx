import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export const LanguageSwitch: React.FC = () => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "ja" ? "en" : "ja";
    i18n.changeLanguage(newLang);
  };

  return (
    <Button variant="secondary" size="small" onClick={toggleLanguage}>
      {i18n.language === "ja" ? "🇺🇸 EN" : "🇯🇵 JP"}
    </Button>
  );
};
