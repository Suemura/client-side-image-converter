import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { ErrorNotice } from "../../../components/ErrorNotice";
import type { ConversionFormat } from "../../../utils/conversionCore";
import { downloadAsZip, downloadSingle } from "../../../utils/fileDownloader";
import type { EditJob } from "../../../utils/imageEditor";
import { editImages } from "../../../utils/imageEditor";
import {
  type ExportTarget,
  type ResizeRequest,
  resolveExportIndices,
} from "../../../utils/studioCore";
import styles from "./ExportDialog.module.css";

/** 書き出しで選べるフォーマット（モック準拠。JXL は対象外） */
const EXPORT_FORMATS: ConversionFormat[] = ["jpeg", "png", "webp", "avif"];

/** 推定サイズ計算のデバウンス（ms） */
const ESTIMATE_DEBOUNCE_MS = 500;

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  files: File[];
  selectedIndex: number;
  /** 未確定の調整（EditJob）を書き出しに反映する */
  buildJobs: () => EditJob[];
  isMobile: boolean;
}

const parseDimension = (text: string): number | undefined => {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value >= 1 ? value : undefined;
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/**
 * 書き出しダイアログ（PC: 中央モーダル / スマホ: ボトムシート）。
 * 出力は編集と同一経路（editImages）で 1 回のエンコードに揃える（世代劣化を避ける）。
 */
export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  files,
  selectedIndex,
  buildJobs,
  isMobile,
}) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ConversionFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [widthText, setWidthText] = useState("");
  const [heightText, setHeightText] = useState("");
  const [keepAspect, setKeepAspect] = useState(true);
  const [preserveExif, setPreserveExif] = useState(false);
  const [target, setTarget] = useState<ExportTarget>(
    files.length > 1 ? "all" : "current",
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const estimateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildResize = useCallback((): ResizeRequest | undefined => {
    const width = parseDimension(widthText);
    const height = parseDimension(heightText);
    if (width === undefined && height === undefined) {
      return undefined;
    }
    return { width, height, keepAspect };
  }, [widthText, heightText, keepAspect]);

  // 推定サイズ: 選択中 1 枚を実エンコードして測る（デバウンス付き）。
  // AVIF は WASM エンコードが重いため推定を省略する
  useEffect(() => {
    if (!open || files.length === 0) {
      return;
    }
    if (format === "avif") {
      setEstimatedSize(null);
      setIsEstimating(false);
      return;
    }
    setIsEstimating(true);
    if (estimateTimerRef.current) {
      clearTimeout(estimateTimerRef.current);
    }
    let cancelled = false;
    estimateTimerRef.current = setTimeout(() => {
      const file = files[Math.min(selectedIndex, files.length - 1)];
      const jobs = buildJobs();
      const job = jobs[Math.min(selectedIndex, jobs.length - 1)];
      editImages([file], job ? [job] : [], undefined, {
        outputFormat: format,
        quality: quality / 100,
        resize: buildResize(),
        preserveExif: false,
      })
        .then(({ results }) => {
          if (cancelled) {
            for (const result of results) {
              URL.revokeObjectURL(result.url);
            }
            return;
          }
          const result = results[0];
          if (result) {
            setEstimatedSize(result.blob.size);
            URL.revokeObjectURL(result.url);
          } else {
            setEstimatedSize(null);
          }
          setIsEstimating(false);
        })
        .catch(() => {
          if (!cancelled) {
            setEstimatedSize(null);
            setIsEstimating(false);
          }
        });
    }, ESTIMATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      if (estimateTimerRef.current) {
        clearTimeout(estimateTimerRef.current);
      }
    };
  }, [open, files, selectedIndex, format, quality, buildJobs, buildResize]);

  const handleExport = useCallback(async () => {
    if (files.length === 0 || isExporting) {
      return;
    }
    setIsExporting(true);
    setExportError(false);
    try {
      const indices = resolveExportIndices(target, selectedIndex, files.length);
      const jobs = buildJobs();
      const { results, failures } = await editImages(
        indices.map((index) => files[index]),
        indices.map((index) => jobs[index]),
        undefined,
        {
          outputFormat: format,
          quality: quality / 100,
          resize: buildResize(),
          preserveExif,
        },
      );
      if (failures.length > 0 && results.length === 0) {
        setExportError(true);
        return;
      }
      if (results.length === 1) {
        downloadSingle(results[0]);
      } else if (results.length > 1) {
        await downloadAsZip(results);
      }
      for (const result of results) {
        URL.revokeObjectURL(result.url);
      }
      if (failures.length === 0) {
        onClose();
      } else {
        setExportError(true);
      }
    } catch (error) {
      console.error("Export error:", error);
      setExportError(true);
    } finally {
      setIsExporting(false);
    }
  }, [
    files,
    isExporting,
    target,
    selectedIndex,
    buildJobs,
    format,
    quality,
    buildResize,
    preserveExif,
    onClose,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`${styles.overlay}${isMobile ? ` ${styles.overlayMobile}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("studio.export.title")}
    >
      <div className={isMobile ? styles.sheet : styles.modal}>
        {isMobile && <div className={styles.sheetHandle} />}
        <div className={styles.header}>
          <div>
            <div className={styles.title}>{t("studio.export.title")}</div>
            {!isMobile && (
              <div className={styles.description}>
                {t("studio.export.description")}
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("studio.export.close")}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <ErrorNotice
            message={exportError ? t("studio.export.error") : null}
          />

          <div>
            <div className={styles.sectionTitle}>
              {t("studio.export.format")}
            </div>
            <div className={styles.chips}>
              {EXPORT_FORMATS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={`${styles.chip}${format === candidate ? ` ${styles.chipActive}` : ""}`}
                  onClick={() => setFormat(candidate)}
                  data-testid={`studio-export-format-${candidate}`}
                >
                  {candidate.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={styles.sliderHeader}>
              <span className={styles.sectionTitle}>
                {t("studio.export.quality")}
              </span>
              <span className={styles.sliderValue}>{quality}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className={styles.range}
            />
            <div className={styles.estimate}>
              {format === "avif"
                ? t("studio.export.estimatedSizeUnavailable")
                : isEstimating
                  ? t("studio.export.estimating")
                  : estimatedSize !== null
                    ? t("studio.export.estimatedSize", {
                        size: formatBytes(estimatedSize),
                      })
                    : t("studio.export.estimatedSizeUnavailable")}
            </div>
          </div>

          {!isMobile && (
            <div>
              <div className={styles.sectionTitle}>
                {t("studio.export.resize")}
              </div>
              <div className={styles.resizeRow}>
                <label className={styles.resizeField}>
                  <span className={styles.resizeLabel}>
                    {t("studio.export.width")}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={t("studio.export.auto")}
                    value={widthText}
                    onChange={(event) => setWidthText(event.target.value)}
                    className={styles.resizeInput}
                  />
                </label>
                <label className={styles.resizeField}>
                  <span className={styles.resizeLabel}>
                    {t("studio.export.height")}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={t("studio.export.auto")}
                    value={heightText}
                    onChange={(event) => setHeightText(event.target.value)}
                    className={styles.resizeInput}
                  />
                </label>
              </div>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={keepAspect}
                  onChange={(event) => setKeepAspect(event.target.checked)}
                  className={styles.checkbox}
                />
                <span>{t("studio.export.keepAspect")}</span>
              </label>
            </div>
          )}

          <label className={styles.exifRow}>
            <span>{t("studio.export.preserveExif")}</span>
            <input
              type="checkbox"
              checked={preserveExif}
              onChange={(event) => setPreserveExif(event.target.checked)}
              className={styles.checkbox}
            />
          </label>

          {files.length > 1 && (
            <div>
              <div className={styles.sectionTitle}>
                {t("studio.export.target")}
              </div>
              <div className={styles.chips}>
                <button
                  type="button"
                  className={`${styles.chip}${target === "current" ? ` ${styles.chipActive}` : ""}`}
                  onClick={() => setTarget("current")}
                >
                  {t("studio.export.targetCurrent")}
                </button>
                <button
                  type="button"
                  className={`${styles.chip}${target === "all" ? ` ${styles.chipActive}` : ""}`}
                  onClick={() => setTarget("all")}
                  data-testid="studio-export-target-all"
                >
                  {t("studio.export.targetAll", { count: files.length })}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {!isMobile && (
            <Button variant="secondary" onClick={onClose}>
              {t("studio.export.cancel")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            disabled={isExporting || files.length === 0}
            className={styles.exportButton}
          >
            {isExporting ? t("studio.export.running") : t("studio.export.run")}
          </Button>
        </div>
      </div>
    </div>
  );
};
