"use client";

import type React from "react";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/config";
import { getClientInitialLanguage } from "../utils/languageStorage";
import { LanguageManager } from "./LanguageManager";

interface I18nProviderProps {
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  useEffect(() => {
    // Hydration完了後にクライアントサイドの言語設定を適用
    const initializeClientLanguage = async () => {
      try {
        // クライアントサイドで正しい言語を取得
        const clientLanguage = getClientInitialLanguage();

        // 現在の言語と異なる場合のみ変更
        if (i18n.language !== clientLanguage) {
          await i18n.changeLanguage(clientLanguage);
        }
      } catch (error) {
        console.error("Failed to initialize client language:", error);
      }
    };

    // Hydration完了を待つ
    initializeClientLanguage();
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageManager />
      {children}
    </I18nextProvider>
  );
};
