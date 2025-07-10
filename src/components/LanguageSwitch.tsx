import type React from "react";
import { useTranslation } from "react-i18next";
import { setStoredLanguage, type SupportedLanguage } from "../utils/languageStorage";
import styles from "./LanguageSwitch.module.css";

export const LanguageSwitch: React.FC = () => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang: SupportedLanguage = i18n.language === "ja" ? "en" : "ja";
    // i18nextの言語変更（これによりlanguageChangedイベントが発火し、自動的にローカルストレージに保存される）
    i18n.changeLanguage(newLang);
  };

  const isJapanese = i18n.language === "ja";

  return (
    <div
      onClick={toggleLanguage}
      className={styles.container}
      role="button"
      tabIndex={0}
      aria-label={`Switch to ${isJapanese ? "English" : "Japanese"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleLanguage();
        }
      }}
    >
      {/* 背景のスライドエリア */}
      <div
        className={`${styles.slider} ${
          isJapanese ? styles.sliderJapanese : styles.sliderEnglish
        }`}
      />

      {/* 言語ラベル */}
      <div className={styles.labelContainer}>
        <span
          className={`${styles.languageLabel} ${
            isJapanese ? styles.labelActive : styles.labelInactive
          }`}
        >
          🇯🇵
        </span>
        <span
          className={`${styles.languageLabel} ${
            !isJapanese ? styles.labelActive : styles.labelInactive
          }`}
        >
          🇺🇸
        </span>
      </div>
    </div>
  );
};
