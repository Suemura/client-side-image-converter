import { SUPPORTED_IMAGE_FORMATS } from "@utils/constants";
import { formatFileSize } from "@utils/fileName";
import {
  addUniqueFiles,
  buildAcceptAttribute,
  filterValidFiles,
  getFileExtension,
} from "@utils/fileUtils";
import { generateThumbnail } from "@utils/imageUtils";
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
  acceptedTypes?: readonly string[];
  showFileList?: boolean;
}

interface FileThumbnail {
  file: File;
  thumbnailUrl: string | null;
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  files,
  onFilesSelected,
  onClearFiles,
  acceptedTypes = SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
  showFileList = true,
}) => {
  const { t } = useTranslation();
  const [thumbnails, setThumbnails] = useState<FileThumbnail[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const validFiles = filterValidFiles(
        Array.from(e.dataTransfer.files),
        acceptedTypes,
      );

      // 重複ファイルを除外（ファイル名とサイズで判定）して追加
      const mergedFiles = addUniqueFiles(files, validFiles);
      if (mergedFiles.length > files.length) {
        onFilesSelected(mergedFiles);
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
      const validFiles = filterValidFiles(
        Array.from(e.target.files || []),
        acceptedTypes,
      );

      // 重複ファイルを除外（ファイル名とサイズで判定）して追加
      const mergedFiles = addUniqueFiles(files, validFiles);
      if (mergedFiles.length > files.length) {
        onFilesSelected(mergedFiles);
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

      // 並列処理でサムネイル生成
      const thumbnailPromises = files.map(async (file) => {
        const thumbnailUrl = await generateThumbnail(file);
        return { file, thumbnailUrl };
      });

      const newThumbnails = await Promise.all(thumbnailPromises);

      setThumbnails(newThumbnails);
      setIsGeneratingThumbnails(false);
    };

    generateThumbnails();
  }, [files]);

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
          aria-label={t("fileUpload.dropAreaLabel")}
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
            accept={buildAcceptAttribute(acceptedTypes)}
            onChange={handleFileInput}
            className={styles.hiddenInput}
          />
        </button>
      </div>
    );
  }

  // showFileListがfalseの場合：ファイルアップロード操作のみ表示
  if (!showFileList) {
    return (
      <div className={styles.container}>
        <div
          className={`${styles.dropZone} ${styles.compactDropZone} ${isDragOver ? styles.dropZoneActive : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={styles.compactHeader}>
            <h4 className={styles.compactTitle}>
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

          {/* 隠しファイル入力 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={buildAcceptAttribute(acceptedTypes)}
            onChange={handleFileInput}
            className={styles.hiddenInput}
          />
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
            aria-label={t("fileUpload.viewDetails", {
              name: thumbnail.file.name,
            })}
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
                  // MIME タイプが空のファイル（HEIC 等）は拡張子でフォールバック表示
                  thumbnail.file.type.split("/")[1]?.toUpperCase() ||
                  getFileExtension(thumbnail.file.name)
                    .replace(".", "")
                    .toUpperCase() ||
                  "FILE"
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
        accept={buildAcceptAttribute(acceptedTypes)}
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
