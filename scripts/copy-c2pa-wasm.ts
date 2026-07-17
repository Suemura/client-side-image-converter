// @contentauth/c2pa-web の WASM バイナリを public/ へコピーする（predev / prebuild）。
// c2pa-web は WASM を分離ロードする設計（createC2pa({ wasmSrc }) に URL を渡す）のため、
// 同一オリジンで配信できるよう node_modules から public/c2pa/ へコピーする。
// - バンドラー（webpack / Turbopack）の asset 解決に依存せず、両ビルドで同じ URL になる
// - public/c2pa/ は gitignore 済み（8MB 超のバイナリをリポジトリに置かない）
// - out/ へコピーされたものは precache の走査対象になり、オフラインでも動作する
//
// 使い方: node scripts/copy-c2pa-wasm.ts （package.json の predev / prebuild から実行される）

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(
  __dirname,
  "../node_modules/@contentauth/c2pa-web/dist/resources/c2pa_bg.wasm",
);
const destDir = path.resolve(__dirname, "../public/c2pa");
const dest = path.join(destDir, "c2pa_bg.wasm");

async function main(): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await copyFile(source, dest);
  console.log("[copy-c2pa-wasm] c2pa_bg.wasm -> public/c2pa/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
