import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Converter",
  description: "Convert images to various formats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com/"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?display=swap&family=Manrope:wght@400;500;700;800&family=Noto+Sans:wght@400;500;700;900"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
