import { formatFileSize } from "@utils/fileName";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./FileDetailModal.module.css";

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
  const { t, i18n } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string>("");
  const [exifData, setExifData] = useState<ExifData>({});
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const formatDateTime = useCallback(
    (dateValue?: string | number): string => {
      if (!dateValue) return t("fileDetails.unknown");
      try {
        // 数値の場合はそのまま、文字列の場合はparseIntまたはそのまま使用
        const date =
          typeof dateValue === "number"
            ? new Date(dateValue)
            : new Date(dateValue);
        if (Number.isNaN(date.getTime())) return t("fileDetails.unknown");
        return date.toLocaleString(i18n.language === "ja" ? "ja-JP" : "en-US");
      } catch {
        return t("fileDetails.unknown");
      }
    },
    [t, i18n.language],
  );

  const extractExifData = useCallback(async (file: File): Promise<ExifData> => {
    if (!file.type.startsWith("image/")) {
      return {};
    }

    // exif-js はモーダルで EXIF を表示する時のみロードし、初期バンドルへ影響させない
    const { default: EXIF } = await import("exif-js");

    return new Promise((resolve) => {
      EXIF.getData(file, function (this) {
        const allMetaData = EXIF.getAllTags(this);
        const relevantData: ExifData = {};

        // 主要なEXIF情報を抽出
        const tagKeys = [
          "Make",
          "Model",
          "DateTime",
          "DateTimeOriginal",
          "ExposureTime",
          "FNumber",
          "ISO",
          "ISOSpeedRatings",
          "FocalLength",
          "Flash",
          "WhiteBalance",
          "ExposureMode",
          "Orientation",
          "XResolution",
          "YResolution",
          "Software",
          "Artist",
          "Copyright",
        ];

        for (const exifKey of tagKeys) {
          if (
            allMetaData[exifKey] !== undefined &&
            allMetaData[exifKey] !== null
          ) {
            relevantData[exifKey] = allMetaData[exifKey];
          }
        }

        resolve(relevantData);
      });
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !file) return;

    // ファイル切替時に前のファイルの EXIF が残らないよう先にリセットし、
    // 動的 import 分のレイテンシで解決順が逆転しても古い結果を無視する（stale フラグ）
    let stale = false;
    setExifData({});

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

    // EXIF情報を取得（動的 import の失敗時は EXIF なしとして表示する）
    extractExifData(file)
      .then((data) => {
        if (!stale) setExifData(data);
      })
      .catch(() => {
        if (!stale) setExifData({});
      });

    return () => {
      stale = true;
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
      className={styles.overlay}
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal}>
        {/* 画像表示エリア */}
        <div className={styles.imageArea}>
          {file.type.startsWith("image/") && imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={file.name}
              className={styles.previewImage}
            />
          ) : file.type.startsWith("image/") ? (
            <div className={styles.loading}>{t("fileDetails.loading")}</div>
          ) : (
            <div className={styles.noPreview}>
              <div className={styles.noPreviewIcon}>
                {file.type.split("/")[1]?.toUpperCase() || "FILE"}
              </div>
              <p className={styles.noPreviewText}>
                {t("fileDetails.cannotPreview")}
              </p>
            </div>
          )}

          {/* 閉じるボタン */}
          <button
            type="button"
            onClick={onClose}
            className={styles.closeButton}
            aria-label={t("fileDetails.close")}
          >
            ×
          </button>
        </div>

        {/* ファイル情報エリア */}
        <div className={styles.infoPanel}>
          <h3 className={styles.infoTitle}>{t("fileDetails.title")}</h3>

          {/* 基本情報 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              {t("fileDetails.basicInfo")}
            </h4>
            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <strong>{t("fileDetails.fileName")}:</strong>
                <br />
                <span className={styles.metaValueBreak}>{file.name}</span>
              </div>
              <div className={styles.metaItem}>
                <strong>{t("fileDetails.fileSize")}:</strong>{" "}
                <span className={styles.metaValue}>
                  {formatFileSize(file.size)}
                </span>
              </div>
              <div className={styles.metaItem}>
                <strong>{t("fileDetails.fileFormat")}:</strong>{" "}
                <span className={styles.metaValue}>
                  {file.type || t("fileDetails.unknown")}
                </span>
              </div>
              <div className={styles.metaItem}>
                <strong>{t("fileDetails.lastModified")}:</strong>{" "}
                <span className={styles.metaValue}>
                  {formatDateTime(file.lastModified)}
                </span>
              </div>
              {imageSize && (
                <div className={styles.metaItem}>
                  <strong>{t("fileDetails.imageSize")}:</strong>{" "}
                  <span className={styles.metaValue}>
                    {imageSize.width} × {imageSize.height} {t("common.px")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* EXIF情報 */}
          {Object.keys(exifData).length > 0 && (
            <div>
              <h4 className={styles.sectionTitle}>
                {t("fileDetails.exifInfo")}
              </h4>
              <div className={styles.metaList}>
                {Object.entries(exifData).map(([key, value]) => (
                  <div key={key} className={styles.metaItem}>
                    <strong>{t(`fileDetails.exifTags.${key}`, key)}:</strong>{" "}
                    <span className={styles.metaValue}>
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
                <h4 className={styles.sectionTitle}>
                  {t("fileDetails.exifInfo")}
                </h4>
                <p className={styles.exifEmpty}>
                  {t("fileDetails.exifInfoNotFound")}
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
