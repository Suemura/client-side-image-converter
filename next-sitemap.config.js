// 本番 URL の単一の source of truth は site.config.json（canonical を出力する
// src/utils/pageMetadata.ts と共有し、sitemap.xml と canonical の URL 不整合を防ぐ）。
const { siteUrl } = require("./site.config.json");

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl,
  generateRobotsTxt: true,
  generateIndexSitemap: false,
  outDir: "./out",
  transform: async (config, path) => {
    // デフォルトの優先度とページごとの設定
    const priorities = {
      "/": 1.0,
      "/convert": 0.8,
      "/crop": 0.8,
    };

    // 変更頻度の設定
    const changefreq = path === "/" ? "weekly" : "monthly";

    return {
      loc: path,
      changefreq,
      priority: priorities[path] || 0.7,
      lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
    };
  },
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    additionalSitemaps: [],
  },
};
