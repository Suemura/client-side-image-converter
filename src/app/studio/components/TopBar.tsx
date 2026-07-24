import Link from "next/link";
import type React from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "../../../components/LanguageSwitch";
import { Logo } from "../../../components/Logo";
import { ThemeSwitch } from "../../../components/ThemeSwitch";
import styles from "./TopBar.module.css";

interface TopBarProps {
  /** 現在選択中のファイル名（画像なしは null） */
  fileName: string | null;
  /** 前後比較モード（調整ツールのプレビューに反映） */
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** 書き出しダイアログを開く（画像なしは無効） */
  onOpenExport: () => void;
  exportDisabled: boolean;
  /** スマホでは比較トグル等をキャンバス側に出すため簡易表示にする */
  isMobile: boolean;
  /** 履歴ボトムシートを開く（スマホのみ表示。PC はツールレールから開く） */
  onToggleHistory: () => void;
  historyDisabled: boolean;
}

/** ワークスペース上部バー（ロゴ・ファイル名・比較トグル・undo/redo・テーマ・言語・書き出し） */
export const TopBar: React.FC<TopBarProps> = ({
  fileName,
  compare,
  onCompareChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenExport,
  exportDisabled,
  isMobile,
  onToggleHistory,
  historyDisabled,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <Link
          href="/"
          className={styles.logoLink}
          aria-label={t("studio.backHome")}
        >
          <Logo />
        </Link>
        <span className={styles.brand}>{t("studio.brand")}</span>
        {fileName && (
          <>
            <div className={styles.separator} />
            <span className={styles.fileName} title={fileName}>
              {fileName}
            </span>
          </>
        )}
      </div>

      <div className={styles.right}>
        {!isMobile && (
          <>
            <div
              className={styles.segment}
              role="group"
              aria-label={t("studio.topbar.compare")}
            >
              <button
                type="button"
                className={`${styles.segmentButton}${!compare ? ` ${styles.segmentActive}` : ""}`}
                onClick={() => onCompareChange(false)}
              >
                {t("studio.topbar.editedOnly")}
              </button>
              <button
                type="button"
                className={`${styles.segmentButton}${compare ? ` ${styles.segmentActive}` : ""}`}
                onClick={() => onCompareChange(true)}
              >
                {t("studio.topbar.compare")}
              </button>
            </div>
            <div className={styles.separator} />
          </>
        )}

        <button
          type="button"
          className={styles.iconButton}
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("studio.topbar.undo")}
          title={t("studio.topbar.undo")}
          data-testid="studio-undo"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("studio.topbar.redo")}
          title={t("studio.topbar.redo")}
          data-testid="studio-redo"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>

        {isMobile && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleHistory}
            disabled={historyDisabled}
            aria-label={t("studio.history.title")}
            title={t("studio.history.title")}
            data-testid="studio-history-open"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15.5 14" />
            </svg>
          </button>
        )}

        {!isMobile && (
          <>
            <div className={styles.separator} />
            <ThemeSwitch />
            <LanguageSwitch />
          </>
        )}

        <div className={styles.separator} />
        <button
          type="button"
          className={styles.exportButton}
          onClick={onOpenExport}
          disabled={exportDisabled}
          data-testid="studio-export-open"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {t("studio.topbar.export")}
        </button>
      </div>
    </div>
  );
};
