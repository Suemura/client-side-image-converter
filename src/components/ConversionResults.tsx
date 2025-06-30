// ファイルパス: /Users/suemura/Documents/GitHub/web-image-converter/src/components/ConversionResults.tsx
import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConversionResult } from "../utils/imageConverter";
import { ImageConverter } from "../utils/imageConverter";
import { Button } from "./Button";
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
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "16px",
        border: "1px solid var(--border-dashed)",
        padding: "24px",
        marginTop: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "var(--foreground)",
          }}
        >
          {t("results.title")} ({results.length}
          {t("results.files")})
        </h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
          padding: "16px",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted-foreground)",
              marginBottom: "4px",
            }}
          >
            {t("results.originalSize")}
          </p>
          <p
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "var(--foreground)",
            }}
          >
            {ImageConverter.formatFileSize(totalOriginalSize)}
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted-foreground)",
              marginBottom: "4px",
            }}
          >
            {t("results.convertedSize")}
          </p>
          <p
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "var(--foreground)",
            }}
          >
            {ImageConverter.formatFileSize(totalConvertedSize)}
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: "12px",
              color: "var(--muted-foreground)",
              marginBottom: "4px",
            }}
          >
            {t("results.compressionRatio")}
          </p>
          <p
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: overallCompressionRatio > 0 ? "#059669" : "#dc2626",
            }}
          >
            {overallCompressionRatio > 0 ? "-" : "+"}
            {Math.abs(overallCompressionRatio)}%
          </p>
        </div>
      </div>

      {/* ファイルリスト */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {results.map((result, index) => {
          const compressionRatio = ImageConverter.calculateCompressionRatio(
            result.originalSize,
            result.convertedSize,
          );

          return (
            <div
              key={`${result.filename}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                backgroundColor: "#f9fafb",
                borderRadius: "8px",
                border: "1px solid var(--border-dashed)",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  {/* プレビュー画像 */}
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "6px",
                      overflow: "hidden",
                      border: "1px solid var(--border-dashed)",
                      backgroundColor: "white",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.url}
                      alt={result.filename}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>

                  {/* ファイル情報 */}
                  <div>
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "var(--foreground)",
                        marginBottom: "2px",
                      }}
                    >
                      {result.filename}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        {ImageConverter.formatFileSize(result.originalSize)} →{" "}
                        {ImageConverter.formatFileSize(result.convertedSize)}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "500",
                          color: compressionRatio > 0 ? "#059669" : "#dc2626",
                        }}
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
