import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildPageMetadata } from "../../utils/pageMetadata";

export const metadata: Metadata = buildPageMetadata({
  title: "画像メタデータ・プライバシー管理",
  description:
    "画像の EXIF メタデータ（撮影日時・位置情報・カメラ情報など）を確認し、プライバシーに関わる情報を削除。JPEG は選択的削除、その他の形式は全削除に対応し、すべてブラウザ内で完結します。",
  path: "/metadata/",
});

// ページ本体は "use client" のため、metadata 定義用のサーバーコンポーネント層として children を返すだけの layout を置く。
export default function MetadataLayout({ children }: { children: ReactNode }) {
  return children;
}
