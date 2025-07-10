import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDownloader } from "../utils/fileDownloader";
import { truncateFileName } from "../utils/fileName";
import type { ConversionResult } from "../utils/imageConverter";
import { ImageConverter } from "../utils/imageConverter";
import type { CropResult } from "../utils/imageCropper";
import { Button } from "./Button";
import { FileDetailModal } from "./FileDetailModal";
import { ImageComparisonModal } from "./ImageComparisonModal";
import styles from "./Results.module.css";

interface ConversionResultsProps {
  results?: ConversionResult[];
  cropResults?: CropResult[];
  originalFiles?: File[];
  onClear: () => void;
  showComparison?: boolean;
}

export const ConversionResults: React.FC<ConversionResultsProps> = ({
  results,
  cropResults,
  originalFiles = [],
  onClear,
  showComparison = true,
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
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cropResults, isCropMode]);

  const handleDownloadSingle = useCallback((result: ConversionResult) => {
    FileDownloader.downloadSingle(result);
  }, []);

  const handleCropDownload = useCallback((result: CropResult) => {
    if (!result.success) return;
    FileDownloader.downloadSingle(result);
  }, []);

  const handleDownloadZip = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      if (isCropMode && cropResults) {
        // トリミング結果の一括ダウンロード（ZIPファイル作成）
        await FileDownloader.downloadMultiple(cropResults);
      } else if (results) {
        await FileDownloader.downloadMultiple(results);
      }
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      alert("ファイルのダウンロードに失敗しました。");
    } finally {
      setIsDownloading(false);
    }
  }, [results, cropResults, isCropMode, isDownloading]);

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

  if (!isConversionMode && !isCropMode) {
    return null;
  }

  const resultsToShow = results || [];
  const cropResultsToShow = cropResults || [];
  const fileCount = isCropMode
    ? cropResultsToShow.length
    : resultsToShow.length;

  let totalOriginalSize = 0;
  let totalConvertedSize = 0;
  let overallCompressionRatio = 0;

  if (isConversionMode) {
    totalOriginalSize = resultsToShow.reduce(
      (sum, result) => sum + result.originalSize,
      0,
    );
    totalConvertedSize = resultsToShow.reduce(
      (sum, result) => sum + result.convertedSize,
      0,
    );
    overallCompressionRatio = ImageConverter.calculateCompressionRatio(
      totalOriginalSize,
      totalConvertedSize,
    );
  }

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
        <Button variant="secondary" onClick={onClear}>
          {t("results.clear")}
        </Button>
      </div>

      {/* 統計情報（コンバージョンモードのみ） */}
      {isConversionMode && (
        <div className={styles.statsContainer}>
          <div>
            <p className={styles.statLabel}>{t("results.originalSize")}</p>
            <p className={styles.statValue}>
              {ImageConverter.formatFileSize(totalOriginalSize)}
            </p>
          </div>
          <div>
            <p className={styles.statLabel}>{t("results.convertedSize")}</p>
            <p className={styles.statValue}>
              {ImageConverter.formatFileSize(totalConvertedSize)}
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
                      style={{ cursor: "pointer" }}
                      aria-label={`${result.fileName}の詳細を表示`}
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
                            {result.error || "処理エラー"}
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
              const compressionRatio = ImageConverter.calculateCompressionRatio(
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
                        style={{ cursor: "pointer" }}
                        aria-label={`${result.filename}の変換前後比較を表示`}
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
                            {ImageConverter.formatFileSize(result.originalSize)}{" "}
                            →{" "}
                            {ImageConverter.formatFileSize(
                              result.convertedSize,
                            )}
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
          originalImageUrl={originalImageUrls[selectedResult.originalFilename] || ""}
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
