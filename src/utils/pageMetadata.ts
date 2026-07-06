import type { Metadata } from "next";

// サイト全体で共有する定数（root layout と各ルートの layout.tsx で使用）
export const SITE_NAME = "Client-Side Image Converter";
export const SITE_URL = "https://image-converter.suemura.app";

// メタデータの主言語は日本語とする（html lang="ja" / i18n の既定言語も ja のため）。
// 静的エクスポートのため言語別 URL は存在しない。
export const SITE_LOCALE = "ja_JP";

type PageMetadataInput = {
  // ページ固有タイトル。root layout の title.template（"%s | サイト名"）で装飾される
  title: string;
  description: string;
  // canonical / og:url に使うルート絶対パス（例: "/convert/"）。
  // trailingSlash: true の静的エクスポートに合わせて末尾スラッシュ付きで渡す
  path: string;
};

// 各ページ固有の metadata（title / description / OGP / Twitter / canonical）を組み立てる純粋関数。
// og:title は title.template が適用されないため、ここでサイト名を明示的に付与して補完する。
export function buildPageMetadata({
  title,
  description,
  path,
}: PageMetadataInput): Metadata {
  const ogTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      url: path,
      title: ogTitle,
      description,
    },
    twitter: {
      // 専用の OG 画像アセットが無いため、大画像カード（summary_large_image）ではなく
      // 画像なしでも自然な summary カードを使う。画像追加時に切り替える
      card: "summary",
      title: ogTitle,
      description,
    },
  };
}
