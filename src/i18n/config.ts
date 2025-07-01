import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// JSONファイルから翻訳リソースをインポート
import jaTranslations from "./locales/ja.json";
import enTranslations from "./locales/en.json";

// 翻訳リソースの定義
const resources = {
  ja: {
    translation: jaTranslations,
  },
  en: {
    translation: enTranslations,
  },
};

// i18nextの設定
i18n.use(initReactI18next);

// i18nextを初期化
if (!i18n.isInitialized) {
  i18n.init({
    resources,
    lng: "ja", // デフォルトは日本語
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false, // React 19との互換性のため
    },
  });
}

export const initI18n = () => {
  // 既に初期化済みの場合は何もしない
  return Promise.resolve();
};

export default i18n;
