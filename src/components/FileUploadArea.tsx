import { MAX_INPUT_FILES, SUPPORTED_IMAGE_FORMATS } from "@utils/constants";
import {
  collectFilesFromEntries,
  getEntriesFromDataTransferItems,
} from "@utils/directoryReader";
import { formatFileSize } from "@utils/fileName";
import {
  addUniqueFilesWithLimit,
  buildAcceptAttribute,
  filterValidFiles,
  getFileTypeBadgeLabel,
  isAcceptedFileType,
  shouldClearLimitWarningOnDecrease,
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
  // 上限超過で一部を取り込めなかったときの警告表示フラグ
  const [limitExceeded, setLimitExceeded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル投入の共通処理（ドロップ・ファイル選択・貼り付け・フォルダドロップで共有）
  // MIME フィルタ → 重複除外 → 上限件数で切り詰め、増えた場合のみ通知する。
  // collectionTruncated はフォルダ走査自体が上限で打ち切られたか（フォルダドロップ経路のみ）。
  const addFiles = useCallback(
    (rawFiles: File[], collectionTruncated = false) => {
      const validFiles = filterValidFiles(rawFiles, acceptedTypes);
      // 重複ファイルを除外（ファイル名とサイズで判定）し、合計を上限件数まで切り詰める
      const { files: mergedFiles, truncated } = addUniqueFilesWithLimit(
        files,
        validFiles,
        MAX_INPUT_FILES,
      );
      const added = mergedFiles.length > files.length;
      if (added) {
        onFilesSelected(mergedFiles);
      }
      // マージ後の切り詰め（truncated）に加え、フォルダ走査自体が上限で打ち切られた
      // （collectionTruncated）場合も取りこぼしとして警告する。後者は「重複が多く最終
      // 件数は上限以下だが、収集は上限で打ち切った」ケースの取りこぼし見逃しを防ぐ。
      // 取り込み件数が増えたか overflow のときだけ警告状態を更新する。
      // 重複のみで件数が変わらない no-op（例: 上限到達中に重複を貼り付け）では、
      // 直前の「上限を超えて取りこぼした」警告を消さず、上限に張り付いた状態を保つ。
      const overflow = truncated || collectionTruncated;
      if (added || overflow) {
        setLimitExceeded(overflow);
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
        // 巨大ツリーの再帰走査で File 参照が無制限に積み上がらないよう収集件数を有界化する。
        // accept で有効画像だけをバジェットに数え（サイドカー等はバジェットを消費しない）、
        // MAX_INPUT_FILES + 1 まで集めることで「ちょうど上限」と「上限超過」を区別できる。
        // reachedLimit（収集自体の打ち切り）は取りこぼし警告に連動させるため addFiles へ渡す。
        const { files: collectedFiles, reachedLimit } =
          await collectFilesFromEntries(entries, {
            maxFiles: MAX_INPUT_FILES + 1,
            accept: (file) => isAcceptedFileType(file, acceptedTypes),
          });
        addFiles(collectedFiles, reachedLimit);
        return;
      }

      // webkitGetAsEntry 非対応環境は従来どおり dataTransfer.files を使う
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles, acceptedTypes],
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

  // 直前のファイル件数。件数の「減少」を検知して stale な警告を消すために保持する。
  const prevFilesLengthRef = useRef(files.length);

  // 件数が減って上限未満になった（クリア・削除）ときだけ stale な上限警告を消す。
  // 「件数 < 上限」だけを条件にすると、フォルダ走査が上限で打ち切られた際に件数が
  // 上限未満でも出す警告（collectionTruncated）を、直後の再描画で消してしまうため、
  // 「件数が減少した」ことを条件にして追加操作では消さないようにする。
  useEffect(() => {
    const prevLength = prevFilesLengthRef.current;
    prevFilesLengthRef.current = files.length;
    if (
      shouldClearLimitWarningOnDecrease(
        prevLength,
        files.length,
        MAX_INPUT_FILES,
      )
    ) {
      setLimitExceeded(false);
    }
  }, [files.length]);

  // 上限超過の警告ボックス（非空 2 分岐で共通利用）
  const limitWarning = limitExceeded ? (
    <div className={styles.limitWarning} role="alert">
      <p className={styles.limitWarningText}>
        {t("fileUpload.limitExceeded", { max: MAX_INPUT_FILES })}
      </p>
    </div>
  ) : null;

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

          {limitWarning}

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

      {limitWarning}

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
