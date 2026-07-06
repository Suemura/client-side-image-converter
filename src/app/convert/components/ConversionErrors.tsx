import type React from "react";
import { useTranslation } from "react-i18next";
import type { ConversionFailure } from "../../../utils/imageConverter";
import styles from "./ConversionErrors.module.css";

interface ConversionErrorsProps {
  failures: ConversionFailure[];
}

/** 変換に失敗したファイルの一覧をユーザーに通知するコンポーネント */
export const ConversionErrors: React.FC<ConversionErrorsProps> = ({
  failures,
}) => {
  const { t } = useTranslation();

  if (failures.length === 0) {
    return null;
  }

  return (
    <div className={styles.container} role="alert">
      <h4 className={styles.title}>{t("convert.conversionFailures")}</h4>
      <ul className={styles.fileList}>
        {failures.map((failure, index) => (
          // 同名ファイルが混在し得るため index を併記して key の重複を防ぐ
          <li key={`${failure.fileName}-${index}`} className={styles.fileItem}>
            {failure.fileName}
          </li>
        ))}
      </ul>
    </div>
  );
};
