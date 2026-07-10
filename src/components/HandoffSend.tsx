import { useRouter } from "next/navigation";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useHandoff } from "../contexts/HandoffContext";
import {
  type HandoffTool,
  resolveHandoffTargets,
  type ToolId,
} from "../utils/handoff";
import { Button } from "./Button";
import styles from "./HandoffSend.module.css";

interface HandoffSendProps {
  /** 送り元ツール（自身は送り先候補から除外される） */
  origin: ToolId;
  /** 結果ファイルの MIME タイプ一覧（送り先候補の絞り込みに使う） */
  mimeTypes: readonly string[];
  /** 送出する File[] を生成する（クリック時にのみ呼ばれる） */
  getFiles: () => File[];
  /** 送出直後（遷移前）に呼ばれる。結果クリア（ObjectURL の revoke）に使う */
  onSent?: () => void;
}

/**
 * 処理結果をダウンロードせずに次のツールへ引き継ぐ送出コントロール。
 * 送り先候補（受理形式が合うツール）が無い場合は何も描画しない。
 */
export const HandoffSend: React.FC<HandoffSendProps> = ({
  origin,
  mimeTypes,
  getFiles,
  onSent,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { send } = useHandoff();

  const targets = useMemo(
    () => resolveHandoffTargets(origin, mimeTypes),
    [origin, mimeTypes],
  );

  if (targets.length === 0) {
    return null;
  }

  const handleSend = (target: HandoffTool): void => {
    // File 実体をストアへ置いてから結果をクリアし（ObjectURL の revoke）、
    // 送り先ページへクライアントサイド遷移する（mount 時に consume される）
    send({ files: getFiles(), origin, sentAt: Date.now() });
    onSent?.();
    router.push(target.path);
  };

  return (
    <div className={styles.container}>
      <p className={styles.label}>{t("handoff.sendTo")}</p>
      <div className={styles.buttonGroup}>
        {targets.map((target) => (
          <Button
            key={target.id}
            variant="secondary"
            size="small"
            onClick={() => handleSend(target)}
          >
            {t("handoff.sendToTool", { tool: t(target.labelKey) })}
          </Button>
        ))}
      </div>
    </div>
  );
};
