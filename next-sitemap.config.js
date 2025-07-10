/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://image-converter.suemura.app',
  generateRobotsTxt: true,
  generateIndexSitemap: false,
  outDir: './out',
  transform: async (config, path) => {
    // デフォルトの優先度とページごとの設定
    const priorities = {
      '/': 1.0,
      '/convert': 0.8,
      '/crop': 0.8,
    };

    // 変更頻度の設定
    const changefreq = path === '/' ? 'weekly' : 'monthly';

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
        userAgent: '*',
        allow: '/',
      },
    ],
    additionalSitemaps: [],
  },
};