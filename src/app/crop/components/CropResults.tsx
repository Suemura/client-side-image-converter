import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { FileDetailModal } from "../../../components/FileDetailModal";
import type { CropResult } from "../../../utils/imageCropper";
import { truncateFileName } from "../../../utils/fileName";
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // プレビュー用のURLを生成とクロップ結果をFileオブジェクトに変換
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

  // BlobからFileオブジェクトを作成
  const createFileFromBlob = useCallback((blob: Blob, fileName: string): File => {
    return new File([blob], fileName, { type: blob.type });
  }, []);

  const handleThumbnailClick = useCallback((result: CropResult) => {
    if (!result.success) return;

    // クロップ結果のBlobからFileオブジェクトを作成
    const croppedFile = createFileFromBlob(result.croppedBlob, result.fileName);
    setSelectedFile(croppedFile);
    setIsModalOpen(true);
  }, [createFileFromBlob]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedFile(null);
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
          {isDownloading ? t("results.creating") : t("crop.downloadAll")}
        </Button>
        <Button variant="secondary" onClick={onClear}>
          {t("results.clear")}
        </Button>
      </div>

      <div className={styles.results}>
        {successResults.map((result, index) => (
          <div key={index} className={styles.resultItem}>
            <div
              className={styles.imagePreview}
              onClick={() => handleThumbnailClick(result)}
              style={{
                cursor: "pointer",
                position: "relative"
              }}
              onMouseEnter={(e) => {
                const overlay = e.currentTarget.querySelector('.hover-overlay') as HTMLElement;
                if (overlay) overlay.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                const overlay = e.currentTarget.querySelector('.hover-overlay') as HTMLElement;
                if (overlay) overlay.style.opacity = '0';
              }}
            >
              <img
                src={previewUrls[index]}
                alt={result.fileName}
                className={styles.thumbnail}
              />
              <div
                className="hover-overlay"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "0.75rem",
                  opacity: 0,
                  transition: "opacity 0.2s",
                  borderRadius: "4px",
                  pointerEvents: "none"
                }}
              >
                {t("results.preview")}
              </div>
            </div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName} title={result.fileName}>
                {result.fileName.length > 15 ? truncateFileName(result.fileName, 15) : result.fileName}
              </div>
              <div className={styles.fileSize}>
                {(result.croppedBlob.size / 1024).toFixed(1)} KB
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => downloadSingle(result)}
              aria-label={t("results.download")}
            >
              ↓
            </Button>
          </div>
        ))}

        {errorResults.map((result, index) => (
          <div key={`error-${index}`} className={styles.errorItem}>
            <div className={styles.errorIcon}>⚠️</div>
            <div className={styles.fileInfo}>
              <div className={styles.fileName} title={result.originalFile.name}>
                {truncateFileName(result.originalFile.name, 15)}
              </div>
              <div className={styles.errorMessage}>
                {result.error || "処理に失敗しました"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FileDetailModalを使用したプレビュー */}
      {selectedFile && (
        <FileDetailModal
          file={selectedFile}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};
