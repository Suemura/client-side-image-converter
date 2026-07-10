"use client";

import type React from "react";
import { createContext, useContext, useMemo, useRef } from "react";
import {
  createHandoffStore,
  type HandoffPayload,
  type HandoffStore,
} from "../utils/handoff";

/**
 * ツール連携（ハンドオフ）の共有ストア。
 * ページ間で処理結果の File[] を一度きり（consume-once）引き継ぐ。
 * File 実体のみを保持し、ObjectURL・ストレージ・URL クエリは経由しない
 * （クライアントサイド遷移でのみ生存する in-memory 前提。リロードで消える）。
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
  // ペイロードは state ではなく ref（ストア）で保持する。
  // 送出・消費で再レンダーは不要で、consume() が読み取りと同時にクリアするため
  // React StrictMode の effect 二重実行でも二重取り込みにならない。
  const storeRef = useRef<HandoffStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createHandoffStore();
  }
  const store = storeRef.current;

  const value = useMemo<HandoffStore>(
    () => ({
      send: store.send,
      consume: store.consume,
    }),
    [store],
  );

  return (
    <HandoffContext.Provider value={value}>{children}</HandoffContext.Provider>
  );
};

export type { HandoffPayload };
