import { useEffect, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

export const useThemeAwareImage = (
  lightSrc: string,
  darkSrc?: string,
): string => {
  const { theme } = useTheme();
  const [imageSrc, setImageSrc] = useState(lightSrc);

  useEffect(() => {
    // クライアントサイドでのみテーマに基づいて画像を変更
    if (theme === "dark" && darkSrc) {
      setImageSrc(darkSrc);
    } else {
      setImageSrc(lightSrc);
    }
  }, [theme, lightSrc, darkSrc]);

  return imageSrc;
};