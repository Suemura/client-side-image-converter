import type React from "react";
import { useRef, useState } from "react";

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  acceptedTypes?: string[];
  currentFiles?: File[];
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  onFilesSelected,
  acceptedTypes = ["image/jpeg", "image/png", "image/bmp", "image/tiff"],
  currentFiles = [],
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((file) =>
      acceptedTypes.includes(file.type),
    );

    // 重複ファイルを除外（ファイル名とサイズで判定）
    const newFiles = validFiles.filter(
      (newFile) =>
        !currentFiles.some(
          (existingFile) =>
            existingFile.name === newFile.name &&
            existingFile.size === newFile.size,
        ),
    );

    if (newFiles.length > 0) {
      onFilesSelected([...currentFiles, ...newFiles]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) =>
      acceptedTypes.includes(file.type),
    );

    // 重複ファイルを除外（ファイル名とサイズで判定）
    const newFiles = validFiles.filter(
      (newFile) =>
        !currentFiles.some(
          (existingFile) =>
            existingFile.name === newFile.name &&
            existingFile.size === newFile.size,
        ),
    );

    if (newFiles.length > 0) {
      onFilesSelected([...currentFiles, ...newFiles]);
    }

    // ファイル入力をクリア（同じファイルを再選択できるように）
    e.target.value = "";
  };

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
            {currentFiles.length === 0
              ? "Drop files here"
              : "Drop more files to add"}
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
          {currentFiles.length > 0 && (
            <p
              className="text-sm font-normal text-center"
              style={{
                color: "var(--muted-foreground)",
                maxWidth: "480px",
              }}
            >
              {currentFiles.length} files selected
            </p>
          )}
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
};
