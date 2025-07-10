"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/config";
import { getInitialLanguage } from "../utils/languageStorage";
import { LanguageManager } from "./LanguageManager";

interface I18nProviderProps {
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // クライアントサイドでの初期化
    const initializeI18n = async () => {
      try {
        // クライアントサイドで正しい言語を再設定
        const initialLanguage = getInitialLanguage();
        
        // 現在の言語と異なる場合のみ変更
        if (i18n.language !== initialLanguage) {
          await i18n.changeLanguage(initialLanguage);
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize i18n:', error);
        setIsInitialized(true); // エラーでも表示は継続
      }
    };

    initializeI18n();
  }, []);

  // 初期化完了まで何も表示しない（フラッシュを防ぐ）
  if (!isInitialized) {
    return <div style={{ visibility: 'hidden' }}>{children}</div>;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageManager />
      {children}
    </I18nextProvider>
  );
};
