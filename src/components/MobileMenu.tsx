"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HANDOFF_TOOLS } from "../utils/handoff";
import { LanguageSwitch } from "./LanguageSwitch";
import styles from "./MobileMenu.module.css";
import { ThemeSwitch } from "./ThemeSwitch";

/**
 * モバイル用のハンバーガーメニュー + 右スライドインドロワー（DESIGN.md「Mobile Menu」）。
 * 768px 以下でのみ表示され、Navigation / GitHub リンク / ThemeSwitch / LanguageSwitch を
 * ドロワーへ収納する。開閉 state は本コンポーネント内で完結する。
 */
export const MobileMenu: React.FC = () => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // ナビゲーション項目は Navigation.tsx と同じく HANDOFF_TOOLS を単一の真実とする
  const navItems = [
    { label: t("navigation.top"), href: "/" },
    ...HANDOFF_TOOLS.map((tool) => ({
      label: t(tool.labelKey),
      href: tool.path,
    })),
  ];

  const close = useCallback(() => {
    setIsOpen(false);
    // 閉じたらハンバーガーボタンへフォーカスを復帰する
    hamburgerRef.current?.focus();
  }, []);

  // Escape キーで閉じる + 開いている間は背面のスクロールをロック（FileDetailModal と同パターン）
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      // Tab キーはドロワー内の先頭/末尾でループさせ、背景側へフォーカスが漏れないようにする
      if (e.key === "Tab") {
        const drawer = drawerRef.current;
        if (!drawer) {
          return;
        }
        const focusable = drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    // 開いたら閉じるボタンへフォーカスを移す
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  /** 末尾スラッシュ差（静的エクスポート時の /crop/ 等）を無視して現在ページを判定する */
  const isCurrentPage = (href: string): boolean => {
    const normalized =
      pathname !== "/" && pathname.endsWith("/")
        ? pathname.slice(0, -1)
        : pathname;
    return normalized === href;
  };

  return (
    <div className={styles.mobileMenu}>
      <button
        type="button"
        ref={hamburgerRef}
        className={styles.hamburgerButton}
        onClick={() => setIsOpen(true)}
        aria-expanded={isOpen}
        aria-controls="mobile-menu-drawer"
        aria-label={t("mobileMenu.open")}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {/* 背景幕。クリックで閉じる（装飾要素のためスクリーンリーダーからは隠す） */}
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayOpen : ""}`}
        onClick={close}
        aria-hidden="true"
      />
      <div
        id="mobile-menu-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("mobileMenu.title")}
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`}
        // 閉じている間は Tab / スクリーンリーダーの対象から外す
        inert={!isOpen}
      >
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>{t("mobileMenu.title")}</span>
          <button
            type="button"
            ref={closeButtonRef}
            className={styles.closeButton}
            onClick={close}
            aria-label={t("mobileMenu.close")}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>
        <div className={styles.navList}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${
                isCurrentPage(item.href) ? styles.navLinkCurrent : ""
              }`}
              aria-current={isCurrentPage(item.href) ? "page" : undefined}
              onClick={close}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className={styles.settings}>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>{t("mobileMenu.theme")}</span>
            <ThemeSwitch />
          </div>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>
              {t("mobileMenu.language")}
            </span>
            <LanguageSwitch />
          </div>
        </div>
        <a
          href="https://github.com/Suemura/client-side-image-converter"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubLink}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className={styles.githubIcon}
            aria-hidden="true"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          {t("header.github")}
        </a>
      </div>
    </div>
  );
};
