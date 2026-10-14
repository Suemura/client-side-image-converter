import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "画像モザイク・ぼかし",
  description:
    "顔や写り込みなど見せたくない部分をモザイク・ぼかし・塗りつぶしで隠す。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
  path: "/redact/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function RedactLayout({ children }: { children: ReactNode }) {
  return children;
}
