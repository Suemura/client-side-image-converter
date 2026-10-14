import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  distDir: "out",
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // onnxruntime-web の dist コードには new URL("ort-*.wasm", import.meta.url) が
    // 含まれ（実行されないガード内でも webpack は静的解析でアセット化する）、
    // 約 27MB の WASM が _next/static/media/ へ複製されてしまう。
    // ランタイムの WASM は scripts/copy-ort-assets.ts が public/ort/ へ分割配置し
    // modelLoader.ts が実行時ロードするため、バンドラー側のアセット化は無効にする
    // （Cloudflare Pages の 25MiB/ファイル上限と SW プリキャッシュ肥大の回避）。
    config.module.rules.push({
      test: /node_modules[\\/]onnxruntime-web[\\/]dist[\\/].*\.mjs$/,
      parser: { url: false },
    });
    return config;
  },
};

export default nextConfig;
