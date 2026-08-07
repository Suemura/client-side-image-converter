import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "共有シートから受け取り",
    description:
      "スマホの共有シートから受け取った画像を各ツールへ引き継ぐ受け口ページ。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
    path: "/share/",
  }),
  // 共有シート専用の機能的エンドポイントのため検索結果に出さない（sitemap からも除外済み）
  robots: { index: false, follow: false },
};

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function ShareLayout({ children }: { children: ReactNode }) {
  return children;
}
