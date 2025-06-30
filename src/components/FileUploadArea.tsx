import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { FileDetailModal } from "./FileDetailModal";

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
              // 画像を正方形にクロップして描画
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
    const dropZoneStyles = {
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      gap: "1.5rem",
      borderRadius: "0.75rem",
      border: "2px dashed var(--border-dashed)",
      padding: "3.5rem 1.5rem",
      cursor: "pointer",
      backgroundColor: isDragOver ? "#f0f9ff" : "transparent",
      borderColor: isDragOver ? "var(--primary)" : "var(--border-dashed)",
      transition: "all 0.2s ease",
    };

    return (
      <div className="flex flex-col p-4">
        <button
          type="button"
          style={dropZoneStyles}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label="ファイルをドラッグ&ドロップまたはクリックして選択"
        >
          <div
            className="flex flex-col items-center gap-2"
            style={{ maxWidth: "480px" }}
          >
            <p
              className="text-lg font-bold text-center"
              style={{
                color: "var(--foreground)",
                letterSpacing: "-0.015em",
                maxWidth: "480px",
              }}
            >
              Drop files here
            </p>
            <p
              className="text-sm font-normal text-center"
              style={{
                color: "var(--foreground)",
                maxWidth: "480px",
              }}
            >
              Or click to select files
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes.join(",")}
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </button>
      </div>
    );
  }

  // ファイルが1個以上の場合：ファイルリストを表示（ドラッグ&ドロップ機能付き）
  return (
    <div
      className="p-4"
      style={{
        borderTop: "1px solid var(--border-dashed)",
        position: "relative",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between pb-3">
        <h4 className="font-medium" style={{ color: "var(--foreground)" }}>
          {t("fileUpload.selectedFiles")} ({files.length}
          {t("common.files")})
        </h4>
        <div style={{ display: "flex", gap: "8px" }}>
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
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            border: "2px dashed var(--primary)",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "var(--primary)",
            }}
          >
            {t("fileUpload.dropFilesHere")}
          </p>
        </div>
      )}

      <div
        className="flex flex-col gap-2"
        style={{
          maxHeight: "200px",
          overflow: "auto",
        }}
      >
        {thumbnails.map((thumbnail, index) => (
          <button
            type="button"
            key={`${thumbnail.file.name}-${thumbnail.file.size}-${index}`}
            className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors w-full text-left"
            style={{
              backgroundColor: "#f9fafb",
              border: "1px solid var(--border-dashed)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#f9fafb";
            }}
            onClick={() => handleFileClick(thumbnail.file)}
            aria-label={`${thumbnail.file.name}の詳細を表示`}
          >
            <div className="flex items-center gap-3 flex-1">
              <div
                className="flex items-center justify-center rounded"
                style={{
                  width: "32px",
                  height: "32px",
                  backgroundColor: thumbnail.thumbnailUrl
                    ? "transparent"
                    : "var(--primary)",
                  color: "var(--foreground)",
                  fontSize: "12px",
                  fontWeight: "500",
                  overflow: "hidden",
                  border: thumbnail.thumbnailUrl
                    ? "1px solid var(--border-dashed)"
                    : "none",
                }}
              >
                {thumbnail.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnail.thumbnailUrl}
                    alt={`${thumbnail.file.name} thumbnail`}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "3px",
                    }}
                  />
                ) : isGeneratingThumbnails &&
                  thumbnail.file.type.startsWith("image/") ? (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#f0f0f0",
                      borderRadius: "3px",
                      fontSize: "10px",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    ...
                  </div>
                ) : (
                  thumbnail.file.type.split("/")[1]?.toUpperCase() || "FILE"
                )}
              </div>
              <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--foreground)" }}
                  title={thumbnail.file.name}
                >
                  {thumbnail.file.name}
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
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
        style={{ display: "none" }}
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
