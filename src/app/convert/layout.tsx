import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "画像フォーマット変換",
  description:
    "JPEG・PNG・WebP・AVIF 形式へブラウザ内で画像を変換。品質や目標ファイルサイズを指定でき、HEIC / TIFF の読み込みや複数画像の一括変換にも対応します。",
  path: "/convert/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function ConvertLayout({ children }: { children: ReactNode }) {
  return children;
}
