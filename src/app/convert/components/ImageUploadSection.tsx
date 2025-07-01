import type React from "react";
import { useTranslation } from "react-i18next";
import { FileUploadArea } from "../../../components/FileUploadArea";

interface ImageUploadSectionProps {
  files: File[];
  onFilesSelected: (files: File[]) => void;
  onClearFiles: () => void;
}

export const ImageUploadSection: React.FC<ImageUploadSectionProps> = ({
  files,
  onFilesSelected,
  onClearFiles,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col w-80">
      <h2
        className="text-28 font-bold px-4 text-left pb-3 pt-5"
        style={{
          color: "var(--foreground)",
          letterSpacing: "-0.02em",
        }}
      >
        {t("fileUpload.dragDropLabel")}
      </h2>

      <FileUploadArea
        files={files}
        onFilesSelected={onFilesSelected}
        onClearFiles={onClearFiles}
      />

      <p
        className="text-sm font-normal pb-3 pt-1 px-4"
        style={{
          color: "var(--muted-foreground)",
        }}
      >
        Supported formats: JPG, PNG, BMP, TIFF
      </p>
    </div>
  );
};
