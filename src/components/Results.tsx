import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadMultiple, downloadSingle } from "../utils/fileDownloader";
import { formatFileSize, truncateFileName } from "../utils/fileName";
import {
  isFolderSaveSupported,
  saveResultsToFolder,
} from "../utils/folderExport";
import {
  conversionResultsToFiles,
  cropResultsToFiles,
  type ToolId,
} from "../utils/handoff";
import type { ConversionResult } from "../utils/imageConverter";
import { calculateCompressionRatio } from "../utils/imageConverter";
import type { CropResult } from "../utils/imageCropper";
import { Button } from "./Button";
import { FileDetailModal } from "./FileDetailModal";
import { HandoffSend } from "./HandoffSend";
import { ImageComparisonModal } from "./ImageComparisonModal";
import styles from "./Results.module.css";

interface ConversionResultsProps {
  results?: ConversionResult[];
  cropResults?: CropResult[];
  originalFiles?: File[];
  onClear: () => void;
  showComparison?: boolean;
  /** 指定するとハンドオフの送出コントロール（この結果を次のツールへ）を表示する */
  handoffOrigin?: ToolId;
}

export const ConversionResults: React.FC<ConversionResultsProps> = ({
  results,
  cropResults,
  originalFiles = [],
  onClear,
  showComparison = true,
  handoffOrigin,
}) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ConversionResult | null>(
    null,
  );
  const [selectedCropResult, setSelectedCropResult] =
    useState<CropResult | null>(null);
  const [originalImageUrls, setOriginalImageUrls] = useState<
    Record<string, string>
  >({});
  const [cropPreviewUrls, setCropPreviewUrls] = useState<
    Record<string, string>
  >({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  // File System Access API の feature detection（SSG hydration 差異を避けるため useEffect で判定）
  const [canSaveToFolder, setCanSaveToFolder] = useState(false);
  const [isSavingToFolder, setIsSavingToFolder] = useState(false);
  const [folderSaveMessage, setFolderSaveMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setCanSaveToFolder(isFolderSaveSupported());
  }, []);

  // シンプルな条件チェック
  const isConversionMode = results && results.length > 0;
  const isCropMode = cropResults && cropResults.length > 0;

  // 元画像のURL生成（変換モードのみ）
  useEffect(() => {
    // トリミングモードでは元画像のURL生成をスキップ
    if (isCropMode) {
      return;
    }

    if (!isConversionMode || !originalFiles.length) {
      setOriginalImageUrls({});
      return;
    }

    const urls: Record<string, string> = {};
    for (const file of originalFiles) {
      if (file.type.startsWith("image/")) {
        urls[file.name] = URL.createObjectURL(file);
      }
    }
    setOriginalImageUrls(urls);

    // クリーンアップ
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [originalFiles, isConversionMode, isCropMode]);

  // トリミング結果のプレビューURL生成（トリミングモードのみ）
  useEffect(() => {
    if (!isCropMode || !cropResults) {
      setCropPreviewUrls({});
      return;
    }

    const urls: Record<string, string> = {};
    cropResults.forEach((result, index) => {
      if (result.success && result.croppedBlob) {
        urls[`${result.fileName}-${index}`] = URL.createObjectURL(
          result.croppedBlob,
        );
      }
    });
    setCropPreviewUrls(urls);

    // クリーンアップ
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [cropResults, isCropMode]);

  const handleDownloadSingle = useCallback((result: ConversionResult) => {
    downloadSingle(result);
  }, []);

  const handleCropDownload = useCallback((result: CropResult) => {
    if (!result.success) return;
    downloadSingle(result);
  }, []);

  const handleDownloadZip = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      if (isCropMode && cropResults) {
        // トリミング結果の一括ダウンロード（ZIPファイル作成）
        await downloadMultiple(cropResults);
      } else if (results) {
        await downloadMultiple(results);
      }
    } catch (error) {
      console.error("Download error:", error);
      alert(t("results.downloadError"));
    } finally {
      setIsDownloading(false);
    }
  }, [results, cropResults, isCropMode, isDownloading, t]);

  // 選択したローカルフォルダへ結果を直接書き込む（ZIP を経由しない）
  const handleSaveToFolder = useCallback(async () => {
    if (isSavingToFolder) return;

    setIsSavingToFolder(true);
    setFolderSaveMessage(null);
    try {
      const targets = isCropMode && cropResults ? cropResults : (results ?? []);
      const outcome = await saveResultsToFolder(targets);
      if (outcome.status === "saved") {
        setFolderSaveMessage(
          t("results.savedToFolder", { count: outcome.writtenCount }),
        );
      } else if (outcome.status === "no-entries") {
        setFolderSaveMessage(t("results.noEntriesToSave"));
      } else if (outcome.status === "error") {
        setFolderSaveMessage(
          t("results.saveToFolderError", {
            written: outcome.writtenCount,
            total: outcome.totalCount,
          }),
        );
      }
      // cancelled（picker のユーザーキャンセル）は何も表示しない
    } catch (error) {
      console.error("Folder save error:", error);
      setFolderSaveMessage(t("results.saveToFolderFailed"));
    } finally {
      setIsSavingToFolder(false);
    }
  }, [results, cropResults, isCropMode, isSavingToFolder, t]);

  const handleImageClick = useCallback((result: ConversionResult) => {
    setSelectedResult(result);
    setIsModalOpen(true);
  }, []);

  const handleCropImageClick = useCallback((result: CropResult) => {
    if (!result.success) return;
    setSelectedCropResult(result);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedResult(null);
    setSelectedCropResult(null);
  }, []);

  const resultsToShow = useMemo(() => results || [], [results]);
  const cropResultsToShow = useMemo(() => cropResults || [], [cropResults]);

  // ハンドオフ送出用: 成功結果の MIME タイプ一覧（送り先候補の絞り込みに使う）。
  // crop は croppedFile.type（元ファイルの MIME）ではなく実エンコード結果の
  // croppedBlob.type を使う（BMP 入力の PNG フォールバック等で乖離するため）。
  const handoffMimeTypes = useMemo(() => {
    if (isCropMode && cropResults) {
      return [
        ...new Set(
          cropResults
            .filter((result) => result.success)
            .map((result) => result.croppedBlob.type),
        ),
      ];
    }
    if (results) {
      return [...new Set(results.map((result) => result.blob.type))];
    }
    return [];
  }, [isCropMode, cropResults, results]);

  // ハンドオフ送出用: File[] の生成（送出クリック時にのみ実行される）
  const getHandoffFiles = useCallback(() => {
    if (isCropMode && cropResults) {
      return cropResultsToFiles(cropResults);
    }
    if (results) {
      return conversionResultsToFiles(results);
    }
    return [];
  }, [isCropMode, cropResults, results]);

  // 統計情報の計算を最適化
  const statistics = useMemo(() => {
    if (!isConversionMode) {
      return {
        totalOriginalSize: 0,
        totalConvertedSize: 0,
        overallCompressionRatio: 0,
      };
    }

    // 単一の走査で両方の値を計算
    const { totalOriginalSize, totalConvertedSize } = resultsToShow.reduce(
      (acc, result) => ({
        totalOriginalSize: acc.totalOriginalSize + result.originalSize,
        totalConvertedSize: acc.totalConvertedSize + result.convertedSize,
      }),
      { totalOriginalSize: 0, totalConvertedSize: 0 },
    );

    const overallCompressionRatio = calculateCompressionRatio(
      totalOriginalSize,
      totalConvertedSize,
    );

    return {
      totalOriginalSize,
      totalConvertedSize,
      overallCompressionRatio,
    };
  }, [isConversionMode, resultsToShow]);

  const { totalOriginalSize, totalConvertedSize, overallCompressionRatio } =
    statistics;

  if (!isConversionMode && !isCropMode) {
    return null;
  }

  const fileCount = isCropMode
    ? cropResultsToShow.length
    : resultsToShow.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {t("results.title")} ({fileCount}
          {t("results.fileUnit")})
        </h3>
      </div>

      <div className={styles.buttonGroup}>
        <Button
          variant="primary"
          onClick={handleDownloadZip}
          disabled={isDownloading}
        >
          {isDownloading ? t("results.creating") : t("results.downloadZip")}
        </Button>
        {canSaveToFolder && (
          <Button
            variant="secondary"
            onClick={handleSaveToFolder}
            disabled={isSavingToFolder}
          >
            {isSavingToFolder
              ? t("results.savingToFolder")
              : t("results.saveToFolder")}
          </Button>
        )}
        <Button variant="secondary" onClick={onClear}>
          {t("results.clear")}
        </Button>
      </div>

      {/* フォルダ保存の完了 / 失敗フィードバック */}
      {folderSaveMessage && (
        <p className={styles.folderSaveMessage} role="status">
          {folderSaveMessage}
        </p>
      )}

      {/* ハンドオフ送出コントロール（結果をダウンロードせず次のツールへ） */}
      {handoffOrigin && (
        <HandoffSend
          origin={handoffOrigin}
          mimeTypes={handoffMimeTypes}
          getFiles={getHandoffFiles}
          onSent={onClear}
        />
      )}

      {/* 統計情報（コンバージョンモードのみ） */}
      {isConversionMode && (
        <div className={styles.statsContainer}>
          <div>
            <p className={styles.statLabel}>{t("results.originalSize")}</p>
            <p className={styles.statValue}>
              {formatFileSize(totalOriginalSize)}
            </p>
          </div>
          <div>
            <p className={styles.statLabel}>{t("results.convertedSize")}</p>
            <p className={styles.statValue}>
              {formatFileSize(totalConvertedSize)}
            </p>
          </div>
          <div>
            <p className={styles.statLabel}>{t("results.compressionRatio")}</p>
            <p
              className={
                overallCompressionRatio > 0
                  ? styles.statValuePositive
                  : styles.statValueNegative
              }
            >
              {overallCompressionRatio > 0 ? "-" : "+"}
              {Math.abs(overallCompressionRatio)}%
            </p>
          </div>
        </div>
      )}

      {/* ファイルリスト */}
      <div className={styles.fileList}>
        {isCropMode
          ? // トリミング結果の表示
            cropResultsToShow.map((result, index) => (
              <div
                key={`crop-${result.fileName}-${index}`}
                className={styles.fileItem}
              >
                <div className={styles.fileContent}>
                  <div className={styles.fileInfoContainer}>
                    {/* プレビュー画像 */}
                    <button
                      type="button"
                      className={styles.previewImage}
                      onClick={() => handleCropImageClick(result)}
                      aria-label={t("results.viewDetails", {
                        name: result.fileName,
                      })}
                    >
                      {result.success &&
                      cropPreviewUrls[`${result.fileName}-${index}`] ? (
                        <img
                          src={cropPreviewUrls[`${result.fileName}-${index}`]}
                          alt={result.fileName}
                          className={styles.previewImageImg}
                        />
                      ) : result.success ? (
                        <div className={styles.previewImagePlaceholder}>📷</div>
                      ) : (
                        <div className={styles.previewImagePlaceholder}>⚠️</div>
                      )}
                    </button>

                    {/* ファイル情報 */}
                    <div>
                      <p className={styles.fileName} title={result.fileName}>
                        {truncateFileName(result.fileName, 15)}
                      </p>
                      <div className={styles.fileSizeInfo}>
                        {result.success ? (
                          <span className={styles.fileSizeText}>
                            {(result.croppedBlob.size / 1024).toFixed(1)} KB
                          </span>
                        ) : (
                          <span className={styles.errorText}>
                            {result.error || t("results.processingError")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ダウンロードボタン */}
                {result.success && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => handleCropDownload(result)}
                    aria-label={t("results.download")}
                  >
                    ↓
                  </Button>
                )}
              </div>
            ))
          : // コンバージョン結果の表示
            resultsToShow.map((result, index) => {
              const compressionRatio = calculateCompressionRatio(
                result.originalSize,
                result.convertedSize,
              );

              return (
                <div
                  key={`convert-${result.filename}-${index}`}
                  className={styles.fileItem}
                >
                  <div className={styles.fileContent}>
                    <div className={styles.fileInfoContainer}>
                      {/* プレビュー画像 */}
                      <button
                        type="button"
                        className={styles.previewImage}
                        onClick={() => handleImageClick(result)}
                        aria-label={t("results.viewComparison", {
                          name: result.filename,
                        })}
                      >
                        <img
                          src={result.url}
                          alt={result.filename}
                          className={styles.previewImageImg}
                        />
                      </button>

                      {/* ファイル情報 */}
                      <div>
                        <p className={styles.fileName}>{result.filename}</p>
                        <div className={styles.fileSizeInfo}>
                          <span className={styles.fileSizeText}>
                            {formatFileSize(result.originalSize)} →{" "}
                            {formatFileSize(result.convertedSize)}
                          </span>
                          <span
                            className={
                              compressionRatio > 0
                                ? styles.compressionRatioPositive
                                : styles.compressionRatioNegative
                            }
                          >
                            {compressionRatio > 0 ? "-" : "+"}
                            {Math.abs(compressionRatio)}%
                          </span>
                        </div>
                        {/* 目標ファイルサイズに到達できなかった場合の警告（最小サイズで出力） */}
                        {result.targetSizeAchieved === false && (
                          <p className={styles.targetWarningText} role="alert">
                            ⚠️ {t("results.targetSizeNotAchieved")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ダウンロードボタン */}
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => handleDownloadSingle(result)}
                    aria-label={t("results.download")}
                  >
                    ↓
                  </Button>
                </div>
              );
            })}
      </div>

      {/* モーダル表示 */}
      {showComparison && selectedResult && isModalOpen && (
        <ImageComparisonModal
          result={selectedResult}
          originalImageUrl={
            originalImageUrls[selectedResult.originalFilename] || ""
          }
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}

      {/* トリミング結果用のFileDetailModal */}
      {!showComparison && selectedCropResult && isModalOpen && (
        <FileDetailModal
          file={
            new File(
              [selectedCropResult.croppedBlob],
              selectedCropResult.fileName,
              {
                type: selectedCropResult.croppedBlob.type,
              },
            )
          }
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
