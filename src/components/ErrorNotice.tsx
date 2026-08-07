import type React from "react";
import styles from "./ErrorNotice.module.css";

interface ErrorNoticeProps {
  /** 表示する文言（呼び出し側で t() 済み）。空のときは何も表示しない */
  message?: string | null;
  /** 失敗したファイル名の一覧（任意） */
  fileNames?: string[];
}

/**
 * エラー通知の共通コンポーネント（DESIGN.md「通知ボックス」規定）。
 * バッチ処理の失敗・ダウンロード失敗など、ページを問わずエラーの伝達をここへ寄せる（Issue #118）
 */
export const ErrorNotice: React.FC<ErrorNoticeProps> = ({
  message,
  fileNames,
}) => {
  if (!message) {
    return null;
  }

  return (
    <div className={styles.container} role="alert">
      <h4 className={styles.title}>{message}</h4>
      {fileNames && fileNames.length > 0 && (
        <ul className={styles.fileList}>
          {fileNames.map((fileName, index) => (
            // 同名ファイルが混在し得るため index を併記して key の重複を防ぐ
            <li key={`${fileName}-${index}`} className={styles.fileItem}>
              {fileName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
