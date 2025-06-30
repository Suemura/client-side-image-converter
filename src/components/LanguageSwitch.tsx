import type React from "react";
import { useTranslation } from "react-i18next";

export const LanguageSwitch: React.FC = () => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === "ja" ? "en" : "ja";
    i18n.changeLanguage(newLang);
  };

  const isJapanese = i18n.language === "ja";

  return (
    <div
      onClick={toggleLanguage}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        backgroundColor: "var(--border)",
        borderRadius: "20px",
        padding: "2px",
        cursor: "pointer",
        transition: "all 0.3s ease",
        width: "80px",
        height: "32px",
        border: "1px solid var(--border)",
      }}
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
        style={{
          position: "absolute",
          top: "2px",
          left: isJapanese ? "2px" : "42px",
          width: "36px",
          height: "26px",
          backgroundColor: "white",
          borderRadius: "18px",
          transition: "all 0.3s ease",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
          border: "1px solid var(--border-light, #e5e5e5)",
        }}
      />
      
      {/* 言語ラベル */}
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          fontSize: "11px",
          fontWeight: "600",
          zIndex: 1,
        }}
      >
        <span
          style={{
            color: isJapanese ? "var(--foreground)" : "var(--muted-foreground)",
            transition: "color 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: "2px",
          }}
        >
          🇯🇵
        </span>
        <span
          style={{
            color: !isJapanese ? "var(--foreground)" : "var(--muted-foreground)",
            transition: "color 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: "2px",
          }}
        >
          🇺🇸
        </span>
      </div>
    </div>
  );
};
