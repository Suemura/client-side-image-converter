import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { FileDetailModal } from "./FileDetailModal";
import styles from "./FileUploadArea.module.css";

interface FileUploadAreaProps {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onClearFiles: () => void;
  acceptedTypes?: string[];
}

interface FileThumbnail {
  file: File;
  thumbnailUrl: string | null;
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  files,
  onFilesSelected,
  onClearFiles,
  acceptedTypes = ["image/jpeg", "image/png", "image/bmp", "image/tiff"],
}) => {
  const { t } = useTranslation();
  const [thumbnails, setThumbnails] = useState<FileThumbnail[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

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

  // ドラッグ&ドロップハンドラー
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter((file) =>
        acceptedTypes.includes(file.type),
      );

      // 重複ファイルを除外（ファイル名とサイズで判定）
      const newFiles = validFiles.filter(
        (newFile) =>
          !files.some(
            (existingFile) =>
              existingFile.name === newFile.name &&
              existingFile.size === newFile.size,
          ),
      );

      if (newFiles.length > 0) {
        onFilesSelected([...files, ...newFiles]);
      }
    },
    [files, onFilesSelected, acceptedTypes],
  );

  // ファイル選択ハンドラー
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      const validFiles = selectedFiles.filter((file) =>
        acceptedTypes.includes(file.type),
      );

      // 重複ファイルを除外（ファイル名とサイズで判定）
      const newFiles = validFiles.filter(
        (newFile) =>
          !files.some(
            (existingFile) =>
              existingFile.name === newFile.name &&
              existingFile.size === newFile.size,
          ),
      );

      if (newFiles.length > 0) {
        onFilesSelected([...files, ...newFiles]);
      }

      // ファイル入力をクリア（同じファイルを再選択できるように）
      e.target.value = "";
    },
    [files, onFilesSelected, acceptedTypes],
  );

  // サムネイル生成
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

  // ファイル詳細モーダルハンドラー
  const handleFileClick = useCallback((file: File) => {
    setSelectedFile(file);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedFile(null);
  }, []);

  // ファイルが0個の場合：ドロップゾーンを表示
  if (files.length === 0) {
    return (
      <div className={styles.container}>
        <button
          type="button"
          className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label="ファイルをドラッグ&ドロップまたはクリックして選択"
        >
          <div className={styles.dropZoneContent}>
            <p className={styles.dropZoneTitle}>{t("fileUpload.dropFiles")}</p>
            <p className={styles.dropZoneSubtitle}>
              {t("fileUpload.clickToSelect")}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes.join(",")}
            onChange={handleFileInput}
            className={styles.hiddenInput}
          />
        </button>
      </div>
    );
  }

  // ファイルが1個以上の場合：ファイルリストを表示（ドラッグ&ドロップ機能付き）
  return (
    <div
      className={styles.fileListContainer}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.fileListHeader}>
        <h4 className={styles.fileListTitle}>
          {t("fileUpload.selectedFiles")} ({files.length}
          {t("common.files")})
        </h4>
        <div className={styles.buttonGroup}>
          <Button variant="secondary" size="small" onClick={handleClick}>
            {t("fileUpload.add")}
          </Button>
          <Button variant="secondary" size="small" onClick={onClearFiles}>
            {t("fileUpload.clearList")}
          </Button>
        </div>
      </div>

      {/* ドラッグオーバー時のオーバーレイ */}
      {isDragOver && (
        <div className={styles.dragOverlay}>
          <p className={styles.dragOverlayText}>
            {t("fileUpload.dropFilesHere")}
          </p>
        </div>
      )}

      <div className={styles.fileList}>
        {thumbnails.map((thumbnail, index) => (
          <button
            type="button"
            key={`${thumbnail.file.name}-${thumbnail.file.size}-${index}`}
            className={styles.fileItem}
            onClick={() => handleFileClick(thumbnail.file)}
            aria-label={`${thumbnail.file.name}の詳細を表示`}
          >
            <div className={styles.fileItemContent}>
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
                  {thumbnail.file.name}
                </p>
                <p className={styles.fileSize}>
                  {formatFileSize(thumbnail.file.size)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(",")}
        onChange={handleFileInput}
        className={styles.hiddenInput}
      />

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
