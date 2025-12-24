"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * 言語設定に応じてHTMLのlang属性を更新するコンポーネント
 */
export const LanguageManager: React.FC = () => {
  const { i18n } = useTranslation();

  useEffect(() => {
    // HTMLのlang属性を現在の言語に更新
    if (typeof document !== "undefined") {
      document.documentElement.lang = i18n.language;
    }
  }, [i18n.language]);

  // このコンポーネントは何もレンダリングしない
  return null;
};
