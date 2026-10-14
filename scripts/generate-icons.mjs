// PWA アイコン（PNG）を生成する一度きりのスクリプト。
// public/icons/icon.svg をブランドの元画像として、192 / 512（purpose: any）と
// maskable 512（セーフゾーン余白付き）の PNG を生成する。
//
// ビルドには組み込まない（生成した PNG はコミットして静的配信する）。
// ラスタライズは追加の native 依存を増やさないよう、既にある Playwright の
// Chromium を再利用する。
//
// 使い方: node scripts/generate-icons.mjs
//   （Chromium 未インストール時は事前に `npx playwright install chromium`）

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, "../public/icons");

// Logo コンポーネント（src/components/Logo.tsx）と同じブランドマーク。
const LOGO_PATHS = `
  <path d="M42.1739 20.1739L27.8261 5.82609C29.1366 7.13663 28.3989 10.1876 26.2002 13.7654C24.8538 15.9564 22.9595 18.3449 20.6522 20.6522C18.3449 22.9595 15.9564 24.8538 13.7654 26.2002C10.1876 28.3989 7.13663 29.1366 5.82609 27.8261L20.1739 42.1739C21.4845 43.4845 24.5355 42.7467 28.1133 40.548C30.3042 39.2016 32.6927 37.3073 35 35C37.3073 32.6927 39.2016 30.3042 40.548 28.1133C42.7467 24.5355 43.4845 21.4845 42.1739 20.1739Z" />
  <path fill-rule="evenodd" clip-rule="evenodd" d="M7.24189 26.4066C7.31369 26.4411 7.64204 26.5637 8.52504 26.3738C9.59462 26.1438 11.0343 25.5311 12.7183 24.4963C14.7583 23.2426 17.0256 21.4503 19.238 19.238C21.4503 17.0256 23.2426 14.7583 24.4963 12.7183C25.5311 11.0343 26.1438 9.59463 26.3738 8.52504C26.5637 7.64204 26.4411 7.31369 26.4066 7.24189C26.345 7.21246 26.143 7.14535 25.6664 7.1918C24.9745 7.25925 23.9954 7.5498 22.7699 8.14278C20.3369 9.32007 17.3369 11.4915 14.4142 14.4142C11.4915 17.3369 9.32007 20.3369 8.14278 22.7699C7.5498 23.9954 7.25925 24.9745 7.1918 25.6664C7.14534 26.143 7.21246 26.345 7.24189 26.4066ZM29.9001 10.7285C29.4519 12.0322 28.7617 13.4172 27.9042 14.8126C26.465 17.1544 24.4686 19.6641 22.0664 22.0664C19.6641 24.4686 17.1544 26.465 14.8126 27.9042C13.4172 28.7617 12.0322 29.4519 10.7285 29.9001L21.5754 40.747C21.6001 40.7606 21.8995 40.931 22.8729 40.7217C23.9424 40.4916 25.3821 39.879 27.0661 38.8441C29.1062 37.5904 31.3734 35.7982 33.5858 33.5858C35.7982 31.3734 37.5904 29.1062 38.8441 27.0661C39.879 25.3821 40.4916 23.9425 40.7216 22.8729C40.931 21.8995 40.7606 21.6001 40.747 21.5754L29.9001 10.7285ZM29.2403 4.41187L43.5881 18.7597C44.9757 20.1473 44.9743 22.1235 44.6322 23.7139C44.2714 25.3919 43.4158 27.2666 42.252 29.1604C40.8128 31.5022 38.8165 34.012 36.4142 36.4142C34.012 38.8165 31.5022 40.8128 29.1604 42.252C27.2666 43.4158 25.3919 44.2714 23.7139 44.6322C22.1235 44.9743 20.1473 44.9757 18.7597 43.5881L4.41187 29.2403C3.29027 28.1187 3.08209 26.5973 3.21067 25.2783C3.34099 23.9415 3.8369 22.4852 4.54214 21.0277C5.96129 18.0948 8.43335 14.7382 11.5858 11.5858C14.7382 8.43335 18.0948 5.9613 21.0277 4.54214C22.4852 3.8369 23.9415 3.34099 25.2783 3.21067C26.5973 3.08209 28.1187 3.29028 29.2403 4.41187Z" />
`;

const BG = "#101518";
const FG = "#f9fafb";

// size: 出力ピクセル。radius: 角丸半径（0 で全面塗り）。logoRatio: ロゴがアイコンに占める比率。
function buildSvg({ radius, logoRatio }) {
  const view = 512;
  const logo = view * logoRatio;
  const offset = (view - logo) / 2;
  const scale = logo / 48; // Logo の viewBox は 0 0 48 48
  const rect =
    radius > 0
      ? `<rect width="${view}" height="${view}" rx="${radius}" fill="${BG}" />`
      : `<rect width="${view}" height="${view}" fill="${BG}" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view}" height="${view}" viewBox="0 0 ${view} ${view}">
  ${rect}
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="${FG}">${LOGO_PATHS}</g>
</svg>`;
}

const TARGETS = [
  // purpose: any（角丸付き）
  { file: "icon-192.png", size: 192, svg: buildSvg({ radius: 112, logoRatio: 0.55 }) },
  { file: "icon-512.png", size: 512, svg: buildSvg({ radius: 112, logoRatio: 0.55 }) },
  // purpose: maskable（全面塗り + セーフゾーン余白: ロゴを中央 50% に収める）
  {
    file: "icon-maskable-512.png",
    size: 512,
    svg: buildSvg({ radius: 0, logoRatio: 0.5 }),
  },
];

async function main() {
  await mkdir(iconsDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const { file, size, svg } of TARGETS) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      // 余白なしで SVG をビューポート全体に描画する
      await page.setContent(
        `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
      );
      const buffer = await page.screenshot({ omitBackground: false });
      await writeFile(path.join(iconsDir, file), buffer);
      await page.close();
      console.log(`generated ${file} (${size}x${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
