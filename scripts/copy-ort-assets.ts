// onnxruntime-web のランタイムアセット（WASM 本体 + Emscripten ローダー）を
// node_modules から public/ort/ へコピーする。/upscale の AI 超解像はこれらを
// 自己ホストで配信する（CDN 不使用・クライアントサイド完結の方針）。
//
// Cloudflare Pages にはファイルあたり 25MiB の配信上限があり、WebGPU 対応の
// ort-wasm-simd-threaded.jsep.wasm（約 27MB）はそのままでは配信できない。
// そのため上限を超えるファイルはチャンクへ分割して配置し、実行時に
// modelLoader.ts（fetchOrtWasmBinary）が結合して ort.env.wasm.wasmBinary へ
// 注入する。分割情報は ort-assets.json マニフェストに書き出す。
//
// public/ort/ は生成物のため gitignore し、prebuild / predev で毎回再生成する
// （onnxruntime-web の更新に自動追従し、コピー漏れによる古いランタイム配信を防ぐ）。
//
// 使い方: node scripts/copy-ort-assets.ts （package.json の prebuild / predev から実行される）

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../node_modules/onnxruntime-web/dist");
const outDir = path.resolve(__dirname, "../public/ort");

/** Cloudflare Pages の 1 ファイル配信上限（25MiB）より安全側に置く分割サイズ */
const CHUNK_SIZE = 20 * 1024 * 1024;

/** そのままコピーするアセット（Emscripten ローダー。数十 KB） */
const COPY_FILES = ["ort-wasm-simd-threaded.jsep.mjs"];

/** 分割対象になり得る WASM 本体（onnxruntime-web のデフォルトエントリは JSEP 版を使う） */
const WASM_FILE = "ort-wasm-simd-threaded.jsep.wasm";

interface OrtAssetsManifest {
  /** onnxruntime-web のバージョン（キャッシュキーの一部として使う） */
  version: string;
  /** WASM 本体のファイル名 */
  wasm: {
    name: string;
    /** 結合後の総バイト数（進捗表示と結合検証に使う） */
    size: number;
    /** 分割チャンクのファイル名（分割不要なら 1 要素） */
    parts: string[];
  };
}

async function main(): Promise<void> {
  const pkg = JSON.parse(
    await readFile(
      path.resolve(__dirname, "../node_modules/onnxruntime-web/package.json"),
      "utf8",
    ),
  ) as { version: string };

  // 旧バージョンの残骸が混ざらないよう毎回作り直す
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const name of COPY_FILES) {
    await copyFile(path.join(distDir, name), path.join(outDir, name));
  }

  const wasm = await readFile(path.join(distDir, WASM_FILE));
  const parts: string[] = [];
  for (let offset = 0, i = 0; offset < wasm.length; offset += CHUNK_SIZE, i++) {
    const partName = `${WASM_FILE}.part${i}`;
    await writeFile(
      path.join(outDir, partName),
      wasm.subarray(offset, offset + CHUNK_SIZE),
    );
    parts.push(partName);
  }

  const manifest: OrtAssetsManifest = {
    version: pkg.version,
    wasm: { name: WASM_FILE, size: wasm.length, parts },
  };
  await writeFile(
    path.join(outDir, "ort-assets.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  // 分割後も上限超過が残っていたらビルドを失敗させる（Pages で黙って 404 になるのを防ぐ）
  if (parts.length === 0) {
    throw new Error(`[copy-ort-assets] ${WASM_FILE} が空です`);
  }
  console.log(
    `[copy-ort-assets] onnxruntime-web@${pkg.version}: ${COPY_FILES.length} loader(s), ` +
      `${WASM_FILE} ${(wasm.length / 1024 / 1024).toFixed(1)}MB -> ${parts.length} part(s)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
