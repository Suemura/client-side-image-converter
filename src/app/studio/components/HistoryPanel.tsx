import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import type {
  StudioHistoryLabelKey,
  StudioToolId,
} from "../../../utils/studioCore";
import type { StudioHistoryEntry } from "../hooks/useStudioDocuments";
import styles from "./HistoryPanel.module.css";
import { ToolIcon } from "./ToolIcon";

interface HistoryPanelProps {
  /** 履歴の表示行（古い順） */
  entries: StudioHistoryEntry[];
  /** 現在位置（ハイライト行） */
  currentIndex: number;
  /** 行クリックでその時点へ移動する */
  onJump: (index: number) => void;
  /** 履歴をクリアして元画像に戻す（確認済みの実行） */
  onClear: () => void;
  /** スマホはボトムシート表示（閉じるボタン付き） */
  isMobile: boolean;
  onClose: () => void;
}

/** ラベル種別 → ツールアイコンの対応（ツール由来でない操作は専用アイコン） */
const LABEL_TOOL_ICONS: Partial<Record<StudioHistoryLabelKey, StudioToolId>> = {
  crop: "crop",
  cropRatio: "crop",
  adjust: "adjust",
  retouchMosaic: "retouch",
  retouchBlur: "retouch",
  retouchFill: "retouch",
  upscale: "upscale",
  removebg: "removebg",
  metadata: "info",
};

/** 読み込み / 追加行のアイコン（画像 + 山のピクト） */
const LoadIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

/** 操作時刻を HH:MM で表示する */
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

/**
 * 履歴パネル（PC: ツールレール右隣のサイドパネル / スマホ: ボトムシート）。
 * 上部バーの undo / redo と同一スタックを表示し、行クリックで任意時点へ戻せる。
 */
export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  entries,
  currentIndex,
  onJump,
  onClear,
  isMobile,
  onClose,
}) => {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmDialogRef = useRef<HTMLDivElement>(null);

  const handleClearConfirmed = () => {
    setConfirmOpen(false);
    onClear();
  };

  // 破壊的操作の確認ダイアログ: Escape での cancel と、開いた際にダイアログへフォーカスを移す
  useEffect(() => {
    if (!confirmOpen) {
      return;
    }
    confirmDialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmOpen]);

  const content = (
    <>
      <div className={styles.header}>
        <span className={styles.title}>{t("studio.history.title")}</span>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setConfirmOpen(true)}
            disabled={entries.length <= 1}
            data-testid="studio-history-clear"
          >
            {t("studio.history.clear")}
          </button>
          {isMobile && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label={t("studio.history.close")}
              data-testid="studio-history-close"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <ol className={styles.list} data-testid="studio-history-list">
        {entries.map((entry, index) => {
          const toolId = LABEL_TOOL_ICONS[entry.label.key];
          const isCurrent = index === currentIndex;
          return (
            <li key={`${index}-${entry.timestamp}`}>
              <button
                type="button"
                className={`${styles.row}${isCurrent ? ` ${styles.current}` : ""}`}
                onClick={() => onJump(index)}
                aria-current={isCurrent ? "step" : undefined}
                data-testid={`studio-history-row-${index}`}
              >
                <span className={styles.rowIcon}>
                  {toolId ? <ToolIcon tool={toolId} size={15} /> : <LoadIcon />}
                </span>
                <span className={styles.rowLabel}>
                  {t(
                    `studio.history.labels.${entry.label.key}`,
                    entry.label.params,
                  )}
                </span>
                <span className={styles.rowTime}>
                  {formatTime(entry.timestamp)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className={styles.note}>
        {t(isMobile ? "studio.history.noteMobile" : "studio.history.note")}
      </p>

      {confirmOpen && (
        <div className={styles.confirmOverlay}>
          <div
            ref={confirmDialogRef}
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-label={t("studio.history.confirmTitle")}
            tabIndex={-1}
          >
            <p className={styles.confirmText}>
              {t("studio.history.confirmMessage")}
            </p>
            <div className={styles.confirmActions}>
              <Button
                variant="secondary"
                size="small"
                onClick={() => setConfirmOpen(false)}
              >
                {t("studio.history.confirmCancel")}
              </Button>
              <Button size="small" onClick={handleClearConfirmed}>
                <span data-testid="studio-history-clear-confirm">
                  {t("studio.history.confirmClear")}
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className={styles.sheetOverlay}>
        {/* シート外タップで閉じる（キーボードは閉じるボタンで代替） */}
        <button
          type="button"
          className={styles.sheetBackdrop}
          onClick={onClose}
          aria-label={t("studio.history.close")}
        />
        <div className={styles.sheet} data-testid="studio-history-panel">
          <div className={styles.sheetHandle} />
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="studio-history-panel">
      {content}
    </div>
  );
};
