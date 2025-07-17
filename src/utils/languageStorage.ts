/**
 * ユーザーの言語設定を管理するユーティリティ
 */

const LANGUAGE_STORAGE_KEY = "preferred-language";

/**
 * サポートされている言語の型定義
 */
export type SupportedLanguage = "ja" | "en";

/**
 * サポートされている言語のリスト
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["ja", "en"];

/**
 * ブラウザの言語設定から推奨言語を取得
 */
export const detectBrowserLanguage = (): SupportedLanguage => {
  if (typeof window === "undefined") {
    return "ja"; // SSR時のデフォルト
  }

  // navigator.languageを最初にチェック
  const browserLang = navigator.language.toLowerCase();

  // 日本語の場合
  if (browserLang.startsWith("ja")) {
    return "ja";
  }

  // 英語の場合
  if (browserLang.startsWith("en")) {
    return "en";
  }

  // navigator.languagesもチェック
  if (navigator.languages) {
    for (const lang of navigator.languages) {
      const normalizedLang = lang.toLowerCase();
      if (normalizedLang.startsWith("ja")) {
        return "ja";
      }
      if (normalizedLang.startsWith("en")) {
        return "en";
      }
    }
  }

  // デフォルトは日本語
  return "ja";
};

/**
 * ローカルストレージから言語設定を取得
 */
export const getStoredLanguage = (): SupportedLanguage | null => {
  if (typeof window === "undefined") {
    return null; // SSR時は常にnull
  }

  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
      return stored as SupportedLanguage;
    }
  } catch (error) {
    console.warn("Failed to read language from localStorage:", error);
  }

  return null;
};

/**
 * ローカルストレージに言語設定を保存
 */
export const setStoredLanguage = (language: SupportedLanguage): void => {
  if (typeof window === "undefined") {
    return; // SSR時は何もしない
  }

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    console.warn("Failed to save language to localStorage:", error);
  }
};

/**
 * 初期言語を決定（優先順位: ローカルストレージ > ブラウザ言語 > デフォルト）
 * SSR時は常にデフォルト言語を返す
 */
export const getInitialLanguage = (): SupportedLanguage => {
  // SSR時は常にデフォルト言語を返してHydrationエラーを防ぐ
  if (typeof window === "undefined") {
    return "ja";
  }

  // 1. ローカルストレージをチェック
  const storedLanguage = getStoredLanguage();
  if (storedLanguage) {
    return storedLanguage;
  }

  // 2. ブラウザ言語を検出
  return detectBrowserLanguage();
};

/**
 * クライアントサイド専用の初期言語取得
 * Hydration後に呼び出し、正しい言語設定を取得する
 */
export const getClientInitialLanguage = (): SupportedLanguage => {
  // クライアントサイドでのみ実行
  if (typeof window === "undefined") {
    return "ja";
  }

  // 1. ローカルストレージをチェック
  const storedLanguage = getStoredLanguage();
  if (storedLanguage) {
    return storedLanguage;
  }

  // 2. ブラウザ言語を検出
  return detectBrowserLanguage();
};

/**
 * 言語が有効かどうかをチェック
 */
export const isValidLanguage = (lang: string): lang is SupportedLanguage => {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
};
