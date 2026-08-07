import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "AI画像拡大",
  description:
    "AI（超解像モデル Real-ESRGAN）で画像を2倍・4倍に高精細に拡大。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
  path: "/upscale/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function UpscaleLayout({ children }: { children: ReactNode }) {
  return children;
}
