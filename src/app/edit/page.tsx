"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import {
  type AdjustmentState,
  DEFAULT_ADJUSTMENTS,
  type EditState,
  isDefaultAdjustments,
  resolveAdjustmentForIndex,
} from "../../utils/adjustments";
import type {
  ConversionFailure,
  ConversionResult,
} from "../../utils/imageConverter";
import { renderOrientedImage } from "../../utils/imageCropper";
import {
  type EditJob,
  type EditOutputFormat,
  editImages,
} from "../../utils/imageEditor";
import type { EditableSource } from "../../utils/webglImageRenderer";
import { ConversionErrors } from "../convert/components/ConversionErrors";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { AdjustmentPanel } from "./components/AdjustmentPanel";
import { CompareView } from "./components/CompareView";
import { EditToolbar } from "./components/EditToolbar";
import styles from "./edit.module.css";

export default function EditPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [previewSource, setPreviewSource] = useState<EditableSource | null>(
    null,
  );
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [editResults, setEditResults] = useState<ConversionResult[]>([]);
  const [editFailures, setEditFailures] = useState<ConversionFailure[]>([]);

  // 出力設定
  const [preserveExif, setPreserveExif] = useState(false);
  const [outputFormat, setOutputFormat] =
    useState<EditOutputFormat>("original");

  // 調整（一括 / 画像ごとの dual-store。crop の apply-scope パターンを踏襲）
  const [applyToAll, setApplyToAll] = useState(true);
  const [sharedAdjustments, setSharedAdjustments] =
    useState<AdjustmentState>(DEFAULT_ADJUSTMENTS);
  const [perImageAdjustments, setPerImageAdjustments] = useState<
    Record<number, AdjustmentState>
  >({});

  // 現在表示中の画像へ適用する調整（一括 / 画像ごとで解決）
  const currentAdjustments = applyToAll
    ? sharedAdjustments
    : (perImageAdjustments[currentPreviewIndex] ?? DEFAULT_ADJUSTMENTS);

  // 調整を一括 / 画像ごとの適切なストアへ書き込む（crop の setCurrentArea 相当）
  const setCurrentAdjustments = useCallback(
    (next: AdjustmentState) => {
      if (applyToAll) {
        setSharedAdjustments(next);
      } else {
        setPerImageAdjustments((prev) => ({
          ...prev,
          [currentPreviewIndex]: next,
        }));
      }
    },
    [applyToAll, currentPreviewIndex],
  );

  // 画像切替に合わせて EXIF 補正済みのプレビューソース（キャンバス）を生成する
  useEffect(() => {
    if (files.length === 0) {
      setPreviewSource(null);
      return;
    }
    const file = files[currentPreviewIndex];
    if (!file) {
      return;
    }
    let cancelled = false;
    renderOrientedImage(file)
      .then((canvas) => {
        if (cancelled) {
          return;
        }
        setPreviewSource(canvas);
        setPreviewSize({ width: canvas.width, height: canvas.height });
      })
      .catch((error) => {
        console.error("Preview generation failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [files, currentPreviewIndex]);

  const resetAdjustments = useCallback(() => {
    setSharedAdjustments(DEFAULT_ADJUSTMENTS);
    setPerImageAdjustments({});
  }, []);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter((file) =>
        file.type.startsWith("image/"),
      );
      setFiles(imageFiles);
      setCurrentPreviewIndex(0);
      setEditResults([]);
      setEditFailures([]);
      resetAdjustments();
    },
    [resetAdjustments],
  );

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setCurrentPreviewIndex(0);
    setEditResults([]);
    setEditFailures([]);
    setPreviewSource(null);
    resetAdjustments();
  }, [resetAdjustments]);

  const handlePreviousImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i > 0 ? i - 1 : files.length - 1));
  }, [files.length]);

  const handleNextImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i < files.length - 1 ? i + 1 : 0));
  }, [files.length]);

  // 一括 / 画像ごとの切替時、表示が飛ばないよう現在値を移行先へ引き継ぐ（crop の handleApplyModeChange 踏襲）
  const handleApplyModeChange = useCallback(
    (nextApplyToAll: boolean) => {
      if (nextApplyToAll === applyToAll) return;
      if (nextApplyToAll) {
        setSharedAdjustments(currentAdjustments);
      } else {
        setPerImageAdjustments((prev) => ({
          ...prev,
          [currentPreviewIndex]: currentAdjustments,
        }));
      }
      setApplyToAll(nextApplyToAll);
    },
    [applyToAll, currentAdjustments, currentPreviewIndex],
  );

  const handleStartEditing = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);
    setEditResults([]);
    setEditFailures([]);

    try {
      const state: EditState = {
        applyToAll,
        sharedAdjustments,
        perImageAdjustments,
      };
      const jobs: EditJob[] = files.map((_, index) => ({
        adjustments: resolveAdjustmentForIndex(index, state),
      }));

      const { results, failures } = await editImages(
        files,
        jobs,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        },
        { preserveExif, outputFormat },
      );

      setEditResults(results);
      setEditFailures(failures);
    } catch (error) {
      console.error("Edit error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [
    files,
    applyToAll,
    sharedAdjustments,
    perImageAdjustments,
    preserveExif,
    outputFormat,
  ]);

  const handleClearResults = useCallback(() => {
    for (const result of editResults) {
      URL.revokeObjectURL(result.url);
    }
    setEditResults([]);
    setEditFailures([]);
  }, [editResults]);

  const hasFiles = files.length > 0;
  const hasResults = editResults.length > 0;
  // 一括モードは共有調整、画像ごとモードはいずれかの画像に調整があれば全体リセットを有効化
  const hasAdjustments = applyToAll
    ? !isDefaultAdjustments(sharedAdjustments)
    : Object.values(perImageAdjustments).some(
        (adjustments) => !isDefaultAdjustments(adjustments),
      );

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("edit.title")}</h1>
          <p className={styles.pageSubtitle}>{t("edit.subtitle")}</p>

          <div className={styles.workspace}>
            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.column}>
              <ImageUploadSection
                files={files}
                onFilesSelected={handleFilesSelected}
                onClearFiles={handleClearFiles}
              />
            </div>

            {/* 中央カラム: プレビュー・ツールバー・実行 */}
            <div className={styles.columnCenter}>
              <h3 className={styles.centerTitle}>{t("edit.previewTitle")}</h3>

              {!hasFiles ? (
                <div className={styles.placeholder}>
                  {t("edit.selectImageFirst")}
                </div>
              ) : (
                <>
                  <CompareView
                    source={previewSource}
                    width={previewSize.width}
                    height={previewSize.height}
                    adjustments={currentAdjustments}
                    currentIndex={currentPreviewIndex}
                    totalImages={files.length}
                    onPreviousImage={handlePreviousImage}
                    onNextImage={handleNextImage}
                  />

                  <EditToolbar
                    applyToAll={applyToAll}
                    onApplyModeChange={handleApplyModeChange}
                    showApplyMode={files.length > 1}
                    outputFormat={outputFormat}
                    onOutputFormatChange={setOutputFormat}
                    preserveExif={preserveExif}
                    onPreserveExifChange={setPreserveExif}
                    onResetAll={resetAdjustments}
                    hasAdjustments={hasAdjustments}
                  />

                  <div className={styles.actionButton}>
                    {isProcessing ? (
                      <div className={styles.processingText}>
                        {t("edit.editingInProgress")}
                      </div>
                    ) : hasResults ? (
                      <div className={styles.buttonGroup}>
                        <Button
                          variant="primary"
                          onClick={handleStartEditing}
                          disabled={isProcessing}
                        >
                          {t("edit.reEdit")}
                        </Button>
                        <Button variant="secondary" onClick={handleClearFiles}>
                          {t("edit.selectNewImage")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={handleStartEditing}
                        disabled={isProcessing}
                      >
                        {t("edit.apply")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 右カラム: 調整スライダー */}
            <div className={styles.column}>
              <h4 className={styles.columnTitle}>{t("edit.adjustments")}</h4>
              {hasFiles ? (
                <AdjustmentPanel
                  adjustments={currentAdjustments}
                  onAdjustmentsChange={setCurrentAdjustments}
                />
              ) : (
                <div className={styles.placeholder}>
                  {t("edit.selectImageFirst")}
                </div>
              )}
            </div>
          </div>

          {/* 結果セクション（進捗・失敗通知・処理済みファイル） */}
          <div className={styles.resultsSection}>
            {isProcessing && (
              <ProgressBar
                current={progressCurrent}
                total={progressTotal}
                isVisible={true}
              />
            )}
            <ConversionErrors
              failures={editFailures}
              titleKey="edit.editFailures"
            />
            {hasResults && (
              <ConversionResults
                results={editResults}
                originalFiles={files}
                onClear={handleClearResults}
              />
            )}
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
