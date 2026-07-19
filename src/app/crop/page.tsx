"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { ErrorNotice } from "../../components/ErrorNotice";
import { HandoffNotice } from "../../components/HandoffNotice";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import { useApplyScopeStore } from "../../hooks/useApplyScopeStore";
import { useHandoffReceiver } from "../../hooks/useHandoffReceiver";
import { useImageNavigation } from "../../hooks/useImageNavigation";
import { resolveScopedValueForIndex } from "../../utils/applyScope";
import { SUPPORTED_IMAGE_FORMATS } from "../../utils/constants";
import {
  ASPECT_RATIO_PRESETS,
  type CropArea,
  type CropTransform,
  IDENTITY_TRANSFORM,
  rotateLeft,
  rotateRight,
} from "../../utils/cropGeometry";
import { isImageFile } from "../../utils/fileUtils";
import {
  type CropJob,
  type CropResult,
  createOrientedPreviewUrl,
  cropImages,
} from "../../utils/imageCropper";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { CropSelector } from "./components/CropSelector";
import { CropToolbar } from "./components/CropToolbar";
import styles from "./crop.module.css";

export default function CropPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const {
    currentIndex: currentPreviewIndex,
    setCurrentIndex: setCurrentPreviewIndex,
    handlePrevious: handlePreviousImage,
    handleNext: handleNextImage,
  } = useImageNavigation(files.length);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);
  const [preserveExif, setPreserveExif] = useState(false);
  // バッチ全体が失敗した場合のエラー通知（個別ファイルの失敗は results 側で表示）
  const [batchError, setBatchError] = useState(false);
  // プレビュー生成の失敗通知（次の生成成功でクリアする）
  const [previewError, setPreviewError] = useState(false);

  // トリミング設定（領域・変換の 2 ストアが同じ applyToAll トグルを共有する dual-store）
  const [aspectRatioId, setAspectRatioId] = useState("free");
  const [applyToAll, setApplyToAll] = useState(true);
  const areaStore = useApplyScopeStore<CropArea | null>(
    applyToAll,
    currentPreviewIndex,
    null,
  );
  const transformStore = useApplyScopeStore<CropTransform>(
    applyToAll,
    currentPreviewIndex,
    IDENTITY_TRANSFORM,
  );

  const aspectRatio = useMemo(
    () =>
      ASPECT_RATIO_PRESETS.find((p) => p.id === aspectRatioId)?.ratio ?? null,
    [aspectRatioId],
  );

  // 現在表示中の画像に適用される領域・変換（一括 / 画像ごとで解決）
  const currentArea = areaStore.current;
  const currentTransform = transformStore.current;
  const setCurrentArea = areaStore.setCurrent;

  // 変換を適用する。回転（90 度刻みで寸法が入れ替わる）時のみ領域をリセットし、
  // 反転は寸法が変わらないため選択済み領域を保持する。
  const applyTransform = useCallback(
    (next: CropTransform, resetArea = false) => {
      transformStore.setCurrent(next);
      if (resetArea) {
        // 向きが変わり寸法が入れ替わるためトリミング領域はリセットし、再読込時に全体へ初期化する
        setCurrentArea(null);
      }
    },
    [transformStore.setCurrent, setCurrentArea],
  );

  // 画像 / 変換の変更に合わせて EXIF 補正 + 回転/反転を焼き込んだプレビューを生成する。
  // 依存は変換の各値（回転角・反転フラグ）に限定し、適用範囲の切替だけでは再生成しない。
  const { rotation, flipHorizontal, flipVertical } = currentTransform;
  useEffect(() => {
    if (files.length === 0) {
      return;
    }
    const file = files[currentPreviewIndex];
    if (!file) {
      return;
    }
    let cancelled = false;
    createOrientedPreviewUrl(file, { rotation, flipHorizontal, flipVertical })
      .then((generated) => {
        if (cancelled) {
          URL.revokeObjectURL(generated);
          return;
        }
        setPreviewUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return generated;
        });
        setPreviewError(false);
      })
      .catch((error) => {
        console.error("Preview generation failed:", error);
        if (!cancelled) {
          setPreviewError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [files, currentPreviewIndex, rotation, flipHorizontal, flipVertical]);

  // アンマウント時にプレビューURLをクリーンアップ
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const resetCropSettings = useCallback(() => {
    areaStore.reset();
    transformStore.reset();
  }, [areaStore.reset, transformStore.reset]);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter(isImageFile);
      setFiles(imageFiles);
      setCurrentPreviewIndex(0);
      setCropResults([]);
      setBatchError(false);
      setPreviewError(false);
      resetCropSettings();
    },
    [resetCropSettings, setCurrentPreviewIndex],
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
    setCropResults([]);
    setBatchError(false);
    setPreviewError(false);
    resetCropSettings();
    clearHandoffNotice();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  }, [
    previewUrl,
    resetCropSettings,
    clearHandoffNotice,
    setCurrentPreviewIndex,
  ]);

  const handleCropAreaChange = useCallback(
    (newCropArea: CropArea) => {
      setCurrentArea(newCropArea);
    },
    [setCurrentArea],
  );

  const handleRotateLeft = useCallback(() => {
    // 回転は寸法が入れ替わるため領域をリセットする
    applyTransform(
      {
        ...currentTransform,
        rotation: rotateLeft(currentTransform.rotation),
      },
      true,
    );
  }, [applyTransform, currentTransform]);

  const handleRotateRight = useCallback(() => {
    applyTransform(
      {
        ...currentTransform,
        rotation: rotateRight(currentTransform.rotation),
      },
      true,
    );
  }, [applyTransform, currentTransform]);

  const handleToggleFlipHorizontal = useCallback(() => {
    applyTransform({
      ...currentTransform,
      flipHorizontal: !currentTransform.flipHorizontal,
    });
  }, [applyTransform, currentTransform]);

  const handleToggleFlipVertical = useCallback(() => {
    applyTransform({
      ...currentTransform,
      flipVertical: !currentTransform.flipVertical,
    });
  }, [applyTransform, currentTransform]);

  // 一括 / 画像ごとの切替時、表示が飛ばないよう現在値を移行先へ引き継ぐ
  const handleApplyModeChange = useCallback(
    (nextApplyToAll: boolean) => {
      if (nextApplyToAll === applyToAll) return;
      areaStore.migrate(nextApplyToAll);
      transformStore.migrate(nextApplyToAll);
      setApplyToAll(nextApplyToAll);
    },
    [applyToAll, areaStore.migrate, transformStore.migrate],
  );

  const handleStartCropping = useCallback(async () => {
    if (files.length === 0 || !currentArea) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);
    setBatchError(false);

    try {
      const jobs: CropJob[] = files.map((_, index) => ({
        area: resolveScopedValueForIndex(index, areaStore.state, null),
        transform: resolveScopedValueForIndex(
          index,
          transformStore.state,
          IDENTITY_TRANSFORM,
        ),
      }));

      const results = await cropImages(
        files,
        jobs,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        },
        preserveExif,
      );

      setCropResults(results);
    } catch (error) {
      console.error("Crop error:", error);
      setBatchError(true);
    } finally {
      setIsProcessing(false);
    }
  }, [files, currentArea, areaStore.state, transformStore.state, preserveExif]);

  const handleClearResults = useCallback(() => {
    setCropResults([]);
  }, []);

  // トリミングボタンの状態を計算
  const isCropButtonDisabled =
    files.length === 0 || !currentArea || isProcessing;
  const hasResults = cropResults.length > 0;

  // プレビュー（焼き込み済み画像）が切り替わったら CropSelector を作り直して初期領域を確定させる。
  // previewUrl は画像/変換に対応した正しい向きの画像が準備できた時だけ更新されるため、
  // 変換直後に古い寸法で領域が初期化されるのを防げる。
  const selectorKey = previewUrl;

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

                  <ErrorNotice
                    message={previewError ? t("crop.previewError") : null}
                  />

                  <CropToolbar
                    aspectRatioId={aspectRatioId}
                    onAspectRatioChange={setAspectRatioId}
                    transform={currentTransform}
                    onRotateLeft={handleRotateLeft}
                    onRotateRight={handleRotateRight}
                    onToggleFlipHorizontal={handleToggleFlipHorizontal}
                    onToggleFlipVertical={handleToggleFlipVertical}
                    applyToAll={applyToAll}
                    onApplyModeChange={handleApplyModeChange}
                    showApplyMode={files.length > 1}
                  />

                  {previewUrl && (
                    <CropSelector
                      key={selectorKey}
                      imageUrl={previewUrl}
                      onCropAreaChange={handleCropAreaChange}
                      initialCropArea={currentArea || undefined}
                      aspectRatio={aspectRatio}
                      currentIndex={currentPreviewIndex}
                      totalImages={files.length}
                      onPreviousImage={handlePreviousImage}
                      onNextImage={handleNextImage}
                    />
                  )}
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
                <div className={styles.progressWrapper}>
                  <ProgressBar
                    current={progressCurrent}
                    total={progressTotal}
                    isVisible={true}
                  />
                </div>
              )}

              <ErrorNotice message={batchError ? t("crop.cropError") : null} />

              {hasResults ? (
                <ConversionResults
                  cropResults={cropResults}
                  onClear={handleClearResults}
                  showComparison={false}
                  handoffOrigin="crop"
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
