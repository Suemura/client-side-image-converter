import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "統合ワークスペース Image Studio",
  description:
    "切り抜き・調整・レタッチ・AI拡大・AI背景除去・メタデータ管理を1画面でまとめて使える統合ワークスペース。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
  path: "/studio/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function StudioLayout({ children }: { children: ReactNode }) {
  return children;
}
