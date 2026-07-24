import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import type { DetectionCategory } from "../../../../utils/detectionCore";
import { RedactToolbar } from "../../../redact/components/RedactToolbar";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./PanelParts.module.css";

interface RetouchPanelProps {
  tools: StudioTools;
  /** EXIF 補正済みの自然サイズプレビュー（自動検出の入力に使う。未生成時は null） */
  previewSource: HTMLCanvasElement | null;
  compact?: boolean;
}

/** チェックリストに表示するカテゴリの並び */
const DETECTION_CATEGORIES: DetectionCategory[] = ["face", "plate"];

/** レタッチパネル（RedactToolbar 再利用 + AI 自動検出 + 領域数 + 適用フッター） */
export const RetouchPanel: React.FC<RetouchPanelProps> = ({
  tools,
  previewSource,
  compact,
}) => {
  const { t } = useTranslation();
  const { retouch, applyingTool } = tools;
  const { detect } = retouch;

  // 検出済み（0 件を含む）かどうか（チェックリスト / 0 件通知の出し分け）
  const hasResult = detect.candidates !== null;
  const detectDisabled =
    !detect.supported ||
    detect.failed ||
    detect.running ||
    previewSource === null ||
    applyingTool !== null;

  return (
    <ToolPanel
      title={t("studio.panel.retouchTitle")}
      description={t("studio.panel.retouchDescription")}
      compact={compact}
      footer={
        <Button
          variant="primary"
          onClick={() => void retouch.apply()}
          disabled={!retouch.canApply || applyingTool !== null}
          className={styles.applyButton}
        >
          {t("studio.retouch.apply")}
        </Button>
      }
    >
      <RedactToolbar
        redactStyle={retouch.style}
        onStyleChange={retouch.setStyle}
        regionCount={retouch.currentRegions.length}
        onClearRegions={retouch.clearRegions}
      />

      {/* AI 自動検出（顔・ナンバープレート） */}
      <div className={styles.detectSection}>
        <div className={styles.detectHeader}>
          <span className={styles.detectTitle}>
            {t("studio.retouch.detect.title")}
          </span>
          <span className={styles.aiBadge}>{t("studio.panel.aiBadge")}</span>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            if (previewSource) {
              void detect.run(previewSource);
            }
          }}
          disabled={detectDisabled}
        >
          {detect.running
            ? t("studio.retouch.detect.running")
            : t("studio.retouch.detect.run")}
        </Button>
        {!detect.supported && (
          <p className={styles.detectError}>
            {t("studio.retouch.detect.unsupported")}
          </p>
        )}
        {detect.failed && (
          <p className={styles.detectError}>
            {t("studio.retouch.detect.failed")}
          </p>
        )}
        {detect.running && (
          <div className={styles.progressBox}>
            <div className={styles.progressRow}>
              <span>
                {detect.downloadPercent !== null
                  ? t("studio.retouch.detect.preparingModel", {
                      percent: detect.downloadPercent,
                    })
                  : t("studio.retouch.detect.detecting")}
              </span>
              {detect.downloadPercent !== null && (
                <span>{detect.downloadPercent}%</span>
              )}
            </div>
            {detect.downloadPercent !== null && (
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${detect.downloadPercent}%` }}
                />
              </div>
            )}
          </div>
        )}
        {hasResult && detect.counts.face + detect.counts.plate === 0 && (
          <p className={styles.note}>{t("studio.retouch.detect.empty")}</p>
        )}
        {hasResult && detect.counts.face + detect.counts.plate > 0 && (
          <>
            {DETECTION_CATEGORIES.map(
              (category) =>
                detect.counts[category] > 0 && (
                  <label key={category} className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={detect.selection[category]}
                      onChange={(event) =>
                        detect.toggleCategory(category, event.target.checked)
                      }
                      className={styles.checkbox}
                    />
                    <span>
                      {t(`studio.retouch.detect.count.${category}`, {
                        count: detect.counts[category],
                      })}
                    </span>
                  </label>
                ),
            )}
            <Button
              variant="primary"
              onClick={detect.addSelectedToRegions}
              disabled={detect.selectedCount === 0}
            >
              {t("studio.retouch.detect.addToRegions", {
                count: detect.selectedCount,
              })}
            </Button>
          </>
        )}
        {!hasResult && !detect.running && (
          <p className={styles.note}>{t("studio.retouch.detect.modelNote")}</p>
        )}
      </div>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={retouch.preserveExif}
          onChange={(event) => retouch.setPreserveExif(event.target.checked)}
          className={styles.checkbox}
        />
        <span>{t("redact.preserveExif")}</span>
      </label>
    </ToolPanel>
  );
};
