import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import type { ConversionResult } from "../../../utils/imageConverter";
import { ImageConverter } from "../../../utils/imageConverter";
import styles from "./ConversionResults.module.css";

interface ConversionResultsProps {
  results: ConversionResult[];
  onClear: () => void;
}

export const ConversionResults: React.FC<ConversionResultsProps> = ({
  results,
  onClear,
}) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadSingle = useCallback((result: ConversionResult) => {
    ImageConverter.downloadFile(result);
  }, []);

  const handleDownloadZip = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    try {
      await ImageConverter.downloadAsZip(results);
    } catch (error) {
      console.error("Zipダウンロードエラー:", error);
      alert("Zipファイルのダウンロードに失敗しました。");
    } finally {
      setIsDownloading(false);
    }
  }, [results, isDownloading]);

  if (results.length === 0) {
    return null;
  }

  const totalOriginalSize = results.reduce(
    (sum, result) => sum + result.originalSize,
    0,
  );
  const totalConvertedSize = results.reduce(
    (sum, result) => sum + result.convertedSize,
    0,
  );
  const overallCompressionRatio = ImageConverter.calculateCompressionRatio(
    totalOriginalSize,
    totalConvertedSize,
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          {t("results.title")} ({results.length}
          {t("results.files")})
        </h3>
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
      </div>

      {/* 統計情報 */}
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

      {/* ファイルリスト */}
      <div className={styles.fileList}>
        {results.map((result, index) => {
          const compressionRatio = ImageConverter.calculateCompressionRatio(
            result.originalSize,
            result.convertedSize,
          );

          return (
            <div
              key={`${result.filename}-${index}`}
              className={styles.fileItem}
            >
              <div className={styles.fileContent}>
                <div className={styles.fileInfoContainer}>
                  {/* プレビュー画像 */}
                  <div className={styles.previewImage}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.url}
                      alt={result.filename}
                      className={styles.previewImageImg}
                    />
                  </div>

                  {/* ファイル情報 */}
                  <div>
                    <p className={styles.fileName}>{result.filename}</p>
                    <div className={styles.fileSizeInfo}>
                      <span className={styles.fileSizeText}>
                        {ImageConverter.formatFileSize(result.originalSize)} →{" "}
                        {ImageConverter.formatFileSize(result.convertedSize)}
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
              >
                {t("results.download")}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
