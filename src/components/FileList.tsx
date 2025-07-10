import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFileSize, truncateFileName } from "../utils/fileName";
import { Button } from "./Button";
import { FileDetailModal } from "./FileDetailModal";
import styles from "./FileList.module.css";

interface FileListProps {
  files: File[];
  onClearFiles: () => void;
}

interface FileThumbnail {
  file: File;
  thumbnailUrl: string | null;
}

export const FileList: React.FC<FileListProps> = ({ files, onClearFiles }) => {
  const { t } = useTranslation();
  const [thumbnails, setThumbnails] = useState<FileThumbnail[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const generateThumbnail = useCallback(
    (file: File): Promise<string | null> => {
      return new Promise((resolve) => {
        if (!file.type.startsWith("image/")) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            // サムネイルのサイズを設定（32x32）
            const size = 32;
            canvas.width = size;
            canvas.height = size;

            if (ctx) {
              // 画像を正方形にトリミングして描画
              const minDimension = Math.min(img.width, img.height);
              const sx = (img.width - minDimension) / 2;
              const sy = (img.height - minDimension) / 2;

              ctx.drawImage(
                img,
                sx,
                sy,
                minDimension,
                minDimension,
                0,
                0,
                size,
                size,
              );
              resolve(canvas.toDataURL("image/jpeg", 0.8));
            } else {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = e.target?.result as string;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    },
    [],
  );

  useEffect(() => {
    const generateThumbnails = async () => {
      setIsGeneratingThumbnails(true);
      const newThumbnails: FileThumbnail[] = [];

      for (const file of files) {
        const thumbnailUrl = await generateThumbnail(file);
        newThumbnails.push({ file, thumbnailUrl });
      }

      setThumbnails(newThumbnails);
      setIsGeneratingThumbnails(false);
    };

    generateThumbnails();
  }, [files, generateThumbnail]);

  const handleFileClick = useCallback((file: File) => {
    setSelectedFile(file);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedFile(null);
  }, []);

  if (files.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.title}>
          {t("fileUpload.selectedFiles")} ({files.length}
          {t("common.files")})
        </h4>
        <Button variant="secondary" size="small" onClick={onClearFiles}>
          {t("fileUpload.clearList")}
        </Button>
      </div>

      <div className={styles.fileList}>
        {thumbnails.map((thumbnail, index) => (
          <button
            type="button"
            key={`${thumbnail.file.name}-${thumbnail.file.size}-${index}`}
            className={styles.fileItem}
            onClick={() => handleFileClick(thumbnail.file)}
            aria-label={`${t("fileUpload.viewDetails")} ${thumbnail.file.name}`}
          >
            <div className={styles.fileContent}>
              <div
                className={`${styles.thumbnail} ${
                  thumbnail.thumbnailUrl
                    ? styles.thumbnailWithImage
                    : styles.thumbnailWithoutImage
                }`}
              >
                {thumbnail.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnail.thumbnailUrl}
                    alt={`${thumbnail.file.name} thumbnail`}
                    className={styles.thumbnailImage}
                  />
                ) : isGeneratingThumbnails &&
                  thumbnail.file.type.startsWith("image/") ? (
                  <div className={styles.thumbnailLoading}>...</div>
                ) : (
                  thumbnail.file.type.split("/")[1]?.toUpperCase() || "FILE"
                )}
              </div>
              <div className={styles.fileInfo}>
                <p className={styles.fileName} title={thumbnail.file.name}>
                  {truncateFileName(thumbnail.file.name, 20)}
                </p>
                <p className={styles.fileSize}>
                  {formatFileSize(thumbnail.file.size)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ファイル詳細モーダル */}
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
