import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "画像編集",
  description:
    "露光・コントラスト・彩度・色温度など写真アプリ相当のライト/カラー調整を、プレビューを見ながら複数画像へまとめて適用。処理はすべてブラウザ内で完結し、画像はサーバーに送信されません。",
  path: "/edit/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function EditLayout({ children }: { children: ReactNode }) {
  return children;
}
