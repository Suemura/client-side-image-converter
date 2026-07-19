import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../components/Button";
import { ErrorNotice } from "../../../../components/ErrorNotice";
import { RadioButtonGroup } from "../../../../components/RadioButtonGroup";
import type { GpsMode } from "../../../../hooks/useMetadataManager";
import type { StudioTools } from "../../hooks/useStudioTools";
import { ToolPanel } from "../ToolPanel";
import styles from "./InfoPanel.module.css";
import partStyles from "./PanelParts.module.css";

interface InfoPanelProps {
  tools: StudioTools;
  /** 現在選択中のファイル（概要表示） */
  currentFile: File | null;
  compact?: boolean;
}

/** 情報 / メタデータパネル（解析結果のタグ選択・GPS 処理・削除フッター） */
export const InfoPanel: React.FC<InfoPanelProps> = ({
  tools,
  currentFile,
  compact,
}) => {
  const { t } = useTranslation();
  const { info, applyingTool } = tools;
  const { manager } = info;
  const { analysis, selectedTags, toggleTag, gpsMode, setGpsMode } = manager;

  // タグの使用ファイル数（metadata ページと同じ算出）
  const getTagCount = useCallback(
    (tag: string): number => {
      if (!analysis) return 0;
      return analysis.fileMetadata.filter((fm) =>
        Object.keys(fm.exifData).includes(tag),
      ).length;
    },
    [analysis],
  );

  const hasGpsTags = analysis
    ? Array.from(analysis.allTags).some((tag) =>
        tag.toLowerCase().includes("gps"),
      )
    : false;

  const gpsModeOptions = [
    { label: t("metadata.gpsMode.remove"), value: "remove" },
    { label: t("metadata.gpsMode.round"), value: "round" },
  ];

  return (
    <ToolPanel
      title={t("studio.panel.infoTitle")}
      description={t("studio.panel.infoDescription")}
      compact={compact}
      footer={
        <Button
          variant="primary"
          onClick={() => void info.remove()}
          disabled={
            selectedTags.size === 0 ||
            applyingTool !== null ||
            manager.isAnalyzing
          }
          className={partStyles.applyButton}
        >
          {t("studio.info.remove")}
        </Button>
      }
    >
      {currentFile && (
        <div className={styles.fileSummary}>
          <div className={styles.fileName}>{currentFile.name}</div>
          <div className={styles.fileMeta}>
            {(currentFile.size / 1024 / 1024).toFixed(2)} MB ·{" "}
            {currentFile.type || "-"}
          </div>
        </div>
      )}

      <ErrorNotice
        message={manager.analysisError ? t("metadata.analysisError") : null}
      />
      <ErrorNotice
        message={manager.removeError ? t("metadata.removeError") : null}
      />

      {manager.isAnalyzing ? (
        <p className={styles.analyzing}>{t("metadata.analyzingMetadata")}</p>
      ) : analysis ? (
        <>
          <ErrorNotice
            message={
              analysis.analysisFailures.length > 0
                ? t("metadata.analysisFailures")
                : null
            }
            fileNames={analysis.analysisFailures}
          />

          {analysis.privacyRiskTags.size > 0 && (
            <div>
              <h3 className={styles.sectionTitle}>
                {t("metadata.privacyRiskTags")} ({analysis.privacyRiskTags.size}
                )
              </h3>
              <div className={styles.tagList}>
                {Array.from(analysis.privacyRiskTags).map((tag) => (
                  <label key={tag} className={styles.tagItem}>
                    <input
                      type="checkbox"
                      checked={selectedTags.has(tag)}
                      onChange={() => toggleTag(tag)}
                      className={partStyles.checkbox}
                    />
                    <span className={`${styles.tagName} ${styles.riskTag}`}>
                      {tag}
                    </span>
                    <span className={styles.tagCount}>{getTagCount(tag)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {analysis.allTags.size > 0 ? (
            <div>
              <h3 className={styles.sectionTitle}>
                {t("metadata.allExifTags")} ({analysis.allTags.size})
              </h3>
              <div className={styles.tagList}>
                {Array.from(analysis.allTags)
                  .sort()
                  .map((tag) => (
                    <label key={tag} className={styles.tagItem}>
                      <input
                        type="checkbox"
                        checked={selectedTags.has(tag)}
                        onChange={() => toggleTag(tag)}
                        className={partStyles.checkbox}
                      />
                      <span className={styles.tagName}>{tag}</span>
                      <span className={styles.tagCount}>
                        {getTagCount(tag)}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          ) : (
            <p className={styles.analyzing}>{t("metadata.noMetadataFound")}</p>
          )}

          {hasGpsTags && (
            <div>
              <h3 className={styles.sectionTitle}>
                {t("metadata.gpsMode.title")}
              </h3>
              <RadioButtonGroup
                name="studio-gps-mode"
                options={gpsModeOptions}
                selectedValue={gpsMode}
                onChange={(value) => setGpsMode(value as GpsMode)}
              />
            </div>
          )}
        </>
      ) : null}
    </ToolPanel>
  );
};
