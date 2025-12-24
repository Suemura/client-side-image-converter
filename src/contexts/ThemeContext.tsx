"use client";

import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>("light");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // クライアントサイドでのみ初期化
    // 現在のdata-theme属性を確認
    const currentTheme = document.documentElement.getAttribute(
      "data-theme",
    ) as Theme;
    if (currentTheme === "dark" || currentTheme === "light") {
      setTheme(currentTheme);
    } else {
      // フォールバック: ローカルストレージまたはシステム設定
      const savedTheme = localStorage.getItem("theme") as Theme;
      if (savedTheme) {
        setTheme(savedTheme);
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        setTheme(prefersDark ? "dark" : "light");
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("theme", theme);
      // data-theme属性はスクリプトで既に設定されているので、
      // 実際にテーマが変更された時のみ更新
      const currentTheme = document.documentElement.getAttribute("data-theme");
      if (currentTheme !== theme) {
        document.documentElement.setAttribute("data-theme", theme);
      }
    }
  }, [theme, isInitialized]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div suppressHydrationWarning>{children}</div>
    </ThemeContext.Provider>
  );
};
