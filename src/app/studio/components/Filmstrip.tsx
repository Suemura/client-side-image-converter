import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_IMAGE_FORMATS } from "../../../utils/constants";
import { buildAcceptAttribute } from "../../../utils/fileUtils";
import type { StudioDocument } from "../../../utils/studioCore";
import styles from "./Filmstrip.module.css";

interface FilmstripProps {
  documents: StudioDocument[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAddFiles: (files: File[]) => void;
  /** 「全画像に同じ編集を適用」トグル（PC のみ表示） */
  applyToAll: boolean;
  onApplyToAllChange: (next: boolean) => void;
  isMobile: boolean;
}

/** サムネイル 1 枚。currentFile の object URL を生成し、差し替え時に解放する */
const Thumbnail: React.FC<{
  document: StudioDocument;
  selected: boolean;
  onClick: () => void;
  label: string;
}> = ({ document, selected, onClick, label }) => {
  const file = document.currentFile;
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const previousUrlRef = useRef<string | null>(null);

  // URL の交代・アンマウント時に旧 URL を解放する
  useEffect(() => {
    const previous = previousUrlRef.current;
    if (previous && previous !== url) {
      URL.revokeObjectURL(previous);
    }
    previousUrlRef.current = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <button
      type="button"
      className={`${styles.thumb}${selected ? ` ${styles.thumbSelected}` : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-current={selected}
    >
      {/* サムネイルは装飾目的（ラベルはボタンが持つ） */}
      <img src={url} alt="" className={styles.thumbImage} />
    </button>
  );
};

/** 下部フィルムストリップ（一括処理のサムネイル一覧・追加・適用範囲トグル） */
export const Filmstrip: React.FC<FilmstripProps> = ({
  documents,
  selectedIndex,
  onSelect,
  onAddFiles,
  applyToAll,
  onApplyToAllChange,
  isMobile,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 0) {
      onAddFiles(selected);
    }
    // 同じファイルを続けて選べるよう毎回リセットする
    event.target.value = "";
  };

  return (
    <div className={`${styles.strip}${isMobile ? ` ${styles.mobile}` : ""}`}>
      {!isMobile && (
        <div className={styles.meta}>
          <span className={styles.metaTitle}>
            {t("studio.filmstrip.batch")}
          </span>
          <span className={styles.metaCount}>
            {t("studio.filmstrip.count", { count: documents.length })}
          </span>
        </div>
      )}
      {isMobile && documents.length > 0 && (
        <span className={styles.counter}>
          {selectedIndex + 1} / {documents.length}
        </span>
      )}

      <div className={styles.thumbs}>
        {documents.map((document, index) => (
          <Thumbnail
            key={document.id}
            document={document}
            selected={index === selectedIndex}
            onClick={() => onSelect(index)}
            label={t("studio.filmstrip.thumbnail", {
              name: document.currentFile.name,
            })}
          />
        ))}
        <button
          type="button"
          className={styles.addButton}
          onClick={() => inputRef.current?.click()}
          data-testid="studio-add-files"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span className={styles.addLabel}>{t("studio.filmstrip.add")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={buildAcceptAttribute(SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS)}
          onChange={handleInputChange}
          className={styles.hiddenInput}
          data-testid="studio-file-input"
        />
      </div>

      {!isMobile && documents.length > 1 && (
        <label className={styles.applyToAll}>
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(event) => onApplyToAllChange(event.target.checked)}
            className={styles.checkbox}
          />
          <span>{t("studio.filmstrip.applyToAll")}</span>
        </label>
      )}
    </div>
  );
};
