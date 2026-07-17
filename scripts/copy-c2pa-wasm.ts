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
  try {
    await copyFile(source, dest);
  } catch (error) {
    // @contentauth/c2pa-web は 0.x（プレリリース）のため、dist/ 配下の内部構造は
    // バージョンアップ（Dependabot 更新含む）で変わる可能性がある。素の ENOENT だと
    // 原因特定に時間がかかるため、想定原因を明示したメッセージを添える
    console.error(
      `[copy-c2pa-wasm] コピーに失敗しました: ${source} -> ${dest}\n` +
        "@contentauth/c2pa-web のバージョンアップにより WASM の配置パス " +
        "（node_modules/@contentauth/c2pa-web/dist/resources/c2pa_bg.wasm）が" +
        "変わった可能性があります。node_modules 内の実際のパスを確認し、" +
        "変わっていれば本スクリプトの source を更新してください。",
    );
    throw error;
  }
  console.log("[copy-c2pa-wasm] c2pa_bg.wasm -> public/c2pa/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
