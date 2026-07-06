"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./InstallPrompt.module.css";

// beforeinstallprompt はまだ標準の lib.dom.d.ts に含まれないため最小限で型定義する
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// 一度閉じたら再表示しないための localStorage キー
const DISMISSED_KEY = "pwa-install-dismissed";

// A2HS（ホーム画面に追加）の控えめな導線。
// beforeinstallprompt が発火した（＝インストール可能）ときだけ小さなバナーを表示する。
// 対応ブラウザ（主に Chromium 系）かつインストール条件を満たす場合のみ現れるため、
// 非対応環境や既にインストール済みの環境では何も表示しない。
export const InstallPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "true";
    } catch {
      // localStorage 不可の環境ではバナーは出すが記憶はしない
    }
    if (dismissed) return;

    const onBeforeInstallPrompt = (event: Event) => {
      // ブラウザ既定のミニ情報バーを抑止し、自前の控えめな導線に一本化する
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setPromptEvent(null);
      try {
        localStorage.setItem(DISMISSED_KEY, "true");
      } catch {
        // 記憶できなくても致命的ではない
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const handleInstall = async (): Promise<void> => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    // 選択後はプロンプトを再利用できないので閉じる
    setPromptEvent(null);
  };

  const handleDismiss = (): void => {
    setPromptEvent(null);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // 記憶できなくても致命的ではない
    }
  };

  if (!promptEvent) return null;

  return (
    <div
      className={styles.container}
      role="dialog"
      aria-label={t("install.title")}
    >
      <span className={styles.message}>{t("install.message")}</span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.installButton}
          onClick={() => void handleInstall()}
        >
          {t("install.button")}
        </button>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={handleDismiss}
          aria-label={t("install.dismiss")}
        >
          ×
        </button>
      </div>
    </div>
  );
};
