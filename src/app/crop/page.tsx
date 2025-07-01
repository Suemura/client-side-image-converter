"use client";

import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { FileUploadArea } from "../../components/FileUploadArea";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ImageCropper, type CropArea, type CropResult } from "../../utils/imageCropper";
import { ProgressBar } from "../convert/components/ProgressBar";
import { CropResults } from "./components/CropResults";
import { CropSelector } from "./components/CropSelector";

export default function CropPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [currentStep, setCurrentStep] = useState<"upload" | "select" | "processing" | "results">("upload");
  const [cropArea, setCropArea] = useState<CropArea>({ x: 100, y: 100, width: 300, height: 300 });
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);

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
    if (files.length === 0) return;

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
      setCurrentStep("results");
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
    setCurrentStep("upload");
    handleClearFiles();
  }, [handleClearFiles]);

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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2rem",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--border-dashed)",
                  padding: "2rem",
                  width: "100%",
                  maxWidth: "800px",
                }}
              >
                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    color: "var(--foreground)",
                    marginBottom: "1rem",
                    textAlign: "center",
                  }}
                >
                  {t("crop.selectCropArea")}
                </h3>
                <p
                  style={{
                    color: "var(--muted-foreground)",
                    fontSize: "0.875rem",
                    textAlign: "center",
                    marginBottom: "2rem",
                  }}
                >
                  {t("crop.dragToSelectArea")}
                </p>

                <CropSelector
                  imageUrl={previewUrl}
                  onCropAreaChange={handleCropAreaChange}
                  initialCropArea={cropArea}
                />
              </div>

              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--border-dashed)",
                  padding: "1.5rem",
                  width: "100%",
                  maxWidth: "600px",
                }}
              >
                <h4
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "var(--foreground)",
                    marginBottom: "1rem",
                  }}
                >
                  {t("crop.filesSelected")}
                </h4>
                <div
                  style={{
                    color: "var(--muted-foreground)",
                    fontSize: "0.875rem",
                    marginBottom: "1rem",
                  }}
                >
                  {files.length}個のファイルが選択されています
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Button
                    variant="primary"
                    onClick={handleStartCropping}
                    disabled={files.length === 0}
                  >
                    {t("crop.startCropping")}
                  </Button>
                  <Button variant="secondary" onClick={handleBackToUpload}>
                    {t("crop.backToUpload")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {currentStep === "processing" && (
            <ProgressBar
              current={progressCurrent}
              total={progressTotal}
              isVisible={true}
            />
          )}

          {currentStep === "results" && (
            <CropResults
              results={cropResults}
              onClear={handleClearResults}
            />
          )}
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
