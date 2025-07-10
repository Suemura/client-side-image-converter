import { useTheme } from "../contexts/ThemeContext";

export const useThemeAwareImage = (
  lightSrc: string,
  darkSrc?: string,
): string => {
  const { theme } = useTheme();

  if (theme === "dark" && darkSrc) {
    return darkSrc;
  }

  return lightSrc;
};