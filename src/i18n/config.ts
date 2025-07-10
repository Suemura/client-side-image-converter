import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getInitialLanguage, setStoredLanguage } from "../utils/languageStorage";

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

// 初期言語を取得
const initialLanguage = getInitialLanguage();

// i18nextを初期化
if (!i18n.isInitialized) {
  i18n.init({
    resources,
    lng: initialLanguage, // ローカルストレージまたはブラウザ言語に基づく初期言語
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false, // React 19との互換性のため
    },
  });

  // 言語変更時にローカルストレージに保存
  i18n.on('languageChanged', (lng) => {
    if (lng === 'ja' || lng === 'en') {
      setStoredLanguage(lng);
    }
  });
}

export const initI18n = () => {
  // 既に初期化済みの場合は何もしない
  return Promise.resolve();
};

export default i18n;
