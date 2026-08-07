import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "背景除去",
  description:
    "AI（セグメンテーションモデル U²-Net）で画像の背景を切り抜き、透過PNG / WebPを作成。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
  path: "/remove-bg/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function RemoveBgLayout({ children }: { children: ReactNode }) {
  return children;
}
