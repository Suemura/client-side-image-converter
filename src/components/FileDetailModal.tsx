import EXIF from "exif-js";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface FileDetailModalProps {
  file: File;
  isOpen: boolean;
  onClose: () => void;
}

interface ExifData {
  [key: string]: string | number | undefined;
}

export const FileDetailModal: React.FC<FileDetailModalProps> = ({
  file,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string>("");
  const [exifData, setExifData] = useState<ExifData>({});
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }, []);

  const formatDateTime = useCallback((dateString?: string | number): string => {
    if (!dateString) return "不明";
    try {
      const date = new Date(dateString.toString());
      if (Number.isNaN(date.getTime())) return "不明";
      return date.toLocaleString("ja-JP");
    } catch {
      return "不明";
    }
  }, []);

  const extractExifData = useCallback((file: File): Promise<ExifData> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve({});
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (EXIF as any).getData(file, function (this: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allMetaData = (EXIF as any).getAllTags(this);
        const relevantData: ExifData = {};

        // 主要なEXIF情報を抽出
        const tagMapping = {
          Make: "カメラメーカー",
          Model: "カメラモデル",
          DateTime: "撮影日時",
          DateTimeOriginal: "元撮影日時",
          ExposureTime: "シャッター速度",
          FNumber: "F値",
          ISO: "ISO感度",
          ISOSpeedRatings: "ISO感度",
          FocalLength: "焦点距離",
          Flash: "フラッシュ",
          WhiteBalance: "ホワイトバランス",
          ExposureMode: "露出モード",
          Orientation: "向き",
          XResolution: "水平解像度",
          YResolution: "垂直解像度",
          Software: "ソフトウェア",
          Artist: "作成者",
          Copyright: "著作権",
        };

        for (const [exifKey, displayName] of Object.entries(tagMapping)) {
          if (
            allMetaData[exifKey] !== undefined &&
            allMetaData[exifKey] !== null
          ) {
            relevantData[displayName] = allMetaData[exifKey];
          }
        }

        resolve(relevantData);
      });
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !file) return;

    // 画像URLを作成
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    // 画像のサイズを取得
    if (file.type.startsWith("image/")) {
      const img = new window.Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
      };
      img.src = url;
    }

    // EXIF情報を取得
    extractExifData(file).then(setExifData);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, isOpen, extractExifData]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          width: "100%",
          display: "flex",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* 画像表示エリア */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f9fafb",
            position: "relative",
          }}
        >
          {file.type.startsWith("image/") && imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={file.name}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          ) : file.type.startsWith("image/") ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                color: "var(--muted-foreground)",
              }}
            >
              {t("fileDetails.loading")}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "16px",
                color: "var(--muted-foreground)",
              }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  backgroundColor: "var(--primary)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: "var(--foreground)",
                }}
              >
                {file.type.split("/")[1]?.toUpperCase() || "FILE"}
              </div>
              <p style={{ fontSize: "18px", fontWeight: "500" }}>
                {t("fileDetails.cannotPreview")}
              </p>
            </div>
          )}

          {/* 閉じるボタン */}
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "18px",
            }}
            aria-label={t("fileDetails.close")}
          >
            ×
          </button>
        </div>

        {/* ファイル情報エリア */}
        <div
          style={{
            width: "400px",
            padding: "24px",
            backgroundColor: "white",
            borderLeft: "1px solid var(--border-dashed)",
            overflow: "auto",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "bold",
              marginBottom: "16px",
              color: "var(--foreground)",
            }}
          >
            {t("fileDetails.title")}
          </h3>

          {/* 基本情報 */}
          <div style={{ marginBottom: "24px" }}>
            <h4
              style={{
                fontSize: "14px",
                fontWeight: "600",
                marginBottom: "8px",
                color: "var(--foreground)",
              }}
            >
              {t("fileDetails.basicInfo")}
            </h4>
            <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
              <div style={{ marginBottom: "4px" }}>
                <strong>{t("fileDetails.fileName")}:</strong>
                <br />
                <span
                  style={{
                    color: "var(--muted-foreground)",
                    wordBreak: "break-all",
                  }}
                >
                  {file.name}
                </span>
              </div>
              <div style={{ marginBottom: "4px" }}>
                <strong>{t("fileDetails.fileSize")}:</strong>{" "}
                <span style={{ color: "var(--muted-foreground)" }}>
                  {formatFileSize(file.size)}
                </span>
              </div>
              <div style={{ marginBottom: "4px" }}>
                <strong>{t("fileDetails.fileFormat")}:</strong>{" "}
                <span style={{ color: "var(--muted-foreground)" }}>
                  {file.type || t("fileDetails.unknown")}
                </span>
              </div>
              <div style={{ marginBottom: "4px" }}>
                <strong>{t("fileDetails.lastModified")}:</strong>{" "}
                <span style={{ color: "var(--muted-foreground)" }}>
                  {formatDateTime(file.lastModified)}
                </span>
              </div>
              {imageSize && (
                <div style={{ marginBottom: "4px" }}>
                  <strong>{t("fileDetails.imageSize")}:</strong>{" "}
                  <span style={{ color: "var(--muted-foreground)" }}>
                    {imageSize.width} × {imageSize.height} {t("common.px")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* EXIF情報 */}
          {Object.keys(exifData).length > 0 && (
            <div>
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  marginBottom: "8px",
                  color: "var(--foreground)",
                }}
              >
                {t("fileDetails.exifInfo")}
              </h4>
              <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
                {Object.entries(exifData).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: "4px" }}>
                    <strong>{key}:</strong>{" "}
                    <span style={{ color: "var(--muted-foreground)" }}>
                      {value?.toString() || t("fileDetails.unknown")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(exifData).length === 0 &&
            file.type.startsWith("image/") && (
              <div>
                <h4
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "var(--foreground)",
                  }}
                >
                  {t("fileDetails.exifInfo")}
                </h4>
                <p
                  style={{
                    fontSize: "14px",
                    color: "var(--muted-foreground)",
                    fontStyle: "italic",
                  }}
                >
                  {t("fileDetails.exifInfoNotFound")}
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
