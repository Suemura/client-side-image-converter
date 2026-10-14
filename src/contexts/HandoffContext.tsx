"use client";

import { usePathname } from "next/navigation";
import type React from "react";
import { createContext, useContext, useEffect } from "react";
import {
  createHandoffStore,
  type HandoffPayload,
  type HandoffStore,
} from "../utils/handoff";

/**
 * ツール連携（ハンドオフ）の共有ストア本体。
 * React ツリー外のモジュールスコープに 1 つだけ保持する。Next.js のクライアント遷移では
 * タイミングによりルートレイアウトごと再マウントされることがあり、Provider の ref で
 * 保持すると送出直後のペイロードが失われるため、同一ドキュメント内で必ず生存する
 * モジュール状態にする（リロードで消える in-memory 前提は変わらない）。
 */
const handoffStore: HandoffStore = createHandoffStore();

/**
 * ツール連携（ハンドオフ）の共有ストアを配る Context。
 * ページ間で処理結果の File[] を 1 回のナビゲーションだけ引き継ぐ。
 * File 実体のみを保持し、ObjectURL・ストレージ・URL クエリは経由しない。
 */
const HandoffContext = createContext<HandoffStore | undefined>(undefined);

export const useHandoff = (): HandoffStore => {
  const context = useContext(HandoffContext);
  if (!context) {
    throw new Error("useHandoff must be used within a HandoffProvider");
  }
  return context;
};

export const HandoffProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // 到着済みペイロードを残したまま受け取り側のないページへ移動した場合も
  // 確実に破棄するため、パス名の変化をストアへ通知する
  const pathname = usePathname();
  useEffect(() => {
    handoffStore.onNavigate(pathname);
  }, [pathname]);

  return (
    <HandoffContext.Provider value={handoffStore}>
      {children}
    </HandoffContext.Provider>
  );
};

export type { HandoffPayload };
