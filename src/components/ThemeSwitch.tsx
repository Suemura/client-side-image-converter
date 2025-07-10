import type React from "react";
import { useTheme } from "../contexts/ThemeContext";
import styles from "./ThemeSwitch.module.css";

export const ThemeSwitch: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <div
      onClick={toggleTheme}
      className={styles.container}
      role="button"
      tabIndex={0}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTheme();
        }
      }}
    >
      <div
        className={`${styles.slider} ${
          isDark ? styles.sliderDark : styles.sliderLight
        }`}
      />

      <div className={styles.labelContainer}>
        <span
          className={`${styles.themeLabel} ${
            !isDark ? styles.labelActive : styles.labelInactive
          }`}
        >
          ☀️
        </span>
        <span
          className={`${styles.themeLabel} ${
            isDark ? styles.labelActive : styles.labelInactive
          }`}
        >
          🌙
        </span>
      </div>
    </div>
  );
};