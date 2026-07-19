"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { ErrorNotice } from "../../components/ErrorNotice";
import { HandoffNotice } from "../../components/HandoffNotice";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import { useHandoffReceiver } from "../../hooks/useHandoffReceiver";
import { useImageNavigation } from "../../hooks/useImageNavigation";
import { SUPPORTED_IMAGE_FORMATS } from "../../utils/constants";
import { buildEditJobs } from "../../utils/editJobs";
import { isImageFile } from "../../utils/fileUtils";
import { computeHistogram, type HistogramData } from "../../utils/histogram";
import type {
  ConversionFailure,
  ConversionResult,
} from "../../utils/imageConverter";
import { type EditOutputFormat, editImages } from "../../utils/imageEditor";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { AdjustmentPanel } from "./components/AdjustmentPanel";
import { CompareView } from "./components/CompareView";
import { EditToolbar } from "./components/EditToolbar";
import { HistogramPanel } from "./components/HistogramPanel";
import { LutPicker } from "./components/LutPicker";
import { ToneCurvePanel } from "./components/ToneCurvePanel";
import styles from "./edit.module.css";
import { useEditPreview } from "./hooks/useEditPreview";
import { useEditScopeStores } from "./hooks/useEditScopeStores";
import { useLutRegistry } from "./hooks/useLutRegistry";
import { useWhiteBalanceTools } from "./hooks/useWhiteBalanceTools";

