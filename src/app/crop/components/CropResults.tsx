import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import type { CropResult } from "../../../utils/imageCropper";
import styles from "./CropResults.module.css";

interface CropResultsProps {
  results: CropResult[];
  onClear: () => void;
}

export const CropResults: React.FC<CropResultsProps> = ({
  results,
  onClear,
}) => {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});

  // プレビュー用のURLを生成
  useEffect(() => {
    const urls: Record<number, string> = {};
    const successResults = results.filter(r => r.success);
    
    for (let i = 0; i < successResults.length; i++) {
      urls[i] = URL.createObjectURL(successResults[i].croppedBlob);
    }
    
    setPreviewUrls(urls);
    
    // クリーンアップ
    return () => {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [results]);

  const downloadSingle = useCallback((result: CropResult) => {
    if (!result.success) return;

    const url = URL.createObjectURL(result.croppedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const downloadAll = useCallback(async () => {
    if (results.length === 0) return;

    setIsDownloading(true);
    try {
      // JSZipを使ってZIPファイルを作成（実装を簡略化）
      // 現在は個別ダウンロードのみ実装
      for (const result of results) {
        if (result.success) {
          downloadSingle(result);
          // 少し間隔を空けて連続ダウンロード
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      setIsDownloading(false);
    }
  }, [results, downloadSingle]);

  const successResults = results.filter(r => r.success);
  const errorResults = results.filter(r => !r.success);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t("results.title")}</h3>
        <p className={styles.summary}>
          {t("results.files")}: {successResults.length} / {results.length}
        </p>
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={downloadAll}
          disabled={isDownloading || successResults.length === 0}
        >
          {isDownloading ? t("results.creating") : "すべてダウンロード"}
        </Button>
        <Button variant="secondary" onClick={onClear}>
          {t("results.clear")}
        </Button>
      </div>

      <div className={styles.results}>
        {successResults.map((result, index) => (
          <div key={index} className={styles.resultItem}>
            <div className={styles.imagePreview}>
              <img
                src={previewUrls[index]}
                alt={result.fileName}
                className={styles.thumbnail}
              />
            </div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName}>{result.fileName}</div>
              <div className={styles.fileSize}>
                {(result.croppedBlob.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => downloadSingle(result)}
            >
              ダウンロード
            </Button>
          </div>
        ))}

        {errorResults.map((result, index) => (
          <div key={`error-${index}`} className={styles.errorItem}>
            <div className={styles.errorIcon}>⚠️</div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName}>{result.originalFile.name}</div>
              <div className={styles.errorMessage}>
                {result.error || "処理に失敗しました"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
