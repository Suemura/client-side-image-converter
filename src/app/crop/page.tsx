"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import {
  ASPECT_RATIO_PRESETS,
  type CropArea,
  type CropState,
  type CropTransform,
  IDENTITY_TRANSFORM,
  resolveCropForIndex,
  rotateLeft,
  rotateRight,
} from "../../utils/cropGeometry";
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
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [cropResults, setCropResults] = useState<CropResult[]>([]);
  const [preserveExif, setPreserveExif] = useState(false);

  // トリミング設定
  const [aspectRatioId, setAspectRatioId] = useState("free");
  const [applyToAll, setApplyToAll] = useState(true);
  // 一括モードの共有領域・変換
  const [sharedArea, setSharedArea] = useState<CropArea | null>(null);
  const [sharedTransform, setSharedTransform] =
    useState<CropTransform>(IDENTITY_TRANSFORM);
  // 画像ごとの領域・変換
  const [perImageArea, setPerImageArea] = useState<
    Record<number, CropArea | null>
  >({});
  const [perImageTransform, setPerImageTransform] = useState<
    Record<number, CropTransform>
  >({});

  const aspectRatio = useMemo(
    () =>
      ASPECT_RATIO_PRESETS.find((p) => p.id === aspectRatioId)?.ratio ?? null,
    [aspectRatioId],
  );

  // 現在表示中の画像に適用される領域・変換（一括 / 画像ごとで解決）
  const currentArea = applyToAll
    ? sharedArea
    : (perImageArea[currentPreviewIndex] ?? null);
  const currentTransform = applyToAll
    ? sharedTransform
    : (perImageTransform[currentPreviewIndex] ?? IDENTITY_TRANSFORM);

  // 変換設定を一括 / 画像ごとの適切なストアへ書き込む
  const setCurrentArea = useCallback(
    (area: CropArea | null) => {
      if (applyToAll) {
        setSharedArea(area);
      } else {
        setPerImageArea((prev) => ({ ...prev, [currentPreviewIndex]: area }));
      }
    },
    [applyToAll, currentPreviewIndex],
  );

  const applyTransform = useCallback(
    (next: CropTransform) => {
      if (applyToAll) {
        setSharedTransform(next);
      } else {
        setPerImageTransform((prev) => ({
          ...prev,
          [currentPreviewIndex]: next,
        }));
      }
      // 向きが変わるためトリミング領域はリセットし、再読込時に全体へ初期化する
      setCurrentArea(null);
    },
    [applyToAll, currentPreviewIndex, setCurrentArea],
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
      })
      .catch((error) => {
        console.error("Preview generation failed:", error);
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
    setSharedArea(null);
    setSharedTransform(IDENTITY_TRANSFORM);
    setPerImageArea({});
    setPerImageTransform({});
  }, []);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter((file) =>
        file.type.startsWith("image/"),
      );
      setFiles(imageFiles);
      setCurrentPreviewIndex(0);
      setCropResults([]);
      resetCropSettings();
    },
    [resetCropSettings],
  );

  const handleClearFiles = useCallback(() => {
    setFiles([]);
    setCurrentPreviewIndex(0);
    setCropResults([]);
    resetCropSettings();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
  }, [previewUrl, resetCropSettings]);

  const handleCropAreaChange = useCallback(
    (newCropArea: CropArea) => {
      setCurrentArea(newCropArea);
    },
    [setCurrentArea],
  );

  const handlePreviousImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i > 0 ? i - 1 : files.length - 1));
  }, [files.length]);

  const handleNextImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i < files.length - 1 ? i + 1 : 0));
  }, [files.length]);

  const handleRotateLeft = useCallback(() => {
    applyTransform({
      ...currentTransform,
      rotation: rotateLeft(currentTransform.rotation),
    });
  }, [applyTransform, currentTransform]);

  const handleRotateRight = useCallback(() => {
    applyTransform({
      ...currentTransform,
      rotation: rotateRight(currentTransform.rotation),
    });
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
      if (nextApplyToAll) {
        setSharedArea(currentArea);
        setSharedTransform(currentTransform);
      } else {
        setPerImageArea((prev) => ({
          ...prev,
          [currentPreviewIndex]: currentArea,
        }));
        setPerImageTransform((prev) => ({
          ...prev,
          [currentPreviewIndex]: currentTransform,
        }));
      }
      setApplyToAll(nextApplyToAll);
    },
    [applyToAll, currentArea, currentTransform, currentPreviewIndex],
  );

  const handleStartCropping = useCallback(async () => {
    if (files.length === 0 || !currentArea) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);

    try {
      const state: CropState = {
        applyToAll,
        sharedArea,
        sharedTransform,
        perImageArea,
        perImageTransform,
      };
      const jobs: CropJob[] = files.map((_, index) =>
        resolveCropForIndex(index, state),
      );

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
    } finally {
      setIsProcessing(false);
    }
  }, [
    files,
    currentArea,
    applyToAll,
    sharedArea,
    sharedTransform,
    perImageArea,
    perImageTransform,
    preserveExif,
  ]);

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