export default function EditPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const {
    currentIndex: currentPreviewIndex,
    setCurrentIndex: setCurrentPreviewIndex,
    handlePrevious: handlePreviousImage,
    handleNext: handleNextImage,
  } = useImageNavigation(files.length);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [editResults, setEditResults] = useState<ConversionResult[]>([]);
  const [editFailures, setEditFailures] = useState<ConversionFailure[]>([]);
  // バッチ全体が失敗した場合のエラー通知（個別ファイルの失敗は editFailures で表示）
  const [batchError, setBatchError] = useState(false);

  // 調整・LUT 適用後のプレビューから算出したヒストグラム（CompareView からフレームを受け取る）
  const [histogram, setHistogram] = useState<HistogramData | null>(null);

  // CompareView へ渡すコールバックは安定参照にし、無関係な再レンダーで
  // 編集後描画（GPU 再描画・再サンプリング）を誘発しない
  const handleEditedFrame = useCallback((frame: ImageData) => {
    setHistogram(computeHistogram(frame.data));
  }, []);

  // 出力設定
  const [preserveExif, setPreserveExif] = useState(false);
  const [outputFormat, setOutputFormat] =
    useState<EditOutputFormat>("original");

  // 調整・LUT 選択・トーンカーブの 3 ストアが同じ applyToAll トグルを共有する dual-store
  const [applyToAll, setApplyToAll] = useState(true);
  const scopeStores = useEditScopeStores(applyToAll, currentPreviewIndex);
  const currentAdjustments = scopeStores.adjustments.current;
  const currentLutSelection = scopeStores.lut.current;
  const setCurrentAdjustments = scopeStores.adjustments.setCurrent;

  // LUT データ本体のレジストリと現在選択の解決
  const {
    currentLut,
    resolveLutApplication,
    registerLut,
    customLutName,
    setCustomLutName,
  } = useLutRegistry(currentLutSelection);

  // EXIF 補正済みプレビューソースと編集前ヒストグラムの生成
  const {
    previewSource,
    previewSize,
    sourceHistogram,
    previewError,
    resetPreview,
  } = useEditPreview(files, currentPreviewIndex);

  // 自動補正（レベル / WB）と WB スポイト
  const {
    wbEyedropperActive,
    handleToggleEyedropper,
    handleAutoLevels,
    handleAutoWhiteBalance,
    handleEyedropperPick,
  } = useWhiteBalanceTools({
    files,
    currentIndex: currentPreviewIndex,
    previewSource,
    sourceHistogram,
    currentAdjustments,
    setCurrentAdjustments,
  });

  const resetAdjustments = scopeStores.resetAll;

  // 結果の object URL（buildEditResult の createObjectURL 由来）を解放する。
  // ConversionResults 側では revoke されないため、結果を破棄・置換する前にページ側で解放する。
  const revokeResultUrls = useCallback((results: ConversionResult[]) => {
    for (const result of results) {
      URL.revokeObjectURL(result.url);
    }
  }, []);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter(isImageFile);
      // FileUploadArea は既存ファイルを保持して末尾に追加する（追記のみ・既存の
      // インデックスは不変）ため、編集中の調整値（共有 / 画像ごと）とプレビュー位置は
      // 維持する。フルリセットは「リストをクリア」（handleClearFiles）で行う。
      // 旧結果は追加後のファイルセットと不整合になるため解放して閉じる。
      revokeResultUrls(editResults);
      setFiles(imageFiles);
      setEditResults([]);
      setEditFailures([]);
      setBatchError(false);
    },
    [revokeResultUrls, editResults],
  );

  // 他ツールからのハンドオフ（処理結果の引き継ぎ）を mount 時に取り込む
  // （受理形式は FileUploadArea の既定と同じ UPLOAD_FORMATS）
  const { notice: handoffNotice, clearNotice: clearHandoffNotice } =
    useHandoffReceiver(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
      handleFilesSelected,
    );

  const handleClearFiles = useCallback(() => {
    revokeResultUrls(editResults);
    setFiles([]);
    setCurrentPreviewIndex(0);
    setEditResults([]);
    setEditFailures([]);
    setBatchError(false);
    resetPreview();
    setHistogram(null);
    resetAdjustments();
    setCustomLutName(null);
    clearHandoffNotice();
  }, [
    resetAdjustments,
    revokeResultUrls,
    editResults,
    clearHandoffNotice,
    resetPreview,
    setCurrentPreviewIndex,
    setCustomLutName,
  ]);

  // 一括 / 画像ごとの切替時、表示が飛ばないよう現在値を移行先へ引き継ぐ。
  // 調整・LUT 選択・トーンカーブは同じ applyToAll を共有するためすべて移行する。
  const handleApplyModeChange = useCallback(
    (nextApplyToAll: boolean) => {
      if (nextApplyToAll === applyToAll) return;
      scopeStores.migrateAll(nextApplyToAll);
      setApplyToAll(nextApplyToAll);
    },
    [applyToAll, scopeStores.migrateAll],
  );

  const handleStartEditing = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);
    // 再編集時は旧結果の object URL を解放してから置き換える（リーク防止）
    revokeResultUrls(editResults);
    setEditResults([]);
    setEditFailures([]);
    setBatchError(false);

    try {
      const jobs = buildEditJobs(
        files.length,
        scopeStores.adjustments.state,
        scopeStores.lut.state,
        resolveLutApplication,
        scopeStores.toneCurve.state,
      );

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
      setBatchError(true);
    } finally {
      setIsProcessing(false);
    }
  }, [
    files,
    scopeStores.adjustments.state,
    scopeStores.lut.state,
    scopeStores.toneCurve.state,
    resolveLutApplication,
    preserveExif,
    outputFormat,
    revokeResultUrls,
    editResults,
  ]);

  const handleClearResults = useCallback(() => {
    revokeResultUrls(editResults);
    setEditResults([]);
    setEditFailures([]);
  }, [revokeResultUrls, editResults]);

  const hasFiles = files.length > 0;
  const hasResults = editResults.length > 0;
  const hasAdjustments = scopeStores.hasAdjustments;

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

            {/* 中央カラム: プレビュー・ツールバー・実行 */}
            <div className={styles.columnCenter}>
              <h3 className={styles.centerTitle}>{t("edit.previewTitle")}</h3>

              {!hasFiles ? (
                <div className={styles.placeholder}>
                  {t("edit.selectImageFirst")}
                </div>
              ) : (
                <>
                  <ErrorNotice
                    message={previewError ? t("edit.previewError") : null}
                  />
                  <CompareView
                    source={previewSource}
                    width={previewSize.width}
                    height={previewSize.height}
                    adjustments={currentAdjustments}
                    lut={currentLut}
                    curve={scopeStores.currentCurveTable}
                    currentIndex={currentPreviewIndex}
                    totalImages={files.length}
                    onPreviousImage={handlePreviousImage}
                    onNextImage={handleNextImage}
                    onEditedFrame={handleEditedFrame}
                    eyedropperActive={wbEyedropperActive}
                    onEyedropperPick={handleEyedropperPick}
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

            {/* 右カラム: ヒストグラム + 調整スライダー + LUT フィルタ */}
            <div className={styles.column}>
              {hasFiles && <HistogramPanel histogram={histogram} />}
              <h4 className={styles.columnTitle}>{t("edit.adjustments")}</h4>
              {hasFiles ? (
                <>
                  <AdjustmentPanel
                    adjustments={currentAdjustments}
                    onAdjustmentsChange={setCurrentAdjustments}
                    onAutoLevels={handleAutoLevels}
                    onAutoWhiteBalance={handleAutoWhiteBalance}
                    onToggleEyedropper={handleToggleEyedropper}
                    eyedropperActive={wbEyedropperActive}
                    autoDisabled={!sourceHistogram}
                  />
                  <ToneCurvePanel
                    curve={scopeStores.toneCurve.current}
                    onCurveChange={scopeStores.toneCurve.setCurrent}
                    histogram={sourceHistogram}
                  />
                  <LutPicker
                    selection={currentLutSelection}
                    onSelectionChange={scopeStores.lut.setCurrent}
                    registerLut={registerLut}
                    customName={customLutName}
                    onCustomLoaded={setCustomLutName}
                  />
                </>
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
            <ErrorNotice message={batchError ? t("edit.editError") : null} />
            <ErrorNotice
              message={editFailures.length > 0 ? t("edit.editFailures") : null}
              fileNames={editFailures.map((failure) => failure.fileName)}
            />
            {hasResults && (
              <ConversionResults
                results={editResults}
                originalFiles={files}
                onClear={handleClearResults}
                handoffOrigin="edit"
              />
            )}
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
