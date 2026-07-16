"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { HandoffNotice } from "../../components/HandoffNotice";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import { useHandoffReceiver } from "../../hooks/useHandoffReceiver";
import { SUPPORTED_IMAGE_FORMATS } from "../../utils/constants";
import type { CropArea } from "../../utils/cropGeometry";
import type { CropResult } from "../../utils/imageCropper";
import { renderOrientedImage } from "../../utils/imageCropper";
import { redactImages } from "../../utils/imageRedactor";
import {
  addRegion,
  DEFAULT_REDACT_STYLE,
  type RedactRegion,
  type RedactStyle,
  removeRegion,
  updateRegionArea,
} from "../../utils/redactCore";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { RedactSelector } from "./components/RedactSelector";
import { RedactToolbar } from "./components/RedactToolbar";
import styles from "./redact.module.css";

/** 未設定インデックスの既定値（毎レンダーで新しい配列を作らないためのモジュール定数） */
const EMPTY_REGIONS: RedactRegion[] = [];

export default function RedactPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [redactResults, setRedactResults] = useState<CropResult[]>([]);
  const [preserveExif, setPreserveExif] = useState(false);

  // 隠し方の設定（ページ全体で 1 つ）と画像ごとのレタッチ領域
  const [redactStyle, setRedactStyle] =
    useState<RedactStyle>(DEFAULT_REDACT_STYLE);
  const [perImageRegions, setPerImageRegions] = useState<
    Record<number, RedactRegion[]>
  >({});
  // 領域 id の採番（画像をまたいで一意）
  const nextRegionIdRef = useRef(1);

  const currentRegions = perImageRegions[currentPreviewIndex] ?? EMPTY_REGIONS;

  // 画像の切り替えに合わせて EXIF Orientation 補正済みのソースキャンバスを生成する
  useEffect(() => {
    if (files.length === 0) {
      setSourceCanvas(null);
      return;
    }
    const file = files[currentPreviewIndex];
    if (!file) {
      return;
    }
    let cancelled = false;
    renderOrientedImage(file)
      .then((canvas) => {
        if (!cancelled) {
          setSourceCanvas(canvas);
        }
      })
      .catch((error) => {
        console.error("Preview generation failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [files, currentPreviewIndex]);

  const resetRedactSettings = useCallback(() => {
    setPerImageRegions({});
    nextRegionIdRef.current = 1;
  }, []);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter((file) =>
        file.type.startsWith("image/"),
      );
      setFiles(imageFiles);
      setCurrentPreviewIndex(0);
      setRedactResults([]);
      resetRedactSettings();
    },
    [resetRedactSettings],
  );

  // 他ツールからのハンドオフ（処理結果の引き継ぎ）を mount 時に取り込む
  const { notice: handoffNotice, clearNotice: clearHandoffNotice } =
    useHandoffReceiver(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
      handleFilesSelected,
    );

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setCurrentPreviewIndex(0);
    setRedactResults([]);
    setSourceCanvas(null);
    resetRedactSettings();
    clearHandoffNotice();
  }, [resetRedactSettings, clearHandoffNotice]);

  // 領域操作（リスト操作は redactCore の純粋関数に委譲する）
  const handleAddRegion = useCallback(
    (area: CropArea) => {
      const region: RedactRegion = { id: nextRegionIdRef.current, area };
      nextRegionIdRef.current += 1;
      setPerImageRegions((prev) => ({
        ...prev,
        [currentPreviewIndex]: addRegion(
          prev[currentPreviewIndex] ?? EMPTY_REGIONS,
          region,
        ),
      }));
    },
    [currentPreviewIndex],
  );

  const handleUpdateRegion = useCallback(
    (id: number, area: CropArea) => {
      setPerImageRegions((prev) => ({
        ...prev,
        [currentPreviewIndex]: updateRegionArea(
          prev[currentPreviewIndex] ?? EMPTY_REGIONS,
          id,
          area,
        ),
      }));
    },
    [currentPreviewIndex],
  );

  const handleRemoveRegion = useCallback(
    (id: number) => {
      setPerImageRegions((prev) => ({
        ...prev,
        [currentPreviewIndex]: removeRegion(
          prev[currentPreviewIndex] ?? EMPTY_REGIONS,
          id,
        ),
      }));
    },
    [currentPreviewIndex],
  );

  const handleClearRegions = useCallback(() => {
    setPerImageRegions((prev) => ({
      ...prev,
      [currentPreviewIndex]: EMPTY_REGIONS,
    }));
  }, [currentPreviewIndex]);

  const handlePreviousImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i > 0 ? i - 1 : files.length - 1));
  }, [files.length]);

  const handleNextImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i < files.length - 1 ? i + 1 : 0));
  }, [files.length]);

  // 全画像の指定済み領域の合計（実行ボタンの活性判定）
  const totalRegionCount = useMemo(
    () =>
      files.reduce(
        (sum, _, index) => sum + (perImageRegions[index]?.length ?? 0),
        0,
      ),
    [files, perImageRegions],
  );

  const handleStartRedacting = useCallback(async () => {
    if (files.length === 0 || totalRegionCount === 0) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);

    try {
      const results = await redactImages(
        files,
        { perImageRegions },
        redactStyle,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        },
        preserveExif,
      );
      setRedactResults(results);
    } catch (error) {
      console.error("Redact error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [files, totalRegionCount, perImageRegions, redactStyle, preserveExif]);

  const handleClearResults = useCallback(() => {
    setRedactResults([]);
  }, []);

  const isRedactButtonDisabled =
    files.length === 0 || totalRegionCount === 0 || isProcessing;
  const hasResults = redactResults.length > 0;

  // 画像の切り替え時にセレクターを作り直し、ドラッグ途中の状態を持ち越さない
  const selectorKey = `${currentPreviewIndex}:${files[currentPreviewIndex]?.name ?? ""}`;

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("redact.title")}</h1>
          <p className={styles.pageSubtitle}>{t("redact.subtitle")}</p>

          <div className={styles.redactPageContainer}>
            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.redactColumn}>
              <HandoffNotice
                notice={handoffNotice}
                onDismiss={clearHandoffNotice}
              />
              <ImageUploadSection
                files={files}
                onFilesSelected={handleFilesSelected}
                onClearFiles={handleClearFiles}
              />
            </div>

            {/* 中央カラム: レタッチ操作 */}
            <div className={styles.redactColumnCenter}>
              <h3 className={styles.redactCenterTitle}>
                {t("redact.selectRedactArea")}
              </h3>

              {files.length === 0 ? (
                <div className={styles.placeholder}>
                  {t("redact.selectImageFirst")}
                </div>
              ) : (
                <>
                  <p className={styles.centerDescription}>
                    {t("redact.dragToAddRegion")}
                  </p>

                  <RedactToolbar
                    redactStyle={redactStyle}
                    onStyleChange={setRedactStyle}
                    regionCount={currentRegions.length}
                    onClearRegions={handleClearRegions}
                  />

                  {sourceCanvas && (
                    <RedactSelector
                      key={selectorKey}
                      sourceCanvas={sourceCanvas}
                      regions={currentRegions}
                      redactStyle={redactStyle}
                      onAddRegion={handleAddRegion}
                      onUpdateRegion={handleUpdateRegion}
                      onRemoveRegion={handleRemoveRegion}
                      currentIndex={currentPreviewIndex}
                      totalImages={files.length}
                      onPreviousImage={handlePreviousImage}
                      onNextImage={handleNextImage}
                    />
                  )}
                </>
              )}

              <div className={styles.redactOptions}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={preserveExif}
                    onChange={(e) => setPreserveExif(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span className={styles.checkboxText}>
                    {t("redact.preserveExif")}
                  </span>
                </label>
                <div className={styles.helpText}>
                  {t("redact.preserveExifHelp")}
                </div>
                {files.length > 1 && (
                  <div className={styles.helpText}>
                    {t("redact.noRegionHelp")}
                  </div>
                )}
              </div>

              <div className={styles.centerButton}>
                {isProcessing ? (
                  <div className={styles.processingText}>
                    {t("redact.redactingInProgress")}
                  </div>
                ) : hasResults ? (
                  <div className={styles.buttonGroup}>
                    <Button
                      variant="primary"
                      onClick={handleStartRedacting}
                      disabled={isRedactButtonDisabled}
                    >
                      {t("redact.reRedact")}
                    </Button>
                    <Button variant="secondary" onClick={handleClearFiles}>
                      {t("redact.selectNewImage")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleStartRedacting}
                    disabled={isRedactButtonDisabled}
                  >
                    {t("redact.startRedacting")}
                  </Button>
                )}
              </div>
            </div>

            {/* 右カラム: 処理済みファイルリスト */}
            <div className={styles.redactColumn}>
              <h4 className={styles.redactColumnTitle}>
                {t("redact.processedFiles")}
              </h4>

              {isProcessing && (
                <div className={styles.progressWrapper}>
                  <ProgressBar
                    current={progressCurrent}
                    total={progressTotal}
                    isVisible={true}
                  />
                </div>
              )}

              {hasResults ? (
                <ConversionResults
                  cropResults={redactResults}
                  onClear={handleClearResults}
                  showComparison={false}
                  handoffOrigin="redact"
                />
              ) : (
                <div className={styles.placeholder}>
                  {t("redact.processingPlaceholder")}
                </div>
              )}
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
