import { SUPPORTED_IMAGE_FORMATS } from "@utils/constants";
import {
  collectFilesFromEntries,
  getEntriesFromDataTransferItems,
} from "@utils/directoryReader";
import { formatFileSize } from "@utils/fileName";
import {
  addUniqueFiles,
  buildAcceptAttribute,
  filterValidFiles,
  getFileTypeBadgeLabel,
} from "@utils/fileUtils";
import { generateThumbnail } from "@utils/imageUtils";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePasteImages } from "../hooks/usePasteImages";
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

  // ファイル投入の共通処理（ドロップ・ファイル選択・貼り付け・フォルダドロップで共有）
  // MIME フィルタと重複除外を通し、増えた場合のみ通知する
  const addFiles = useCallback(
    (rawFiles: File[]) => {
      const validFiles = filterValidFiles(rawFiles, acceptedTypes);
      // 重複ファイルを除外（ファイル名とサイズで判定）して追加
      const mergedFiles = addUniqueFiles(files, validFiles);
      if (mergedFiles.length > files.length) {
        onFilesSelected(mergedFiles);
      }
    },
    [files, onFilesSelected, acceptedTypes],
  );

  // ページ全体での Ctrl/Cmd+V による画像貼り付けを受け取る
  usePasteImages(addFiles);

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
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      // フォルダドロップ対応: items から webkitGetAsEntry() を「同期で」取得してから
      // 再帰走査する（drop イベント中しか items が有効でないため await 前に取得する）
      const entries = e.dataTransfer.items
        ? getEntriesFromDataTransferItems(Array.from(e.dataTransfer.items))
        : [];

      if (entries.length > 0) {
        const collectedFiles = await collectFilesFromEntries(entries);
        addFiles(collectedFiles);
        return;
      }

      // webkitGetAsEntry 非対応環境は従来どおり dataTransfer.files を使う
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
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
      addFiles(Array.from(e.target.files || []));
      // ファイル入力をクリア（同じファイルを再選択できるように）
      e.target.value = "";
    },
    [addFiles],
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
            <p className={styles.dropZoneHint}>
              {t("fileUpload.pasteAndFolderHint")}
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
                  // MIME タイプが特定できないファイル（HEIC 等）は拡張子でフォールバック表示
                  getFileTypeBadgeLabel(thumbnail.file)
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
