import type { MetadataRoute } from "next";
import { SITE_NAME } from "../utils/pageMetadata";

// PWA の Web App Manifest。Next が /manifest.webmanifest として静的出力し、
// 各ページの <head> に <link rel="manifest"> を自動注入する。
// 静的エクスポート（output: "export"）でもビルド時に確定するよう force-static を明示する。
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Image Converter",
    description:
      "ブラウザ内で完結する画像フォーマット変換・トリミング・EXIF メタデータ管理ツール。一度開けばオフラインでも動作します。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // ライトテーマの背景色に合わせる（globals.css の --background）
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
