// ビルド後（postbuild）に out/ を走査して Service Worker（out/sw.js）を生成する。
// プリキャッシュ判定・URL 変換・バージョン算出は src/utils/precache.ts の純粋関数を
// 再利用する（単体テスト済み）。Node 24 の型ストリップ実行に依存し、tsx 等の追加依存は不要。
//
// 使い方: node scripts/generate-sw.ts （package.json の postbuild から実行される）

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrecacheUrls,
  computeCacheVersion,
  getCacheName,
} from "../src/utils/precache.ts";
import {
  SHARE_CACHE_NAME,
  SHARE_PAYLOAD_URL,
  SHARE_RECEIVE_PATH,
  SHARE_TARGET_ACTION,
} from "../src/utils/shareTarget.ts";
import { listFiles } from "./listFiles.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../out");
const templatePath = path.resolve(__dirname, "sw-template.js");
const swOutPath = path.join(outDir, "sw.js");

async function main(): Promise<void> {
  const relPaths = (await listFiles(outDir, outDir)).map((p) =>
    p.split(path.sep).join("/"),
  );
  const urls = buildPrecacheUrls(relPaths);
  const version = computeCacheVersion(urls);
  const cacheName = getCacheName(version);

  const template = await readFile(templatePath, "utf8");
  // 全プレースホルダを差し替える（replaceAll）。置換値に $ が含まれても
  // 壊れないよう関数形式を使う。
  const sw = template
    .replaceAll("__CACHE_NAME__", () => cacheName)
    .replaceAll("__PRECACHE_URLS__", () => JSON.stringify(urls))
    .replaceAll("__SHARE_TARGET_ACTION__", () => SHARE_TARGET_ACTION)
    .replaceAll("__SHARE_CACHE_NAME__", () => SHARE_CACHE_NAME)
    .replaceAll("__SHARE_PAYLOAD_URL__", () => SHARE_PAYLOAD_URL)
    .replaceAll("__SHARE_RECEIVE_PATH__", () => SHARE_RECEIVE_PATH);

  await writeFile(swOutPath, sw, "utf8");
  console.log(
    `[generate-sw] ${cacheName}: ${urls.length} URLs precached -> out/sw.js`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
