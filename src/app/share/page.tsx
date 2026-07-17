"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandoffSend } from "../../components/HandoffSend";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { filterValidFiles } from "../../utils/fileUtils";
import { resolveShareAcceptTypes } from "../../utils/handoff";
import { readSharedPayload } from "../../utils/shareTarget";
import styles from "./share.module.css";

/** 共有シートで受理する MIME 一覧（モジュールスコープで 1 回だけ算出） */
const SHARE_ACCEPT_TYPES = resolveShareAcceptTypes();

/** ページの表示状態 */
type ShareState =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "empty" }
  | { status: "received"; files: File[]; skippedCount: number };

/**
 * 共有シート（Web Share Target）の受け口ページ。
 * Service Worker が一時キャッシュへ保管した共有ペイロードを mount 時に読み取り
 * （読み取りと同時に削除される）、既存のハンドオフ送出 UI で行き先ツールを選ばせる。
 */
export default function SharePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<ShareState>({ status: "loading" });

  // readSharedPayload は読み取りと同時にペイロードを削除するため、StrictMode の
  // effect 二重実行で 2 回目が空振り（empty 表示）しないよう ref ガードで 1 回に限定する
  const didReadRef = useRef(false);

  useEffect(() => {
    if (didReadRef.current) {
      return;
    }
    didReadRef.current = true;
    if (!("caches" in window)) {
      setState({ status: "unsupported" });
      return;
    }
    void (async () => {
      try {
        const shared = await readSharedPayload(window.caches);
        const valid = shared
          ? filterValidFiles(shared, SHARE_ACCEPT_TYPES)
          : [];
        if (!shared || valid.length === 0) {
          setState({ status: "empty" });
          return;
        }
        setState({
          status: "received",
          files: valid,
          skippedCount: shared.length - valid.length,
        });
      } catch {
        // Cache Storage へのアクセス自体に失敗する環境ではペイロードなし扱いにする
        setState({ status: "empty" });
      }
    })();
  }, []);

  const mimeTypes =
    state.status === "received"
      ? [...new Set(state.files.map((file) => file.type))]
      : [];

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("share.title")}</h1>
          {state.status === "loading" && (
            <p className={styles.stateText}>{t("share.loading")}</p>
          )}
          {state.status === "unsupported" && (
            <p className={styles.stateText}>{t("share.unsupported")}</p>
          )}
          {state.status === "empty" && (
            <div className={styles.stateContainer}>
              <p className={styles.stateText}>{t("share.empty")}</p>
              <p className={styles.hintText}>{t("share.emptyHint")}</p>
              <Link href="/" className={styles.homeLink}>
                {t("share.goHome")}
              </Link>
            </div>
          )}
          {state.status === "received" && (
            <div className={styles.stateContainer}>
              <p className={styles.stateText}>
                {t("share.receivedCount", { count: state.files.length })}
              </p>
              {state.skippedCount > 0 && (
                <p className={styles.hintText}>
                  {t("handoff.skipped", { count: state.skippedCount })}
                </p>
              )}
              <ul className={styles.fileList}>
                {state.files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className={styles.fileItem}>
                    {file.name}
                  </li>
                ))}
              </ul>
              <HandoffSend
                origin="share"
                mimeTypes={mimeTypes}
                getFiles={() => state.files}
                labelKey="share.sendTo"
              />
            </div>
          )}
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
