"use client";

import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { FileList } from "../../components/FileList";
import { FileUploadArea } from "../../components/FileUploadArea";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import {
  type CropArea,
  type CropResult,
  ImageCropper,
} from "../../utils/imageCropper";
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
      const results = await ImageCropper.cropImages(
        files,
        cropArea,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        },
      );

      setCropResults(results);
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [files, cropArea]);

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
        <div style={{ padding: "2rem" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "bold",
              color: "var(--foreground)",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            {t("crop.title")}
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--muted-foreground)",
              textAlign: "center",
              marginBottom: "3rem",
              maxWidth: "600px",
              margin: "0 auto 3rem",
            }}
          >
            {t("crop.subtitle")}
          </p>

          <div className={styles.cropPageContainer}>
            {/* 左余白 */}
            <div></div>

            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.cropColumn}>
              <h4 className={styles.cropColumnTitle}>
                {t("crop.filesSelected")}
              </h4>

              {files.length === 0 ? (
                <FileUploadArea
                  files={files}
                  onFilesSelected={handleFilesSelected}
                  onClearFiles={handleClearFiles}
                />
              ) : (
                <>
                  <FileList files={files} onClearFiles={handleClearFiles} />
                  <div style={{ marginTop: "1rem" }}>
                    <Button variant="secondary" onClick={handleClearFiles}>
                      {t("crop.selectNewImage")}
                    </Button>
                  </div>
                </>
              )}

              {files.length === 0 && (
                <p
                  style={{
                    color: "var(--muted-foreground)",
                    fontSize: "0.875rem",
                    textAlign: "center",
                    marginTop: "1rem",
                  }}
                >
                  {t("crop.batchCropDescription")}
                </p>
              )}
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

              <div className={styles.centerButton}>
                {isProcessing ? (
                  <div className={styles.processingText}>
                    {t("crop.croppingInProgress")}
                  </div>
                ) : hasResults ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      justifyContent: "center",
                    }}
                  >
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

            {/* 右余白 */}
            <div></div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
