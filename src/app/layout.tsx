import type { Metadata } from "next";
import { Manrope, Noto_Sans } from "next/font/google";
import { I18nProvider } from "../components/I18nProvider";
import { ThemeProvider } from "../contexts/ThemeContext";
import { SITE_LOCALE, SITE_NAME, SITE_URL } from "../utils/pageMetadata";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans",
  display: "swap",
});

// トップページ（"/"）のメタデータ兼サイト全体の既定値。
// 各ルートの layout.tsx が固有の title / description で上書きする。
const HOME_DESCRIPTION =
  "JPEG・PNG・WebP・AVIF などの画像フォーマット変換、トリミング、EXIF メタデータ削除をすべてブラウザ内で実行。画像をサーバーに送信しないプライバシー重視の無料ツールです。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // トップページに適用される既定タイトル
    default: `${SITE_NAME} | ブラウザ内で完結する画像変換・トリミングツール`,
    // 各ルートの title を "<ページ名> | サイト名" 形式に装飾する
    template: `%s | ${SITE_NAME}`,
  },
  description: HOME_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE,
    url: "/",
    title: `${SITE_NAME} | ブラウザ内で完結する画像変換・トリミングツール`,
    description: HOME_DESCRIPTION,
  },
  twitter: {
    // 専用の OG 画像アセットが無いため summary カードを使う（buildPageMetadata と同方針）
    card: "summary",
    title: `${SITE_NAME} | ブラウザ内で完結する画像変換・トリミングツール`,
    description: HOME_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${manrope.variable} ${notoSans.variable}`}
      suppressHydrationWarning
    >
      <head />
      <body>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Theme initialization script to prevent FOUC, hardcoded content is safe
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('theme');
                  if (savedTheme) {
                    document.documentElement.setAttribute('data-theme', savedTheme);
                  } else {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    const theme = prefersDark ? 'dark' : 'light';
                    document.documentElement.setAttribute('data-theme', theme);
                  }
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'light');
                }
              })()
            `,
          }}
        />
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
