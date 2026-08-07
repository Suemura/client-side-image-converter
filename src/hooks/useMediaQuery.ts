"use client";

import { useEffect, useState } from "react";

/**
 * メディアクエリの一致状態を購読するフック。
 * SSR / 静的エクスポートの初回レンダリングでは false を返し、
 * マウント後に matchMedia の実値へ同期する（ハイドレーション不一致を避ける）。
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handleChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
};
