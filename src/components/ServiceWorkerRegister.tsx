"use client";

import type React from "react";
import { useEffect } from "react";

// 本番ビルドでのみ Service Worker（/sw.js）を登録する。
// dev（next dev）では process.env.NODE_ENV !== "production" のため登録せず、
// 開発中に古いキャッシュが配信される事故を防ぐ。UI は持たない。
export const ServiceWorkerRegister: React.FC = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    };

    // メインコンテンツの描画を優先するため load 後に登録する
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
};
