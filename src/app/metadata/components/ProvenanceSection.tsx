import type React from "react";
import { useTranslation } from "react-i18next";
import type { C2paReadResult } from "../../../utils/c2paManager";
import type { C2paSignatureState } from "../../../utils/c2paSummary";
import styles from "./ProvenanceSection.module.css";

interface ProvenanceSectionProps {
  /** C2PA 検出ファイルの読み取り結果（表示順はファイル名順） */
  entries: [string, C2paReadResult][];
  /** C2PA を除去対象にするか */
  removeC2pa: boolean;
  onToggleRemoveC2pa: (remove: boolean) => void;
  /** 処理中はチェックボックスを無効化する */
  disabled?: boolean;
}

/** 署名状態バッジのスタイルクラスを引く */
const signatureClass = (state: C2paSignatureState): string => {
  switch (state) {
    case "valid":
      return styles.signatureValid;
    case "invalid":
      return styles.signatureInvalid;
    default:
      return styles.signatureUnknown;
  }
};

/**
 * コンテンツ来歴（C2PA / Content Credentials）セクション。
 * 検出されたファイルごとに発行者・生成ツール・AI 生成フラグ・編集履歴・
 * 署名の検証結果を表示し、除去のオプトインチェックボックスを提供する。
 */
export const ProvenanceSection: React.FC<ProvenanceSectionProps> = ({
  entries,
  removeC2pa,
  onToggleRemoveC2pa,
  disabled = false,
}) => {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>{t("metadata.c2pa.title")}</h3>
      <p className={styles.description}>{t("metadata.c2pa.description")}</p>

      <div className={styles.fileList}>
        {entries.map(([fileName, result]) => (
          <div key={fileName} className={styles.fileCard}>
            <p className={styles.fileName}>{fileName}</p>
            {result.status === "unreadable" ? (
              <p className={styles.unreadable}>
                {t("metadata.c2pa.unreadable")}
              </p>
            ) : (
              <>
                <div className={styles.badges}>
                  <span
                    className={`${styles.signatureBadge} ${signatureClass(
                      result.summary.signature,
                    )}`}
                  >
                    {t(`metadata.c2pa.signature.${result.summary.signature}`)}
                  </span>
                  {result.summary.isAiGenerated && (
                    <span className={styles.aiBadge}>
                      {t("metadata.c2pa.aiGenerated")}
                    </span>
                  )}
                </div>
                <dl className={styles.details}>
                  {result.summary.issuer && (
                    <div className={styles.detailRow}>
                      <dt>{t("metadata.c2pa.issuer")}</dt>
                      <dd>{result.summary.issuer}</dd>
                    </div>
                  )}
                  {result.summary.claimGenerator && (
                    <div className={styles.detailRow}>
                      <dt>{t("metadata.c2pa.claimGenerator")}</dt>
                      <dd>{result.summary.claimGenerator}</dd>
                    </div>
                  )}
                  {result.summary.signedAt && (
                    <div className={styles.detailRow}>
                      <dt>{t("metadata.c2pa.signedAt")}</dt>
                      <dd>{result.summary.signedAt}</dd>
                    </div>
                  )}
                </dl>
                {result.summary.actions.length > 0 && (
                  <div className={styles.actions}>
                    <p className={styles.actionsTitle}>
                      {t("metadata.c2pa.actions")}
                    </p>
                    <ul className={styles.actionsList}>
                      {result.summary.actions.map((action, index) => (
                        <li
                          key={`${action.action}-${index}`}
                          className={styles.actionItem}
                        >
                          {action.action}
                          {action.softwareAgent && ` — ${action.softwareAgent}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <label className={styles.removeLabel}>
        <input
          type="checkbox"
          className={styles.removeCheckbox}
          checked={removeC2pa}
          onChange={(e) => onToggleRemoveC2pa(e.target.checked)}
          disabled={disabled}
        />
        {t("metadata.c2pa.removeLabel")}
      </label>
      <p className={styles.removeHelp}>{t("metadata.c2pa.removeHelp")}</p>
    </div>
  );
};
