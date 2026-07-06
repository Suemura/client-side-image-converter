import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "画像トリミング",
  description:
    "プレビューを見ながら画像を好きなサイズにトリミング。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
  path: "/crop/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function CropLayout({ children }: { children: ReactNode }) {
  return children;
}
