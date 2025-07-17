import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { FileUploadArea } from "../../../components/FileUploadArea";
import styles from "./ImageUploadSection.module.css";

interface ImageUploadSectionProps {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onClearFiles: () => void;
  showFileList?: boolean;
}

export const ImageUploadSection: React.FC<ImageUploadSectionProps> = ({
  files,
  onFilesSelected,
  onClearFiles,
  showFileList = true,
}) => {
  const { t } = useTranslation();
  
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t("fileUpload.dragDropLabel")}</h2>

      {files.length === 0 ? (
        <>
          <FileUploadArea
            files={files}
            onFilesSelected={onFilesSelected}
            onClearFiles={onClearFiles}
            showFileList={showFileList}
          />

          <p className={styles.supportedFormats}>Supported formats: JPG, PNG, WebP, BMP, TIFF</p>
        </>
      ) : (
        <>
          <FileUploadArea
            files={files}
            onFilesSelected={onFilesSelected}
            onClearFiles={onClearFiles}
            showFileList={showFileList}
          />
          {!showFileList && (
            <div className={styles.buttonContainer}>
              <Button variant="secondary" onClick={onClearFiles}>
                {t("crop.selectNewImage")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
