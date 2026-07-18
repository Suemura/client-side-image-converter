"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { HandoffNotice } from "../../components/HandoffNotice";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import { useHandoffReceiver } from "../../hooks/useHandoffReceiver";
import { SUPPORTED_IMAGE_FORMATS } from "../../utils/constants";
import { isImageFile } from "../../utils/fileUtils";
import type { CropResult } from "../../utils/imageCropper";
import type { UpscaleScale } from "../../utils/upscaleCore";
import {
  runUpscaleBatch,
  type UpscaleBatchHandle,
} from "../../utils/upscaleRunner";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { UpscaleSettings } from "./components/UpscaleSettings";
import styles from "./upscale.module.css";

/** 進捗表示の状態（モデル準備 → タイル推論の 2 段階） */
type ProgressState =
  | { stage: "download"; percent: number }
  | {
      stage: "inference";
      currentFile: number;
      totalFiles: number;
      percent: number;
    };

export default function UpscalePage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [scale, setScale] = useState<UpscaleScale>(2);
  const [preserveExif, setPreserveExif] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [upscaleResults, setUpscaleResults] = useState<CropResult[]>([]);
  const [wasCancelled, setWasCancelled] = useState(false);

  // 実行中バッチのハンドル（キャンセル用）
  const batchHandleRef = useRef<UpscaleBatchHandle | null>(null);

  // アンマウント時に実行中のバッチを止める（Worker の後始末）
  useEffect(() => {
    return () => {
      batchHandleRef.current?.cancel();
    };
  }, []);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    const imageFiles = selectedFiles.filter(isImageFile);
    setFiles(imageFiles);
    setUpscaleResults([]);
    setWasCancelled(false);
  }, []);

  // 他ツールからのハンドオフ（処理結果の引き継ぎ）を mount 時に取り込む
  const { notice: handoffNotice, clearNotice: clearHandoffNotice } =
    useHandoffReceiver(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
      handleFilesSelected,
    );

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setUpscaleResults([]);
    setWasCancelled(false);
    clearHandoffNotice();
  }, [clearHandoffNotice]);

  const handleStartUpscaling = useCallback(async () => {
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setWasCancelled(false);
    setUpscaleResults([]);
    setProgress({ stage: "download", percent: 0 });

    const handle = runUpscaleBatch(
      files,
      { scale, preserveExif },
      {
        onDownloadProgress: (_stage, loadedBytes, totalBytes) => {
          setProgress({
            stage: "download",
            percent: totalBytes
              ? Math.round((loadedBytes / totalBytes) * 100)
              : 0,
          });
        },
        onFileProgress: (fileIndex, totalFiles, tileFraction) => {
          setProgress({
            stage: "inference",
            currentFile: fileIndex + 1,
            totalFiles,
            percent: Math.round(
              ((fileIndex + tileFraction) / totalFiles) * 100,
            ),
          });
        },
      },
    );
    batchHandleRef.current = handle;

    try {
      const { results, cancelled } = await handle.promise;
      setUpscaleResults(results);
      setWasCancelled(cancelled);
    } catch (error) {
      console.error("Upscale error:", error);
    } finally {
      batchHandleRef.current = null;
      setIsProcessing(false);
      setProgress(null);
    }
  }, [files, isProcessing, scale, preserveExif]);

  const handleCancel = useCallback(() => {
    batchHandleRef.current?.cancel();
  }, []);

  const handleClearResults = useCallback(() => {
    setUpscaleResults([]);
    setWasCancelled(false);
  }, []);

  const isUpscaleButtonDisabled = files.length === 0 || isProcessing;
  const hasResults = upscaleResults.length > 0;

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("upscale.title")}</h1>
          <p className={styles.pageSubtitle}>{t("upscale.subtitle")}</p>

          <div className={styles.upscalePageContainer}>
            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.upscaleColumn}>
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

            {/* 中央カラム: 拡大設定・実行 */}
            <div className={styles.upscaleColumnCenter}>
              <h3 className={styles.upscaleCenterTitle}>
                {t("upscale.settings")}
              </h3>

              {files.length === 0 ? (
                <div className={styles.placeholder}>
                  {t("upscale.selectImageFirst")}
                </div>
              ) : (
                <UpscaleSettings
                  scale={scale}
                  onScaleChange={setScale}
                  preserveExif={preserveExif}
                  onPreserveExifChange={setPreserveExif}
                  disabled={isProcessing}
                />
              )}

              <div className={styles.centerButton}>
                {isProcessing ? (
                  <div className={styles.processingArea}>
                    <div className={styles.processingText}>
                      {progress?.stage === "download"
                        ? t("upscale.preparingModel", {
                            percent: progress.percent,
                          })
                        : progress
                          ? t("upscale.upscalingProgress", {
                              current: progress.currentFile,
                              total: progress.totalFiles,
                            })
                          : null}
                    </div>
                    <Button variant="secondary" onClick={handleCancel}>
                      {t("upscale.cancel")}
                    </Button>
                  </div>
                ) : hasResults ? (
                  <div className={styles.buttonGroup}>
                    <Button
                      variant="primary"
                      onClick={handleStartUpscaling}
                      disabled={isUpscaleButtonDisabled}
                    >
                      {t("upscale.reUpscale")}
                    </Button>
                    <Button variant="secondary" onClick={handleClearFiles}>
                      {t("upscale.selectNewImage")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleStartUpscaling}
                    disabled={isUpscaleButtonDisabled}
                  >
                    {t("upscale.startUpscaling")}
                  </Button>
                )}
              </div>
            </div>

            {/* 右カラム: 処理済みファイルリスト */}
            <div className={styles.upscaleColumn}>
              <h4 className={styles.upscaleColumnTitle}>
                {t("upscale.processedFiles")}
              </h4>

              {isProcessing && progress && (
                <div className={styles.progressWrapper}>
                  <ProgressBar
                    current={progress.percent}
                    total={100}
                    isVisible={true}
                  />
                </div>
              )}

              {wasCancelled && (
                <div className={styles.cancelledNotice}>
                  {t("upscale.cancelledNotice")}
                </div>
              )}

              {hasResults ? (
                <ConversionResults
                  cropResults={upscaleResults}
                  onClear={handleClearResults}
                  handoffOrigin="upscale"
                />
              ) : (
                <div className={styles.placeholder}>
                  {t("upscale.processingPlaceholder")}
                </div>
              )}
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
