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
import type { CropResult } from "../../utils/imageCropper";
import type { RemoveBgOutputFormat } from "../../utils/removeBgCore";
import {
  type RemoveBgBatchHandle,
  runRemoveBgBatch,
} from "../../utils/removeBgRunner";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { RemoveBgSettings } from "./components/RemoveBgSettings";
import styles from "./remove-bg.module.css";

/** 進捗表示の状態（モデル準備 → 推論の 2 段階） */
type ProgressState =
  | { stage: "download"; percent: number }
  | {
      stage: "inference";
      currentFile: number;
      totalFiles: number;
      percent: number;
    };

export default function RemoveBgPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] = useState<RemoveBgOutputFormat>("png");
  const [preserveExif, setPreserveExif] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [removeBgResults, setRemoveBgResults] = useState<CropResult[]>([]);
  const [wasCancelled, setWasCancelled] = useState(false);

  // 実行中バッチのハンドル（キャンセル用）
  const batchHandleRef = useRef<RemoveBgBatchHandle | null>(null);

  // アンマウント時に実行中のバッチを止める（Worker の後始末）
  useEffect(() => {
    return () => {
      batchHandleRef.current?.cancel();
    };
  }, []);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    const imageFiles = selectedFiles.filter((file) =>
      file.type.startsWith("image/"),
    );
    setFiles(imageFiles);
    setRemoveBgResults([]);
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
    setRemoveBgResults([]);
    setWasCancelled(false);
    clearHandoffNotice();
  }, [clearHandoffNotice]);

  const handleStartRemoving = useCallback(async () => {
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setWasCancelled(false);
    setRemoveBgResults([]);
    setProgress({ stage: "download", percent: 0 });

    const handle = runRemoveBgBatch(
      files,
      { outputFormat, preserveExif },
      {
        onDownloadProgress: (_stage, loadedBytes, totalBytes) => {
          setProgress({
            stage: "download",
            percent: totalBytes
              ? Math.round((loadedBytes / totalBytes) * 100)
              : 0,
          });
        },
        onFileProgress: (fileIndex, totalFiles) => {
          setProgress({
            stage: "inference",
            currentFile: fileIndex + 1,
            totalFiles,
            percent: Math.round((fileIndex / totalFiles) * 100),
          });
        },
      },
    );
    batchHandleRef.current = handle;

    try {
      const { results, cancelled } = await handle.promise;
      setRemoveBgResults(results);
      setWasCancelled(cancelled);
    } catch (error) {
      console.error("Background removal error:", error);
    } finally {
      batchHandleRef.current = null;
      setIsProcessing(false);
      setProgress(null);
    }
  }, [files, isProcessing, outputFormat, preserveExif]);

  const handleCancel = useCallback(() => {
    batchHandleRef.current?.cancel();
  }, []);

  const handleClearResults = useCallback(() => {
    setRemoveBgResults([]);
    setWasCancelled(false);
  }, []);

  const isRemoveButtonDisabled = files.length === 0 || isProcessing;
  const hasResults = removeBgResults.length > 0;

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("removeBg.title")}</h1>
          <p className={styles.pageSubtitle}>{t("removeBg.subtitle")}</p>

          <div className={styles.removeBgPageContainer}>
            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.removeBgColumn}>
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

            {/* 中央カラム: 出力設定・実行 */}
            <div className={styles.removeBgColumnCenter}>
              <h3 className={styles.removeBgCenterTitle}>
                {t("removeBg.settings")}
              </h3>

              {files.length === 0 ? (
                <div className={styles.placeholder}>
                  {t("removeBg.selectImageFirst")}
                </div>
              ) : (
                <RemoveBgSettings
                  outputFormat={outputFormat}
                  onOutputFormatChange={setOutputFormat}
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
                        ? t("removeBg.preparingModel", {
                            percent: progress.percent,
                          })
                        : progress
                          ? t("removeBg.removingProgress", {
                              current: progress.currentFile,
                              total: progress.totalFiles,
                            })
                          : null}
                    </div>
                    <Button variant="secondary" onClick={handleCancel}>
                      {t("removeBg.cancel")}
                    </Button>
                  </div>
                ) : hasResults ? (
                  <div className={styles.buttonGroup}>
                    <Button
                      variant="primary"
                      onClick={handleStartRemoving}
                      disabled={isRemoveButtonDisabled}
                    >
                      {t("removeBg.reRemove")}
                    </Button>
                    <Button variant="secondary" onClick={handleClearFiles}>
                      {t("removeBg.selectNewImage")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleStartRemoving}
                    disabled={isRemoveButtonDisabled}
                  >
                    {t("removeBg.startRemoving")}
                  </Button>
                )}
              </div>
            </div>

            {/* 右カラム: 処理済みファイルリスト */}
            <div className={styles.removeBgColumn}>
              <h4 className={styles.removeBgColumnTitle}>
                {t("removeBg.processedFiles")}
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
                  {t("removeBg.cancelledNotice")}
                </div>
              )}

              {hasResults ? (
                <ConversionResults
                  cropResults={removeBgResults}
                  onClear={handleClearResults}
                  handoffOrigin="remove-bg"
                />
              ) : (
                <div className={styles.placeholder}>
                  {t("removeBg.processingPlaceholder")}
                </div>
              )}
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
