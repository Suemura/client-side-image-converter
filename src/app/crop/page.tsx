"use client";

import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { FileList } from "../../components/FileList";
import { FileUploadArea } from "../../components/FileUploadArea";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ImageCropper, type CropArea, type CropResult } from "../../utils/imageCropper";
import { ProgressBar } from "../convert/components/ProgressBar";
import { ConversionResults } from "../convert/components/ConversionResults";
import { CropSelector } from "./components/CropSelector";
import styles from "./crop.module.css";

export default function CropPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [currentStep, setCurrentStep] = useState<"upload" | "select" | "processing" | "results">("upload");
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);  const [cropResults, setCropResults] = useState<CropResult[]>([]);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    const imageFiles = selectedFiles.filter(file => file.type.startsWith("image/"));
    setFiles(imageFiles);

    if (imageFiles.length > 0) {
      // プレビュー用に最初の画像を使用
      const url = URL.createObjectURL(imageFiles[0]);
      setPreviewUrl(url);
      setCurrentStep("select");
    }
  }, []);

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setCurrentStep("upload");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  }, [previewUrl]);

  const handleCropAreaChange = useCallback((newCropArea: CropArea) => {
    setCropArea(newCropArea);
  }, []);

  const handleStartCropping = useCallback(async () => {
    if (files.length === 0 || !cropArea) return;

    setIsProcessing(true);
    setCurrentStep("processing");
    setProgressCurrent(0);
    setProgressTotal(files.length);

    try {
      const results = await ImageCropper.cropImages(
        files,
        cropArea,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        }
      );

      setCropResults(results);
      // 結果表示時も3カラム構成を維持するため、selectステップのままにする
      setCurrentStep("select");
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [files, cropArea]);

  const handleBackToUpload = useCallback(() => {
    handleClearFiles();
  }, [handleClearFiles]);

  const handleClearResults = useCallback(() => {
    setCropResults([]);
    // 3カラム構成を維持するため、uploadステップには戻らない
    // setCurrentStep("upload");
    // handleClearFiles();
  }, []);

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

          {currentStep === "upload" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2rem",
                alignItems: "center",
              }}
            >
              <FileUploadArea
                files={files}
                onFilesSelected={handleFilesSelected}
                onClearFiles={handleClearFiles}
              />
              <p
                style={{
                  color: "var(--muted-foreground)",
                  fontSize: "1rem",
                  textAlign: "center",
                }}
              >
                複数の画像を選択してまとめてクロップできます
              </p>
            </div>
          )}

          {currentStep === "select" && (
            <div className={styles.cropPageContainer}>
              {/* 左カラム: 変換前ファイルリスト */}
              <div className={styles.cropColumn}>
                <FileList
                  files={files}
                  onClearFiles={handleClearFiles}
                />
                <div style={{ marginTop: "1rem" }}>
                  <Button variant="secondary" onClick={handleBackToUpload}>
                    {t("crop.backToUpload")}
                  </Button>
                </div>
              </div>

              {/* 中央カラム: クロップ操作 */}
              <div className={styles.cropColumnCenter}>
                <h3 className={styles.cropCenterTitle}>
                  {t("crop.selectCropArea")}
                </h3>
                <p className={styles.centerDescription}>
                  {t("crop.dragToSelectArea")}
                </p>

                <CropSelector
                  imageUrl={previewUrl}
                  onCropAreaChange={handleCropAreaChange}
                  initialCropArea={cropArea || undefined}
                />

                <div className={styles.centerButton}>
                  {!isProcessing && cropResults.length === 0 && (
                    <Button
                      variant="primary"
                      onClick={handleStartCropping}
                      disabled={files.length === 0 || !cropArea}
                    >
                      {t("crop.startCropping")}
                    </Button>
                  )}
                  {!isProcessing && cropResults.length > 0 && (
                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                      <Button
                        variant="primary"
                        onClick={handleStartCropping}
                        disabled={files.length === 0 || !cropArea}
                      >
                        再クロップ
                      </Button>
                      <Button variant="secondary" onClick={handleBackToUpload}>
                        新しい画像を選択
                      </Button>
                    </div>
                  )}
                  {isProcessing && (
                    <div className={styles.processingText}>
                      処理中...
                    </div>
                  )}
                </div>
              </div>

              {/* 右カラム: 処理済みファイルリスト */}
              <div className={styles.cropColumn}>
                {isProcessing && (
                  <div style={{ marginBottom: "1rem" }}>
                    <ProgressBar
                      current={progressCurrent}
                      total={progressTotal}
                      isVisible={true}
                    />
                  </div>
                )}
                {cropResults.length > 0 ? (
                  <ConversionResults
                    cropResults={cropResults}
                    onClear={handleClearResults}
                    showComparison={false}
                  />
                ) : (
                  <>
                    <h4 className={styles.cropColumnTitle}>
                      処理済みファイル
                    </h4>
                    <div className={styles.placeholder}>
                      クロップ処理後にここに結果が表示されます
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
