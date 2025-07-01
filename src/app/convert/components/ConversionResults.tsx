import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { ImageComparisonModal } from "../../../components/ImageComparisonModal";
import type { ConversionResult } from "../../../utils/imageConverter";
import { ImageConverter } from "../../../utils/imageConverter";
import styles from "./ConversionResults.module.css";

interface ConversionResultsProps {
  results: ConversionResult[];
  originalFiles: File[];
  onClear: () => void;
}

export const ConversionResults: React.FC<ConversionResultsProps> = ({
  results,
  originalFiles,
  onClear,
}) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ConversionResult | null>(
    null,
  );
  const [originalImageUrls, setOriginalImageUrls] = useState<
    Record<string, string>
  >({});
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 元画像のURL生成
  useEffect(() => {
    const urls: Record<string, string> = {};

    console.log("Original files for URLs:", originalFiles);
    console.log("Results for comparison:", results);

    for (const file of originalFiles) {
      if (file.type.startsWith("image/")) {
        urls[file.name] = URL.createObjectURL(file);
        console.log("Created URL for:", file.name, "->", urls[file.name]);
      }
    }

    setOriginalImageUrls(urls);
    console.log("Original image URLs:", urls);

    // 結果ファイルと元ファイルの名前の対応を確認
    if (results.length > 0) {
      console.log("Checking file name mapping:");
      for (const result of results) {
        const hasDirectMatch = urls[result.filename];
        console.log(
          `Result "${result.filename}" -> Direct match: ${hasDirectMatch ? "YES" : "NO"}`,
        );

        if (!hasDirectMatch) {
          const nameWithoutExt = result.filename.replace(/\.[^/.]+$/, "");
          console.log(`  Trying without extension: "${nameWithoutExt}"`);

          for (const fileName of Object.keys(urls)) {
            const originalNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
            if (originalNameWithoutExt === nameWithoutExt) {
              console.log(`  Found potential match: "${fileName}"`);
            }
          }
        }
      }
    }

    // クリーンアップ
    return () => {
      for (const url of Object.values(urls)) {
        URL.revokeObjectURL(url);
      }
    };
  }, [originalFiles, results]);

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

  const handleImageClick = useCallback(
    (result: ConversionResult) => {
      console.log("Image clicked:", result.filename);
      console.log("Original files:", originalFiles);
      console.log("Original image URLs:", originalImageUrls);

      // ファイル名のマッチングを試行
      let originalUrl = originalImageUrls[result.filename];

      // 直接マッチしない場合、拡張子を除いた名前で検索
      if (!originalUrl) {
        const nameWithoutExt = result.filename.replace(/\.[^/.]+$/, "");
        console.log("Trying to match without extension:", nameWithoutExt);

        for (const [fileName, url] of Object.entries(originalImageUrls)) {
          const originalNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
          if (originalNameWithoutExt === nameWithoutExt) {
            originalUrl = url;
            console.log("Found match:", fileName);
            break;
          }
        }
      }

      if (!originalUrl) {
        console.warn("Original image URL not found for:", result.filename);
        alert("元の画像が見つかりません。変換前の画像を比較できません。");
        return;
      }

      setSelectedResult(result);
      setIsModalOpen(true);
    },
    [originalFiles, originalImageUrls],
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedResult(null);
  }, []);

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
                  <button
                    type="button"
                    className={styles.previewImage}
                    onClick={() => handleImageClick(result)}
                    style={{ cursor: "pointer" }}
                    aria-label={`${result.filename}の変換前後比較を表示`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* 画像比較モーダル */}
      {selectedResult && isModalOpen && (
        <ImageComparisonModal
          result={selectedResult}
          originalImageUrl={(() => {
            // ファイル名の直接マッチを試行
            let originalUrl = originalImageUrls[selectedResult.filename];

            // 直接マッチしない場合、拡張子を除いた名前で検索
            if (!originalUrl) {
              const nameWithoutExt = selectedResult.filename.replace(
                /\.[^/.]+$/,
                "",
              );

              for (const [fileName, url] of Object.entries(originalImageUrls)) {
                const originalNameWithoutExt = fileName.replace(
                  /\.[^/.]+$/,
                  "",
                );
                if (originalNameWithoutExt === nameWithoutExt) {
                  originalUrl = url;
                  break;
                }
              }
            }

            return originalUrl || "";
          })()}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
