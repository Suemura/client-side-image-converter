import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHandoff } from "../contexts/HandoffContext";
import {
  type HandoffOrigin,
  type HandoffTool,
  resolveHandoffTargets,
} from "../utils/handoff";
import { Button } from "./Button";
import styles from "./HandoffSend.module.css";

interface HandoffSendProps {
  /** 送り元（ツールなら自身が送り先候補から除外される。共有シート受け口は "share"） */
  origin: HandoffOrigin;
  /** 結果ファイルの MIME タイプ一覧（送り先候補の絞り込みに使う） */
  mimeTypes: readonly string[];
  /**
   * 送出する File[] を生成する（クリック時にのみ呼ばれる）。
   * metadata のように送出時に処理を実行するツール向けに非同期も受け付ける。
   * 契約: 空配列を返した場合は「送出中止」を意味し、送出も遷移も行わない
   * （処理失敗時のユーザー通知は呼び出し側の責務。reject した場合も送出を中止する）
   */
  getFiles: () => File[] | Promise<File[]>;
  /** 送出直後（遷移前）に呼ばれる。結果クリア（ObjectURL の revoke）に使う */
  onSent?: () => void;
  /** 見出しラベルの i18n キー（既定: handoff.sendTo） */
  labelKey?: string;
  /** true の間は送出ボタンを無効化する（処理中の多重実行防止） */
  disabled?: boolean;
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
  labelKey = "handoff.sendTo",
  disabled = false,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { send } = useHandoff();
  // 非同期の getFiles 実行中の多重クリックを防ぐ
  const [isSending, setIsSending] = useState(false);
  // getFiles の待機中にアンマウント（ユーザーが別ページへ遷移）したかを検出する
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const targets = useMemo(
    () => resolveHandoffTargets(origin, mimeTypes),
    [origin, mimeTypes],
  );

  // 送り先ルートを事前にプリフェッチしてクライアントサイド遷移を確実にする。
  // App Router はルートが未プリフェッチだと push 時にオンデマンド取得し、
  // 取得に失敗するとフル（MPA）ナビゲーションへフォールバックするため、
  // in-memory のペイロード（File[]）がドキュメントリロードで失われてしまう
  useEffect(() => {
    for (const target of targets) {
      router.prefetch(target.path);
    }
  }, [router, targets]);

  if (targets.length === 0) {
    return null;
  }

  const handleSend = async (target: HandoffTool): Promise<void> => {
    // File 実体をストアへ置いてから結果をクリアし（ObjectURL の revoke）、
    // 送り先ページへクライアントサイド遷移する（mount 時に consume される）
    if (isSending) {
      return;
    }
    setIsSending(true);
    try {
      const files = await getFiles();
      // 待機中にアンマウントされた（ユーザーが別ページへ遷移した）場合は、
      // ユーザーの遷移先を push で上書きしないよう送出を中止する
      if (!isMountedRef.current || files.length === 0) {
        return;
      }
      send({ files, origin, sentAt: Date.now() }, pathname);
      onSent?.();
      router.push(target.path);
    } catch (error) {
      // getFiles が reject しても unhandled rejection にしない（送出は中止）
      console.error("Handoff send failed:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.label}>{t(labelKey)}</p>
      <div className={styles.buttonGroup}>
        {targets.map((target) => (
          <Button
            key={target.id}
            variant="secondary"
            size="small"
            onClick={() => void handleSend(target)}
            disabled={disabled || isSending}
          >
            {t("handoff.sendToTool", { tool: t(target.labelKey) })}
          </Button>
        ))}
      </div>
    </div>
  );
};
