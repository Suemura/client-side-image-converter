import type React from "react";
import { useEffect, useState } from "react";
import styles from "./FileListWithThumbnails.module.css";

interface FileListWithThumbnailsProps {
  files: File[];
  title: string;
  currentFile?: File;
}

interface FileWithThumbnail {
  file: File;
  thumbnail: string;
}

export const FileListWithThumbnails: React.FC<FileListWithThumbnailsProps> = ({
  files,
  title,
  currentFile,
}) => {
  const [filesWithThumbnails, setFilesWithThumbnails] = useState<
    FileWithThumbnail[]
  >([]);

  useEffect(() => {
    // サムネイル生成処理
    const generateThumbnails = async () => {
      const thumbnailPromises = files.map(async (file) => {
        if (file.type.startsWith("image/")) {
          const url = URL.createObjectURL(file);
          return { file, thumbnail: url };
        }
        return { file, thumbnail: "" };
      });

      const results = await Promise.all(thumbnailPromises);
      setFilesWithThumbnails(results);
      return results;
    };

    const thumbnailsPromise = generateThumbnails();

    // クリーンアップ関数
    return () => {
      thumbnailsPromise.then((results) => {
        for (const { thumbnail } of results) {
          if (thumbnail) {
            URL.revokeObjectURL(thumbnail);
          }
        }
      });
    };
  }, [files]);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      for (const { thumbnail } of filesWithThumbnails) {
        if (thumbnail) {
          URL.revokeObjectURL(thumbnail);
        }
      }
    };
  }, [filesWithThumbnails]);

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>{title}</h4>
      <div className={styles.fileCount}>{files.length}個のファイル選択済み</div>
      <div className={styles.fileList}>
        {filesWithThumbnails.map(({ file, thumbnail }) => (
          <div
            key={file.name}
            className={`${styles.fileItem} ${
              currentFile && file === currentFile ? styles.fileItemActive : ""
            }`}
          >
            {thumbnail && (
              <div className={styles.thumbnailContainer}>
                <img
                  src={thumbnail}
                  alt={file.name}
                  className={styles.thumbnail}
                />
              </div>
            )}
            <div className={styles.fileInfo}>
              <div className={styles.fileName}>{file.name}</div>
              <div className={styles.fileSize}>
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </div>
              <div className={styles.fileType}>
                {file.type.split("/")[1]?.toUpperCase() || "画像"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
