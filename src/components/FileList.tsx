import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { FileDetailModal } from "./FileDetailModal";

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
    <div
      className="p-4"
      style={{ borderTop: "1px solid var(--border-dashed)" }}
    >
      <div className="flex items-center justify-between pb-3">
        <h4 className="font-medium" style={{ color: "var(--foreground)" }}>
          {t("fileUpload.selectedFiles")} ({files.length}
          {t("common.files")})
        </h4>
        <Button variant="secondary" size="small" onClick={onClearFiles}>
          {t("fileUpload.clearList")}
        </Button>
      </div>

      <div
        className="flex flex-col gap-2"
        style={{ maxHeight: "200px", overflow: "auto" }}
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
            aria-label={`${t("fileUpload.viewDetails")} ${thumbnail.file.name}`}
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
