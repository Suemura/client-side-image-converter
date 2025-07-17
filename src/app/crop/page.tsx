"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import {
  type CropArea,
  type CropResult,
  cropImages,
} from "../../utils/imageCropper";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { CropSelector } from "./components/CropSelector";
import styles from "./crop.module.css";

export default function CropPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);
  const [preserveExif, setPreserveExif] = useState(false);

  // プレビューURL管理のためのuseEffect
  useEffect(() => {
    return () => {
      // コンポーネントがアンマウントされる際にプレビューURLをクリーンアップ
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter((file) =>
        file.type.startsWith("image/"),
      );
      setFiles(imageFiles);
      setCurrentPreviewIndex(0); // 最初の画像に戻す

      if (imageFiles.length > 0) {
        // 古いプレビューURLをクリーンアップ
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }
        // 新しいプレビューURLを作成
        const url = URL.createObjectURL(imageFiles[0]);
        setPreviewUrl(url);
      }
    },
    [previewUrl],
  );

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setCurrentPreviewIndex(0);
    setCropResults([]);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  }, [previewUrl]);

  const handleCropAreaChange = useCallback((newCropArea: CropArea) => {
    setCropArea(newCropArea);
  }, []);

  const handlePreviousImage = useCallback(() => {
    if (files.length === 0) return;

    const newIndex =
      currentPreviewIndex > 0 ? currentPreviewIndex - 1 : files.length - 1;
    setCurrentPreviewIndex(newIndex);

    // プレビューURLを更新
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(files[newIndex]);
    setPreviewUrl(url);
  }, [files, currentPreviewIndex, previewUrl]);

  const handleNextImage = useCallback(() => {
    if (files.length === 0) return;

    const newIndex =
      currentPreviewIndex < files.length - 1 ? currentPreviewIndex + 1 : 0;
    setCurrentPreviewIndex(newIndex);

    // プレビューURLを更新
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(files[newIndex]);
    setPreviewUrl(url);
  }, [files, currentPreviewIndex, previewUrl]);

  const handleStartCropping = useCallback(async () => {
    if (files.length === 0 || !cropArea) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);

    try {
      const results = await cropImages(
        files,
        cropArea,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        },
        preserveExif,
      );

      setCropResults(results);
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [files, cropArea, preserveExif]);

  const handleClearResults = useCallback(() => {
    setCropResults([]);
  }, []);

  // トリミングボタンの状態を計算
  const isCropButtonDisabled = files.length === 0 || !cropArea || isProcessing;
  const hasResults = cropResults.length > 0;

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("crop.title")}</h1>
          <p className={styles.pageSubtitle}>{t("crop.subtitle")}</p>

          <div className={styles.cropPageContainer}>
            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.cropColumn}>
              <ImageUploadSection
                files={files}
                onFilesSelected={handleFilesSelected}
                onClearFiles={handleClearFiles}
              />
            </div>

            {/* 中央カラム: トリミング操作 */}
            <div className={styles.cropColumnCenter}>
              <h3 className={styles.cropCenterTitle}>
                {t("crop.selectCropArea")}
              </h3>

              {files.length === 0 ? (
                <div className={styles.placeholder}>
                  {t("crop.selectImageFirst")}
                </div>
              ) : (
                <>
                  <p className={styles.centerDescription}>
                    {t("crop.dragToSelectArea")}
                  </p>

                  <CropSelector
                    imageUrl={previewUrl}
                    onCropAreaChange={handleCropAreaChange}
                    initialCropArea={cropArea || undefined}
                    currentIndex={currentPreviewIndex}
                    totalImages={files.length}
                    onPreviousImage={handlePreviousImage}
                    onNextImage={handleNextImage}
                  />
                </>
              )}

              <div className={styles.cropOptions}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={preserveExif}
                    onChange={(e) => setPreserveExif(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span className={styles.checkboxText}>
                    {t("crop.preserveExif")}
                  </span>
                </label>
                <div className={styles.helpText}>
                  {t("crop.preserveExifHelp")}
                </div>
              </div>

              <div className={styles.centerButton}>
                {isProcessing ? (
                  <div className={styles.processingText}>
                    {t("crop.croppingInProgress")}
                  </div>
                ) : hasResults ? (
                  <div className={styles.buttonGroup}>
                    <Button
                      variant="primary"
                      onClick={handleStartCropping}
                      disabled={isCropButtonDisabled}
                    >
                      {t("crop.reCrop")}
                    </Button>
                    <Button variant="secondary" onClick={handleClearFiles}>
                      {t("crop.selectNewImage")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleStartCropping}
                    disabled={isCropButtonDisabled}
                  >
                    {t("crop.startCropping")}
                  </Button>
                )}
              </div>
            </div>

            {/* 右カラム: 処理済みファイルリスト */}
            <div className={styles.cropColumn}>
              <h4 className={styles.cropColumnTitle}>
                {t("crop.processedFiles")}
              </h4>

              {isProcessing && (
                <div style={{ marginBottom: "1rem" }}>
                  <ProgressBar
                    current={progressCurrent}
                    total={progressTotal}
                    isVisible={true}
                  />
                </div>
              )}

              {hasResults ? (
                <ConversionResults
                  cropResults={cropResults}
                  onClear={handleClearResults}
                  showComparison={false}
                />
              ) : (
                <div className={styles.placeholder}>
                  {t("crop.processingPlaceholder")}
                </div>
              )}
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
