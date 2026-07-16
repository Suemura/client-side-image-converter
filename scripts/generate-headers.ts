// ビルド後（postbuild）に out/ の全 HTML を走査し、インラインスクリプトの sha256 ハッシュを
// 算出してページ別の Content-Security-Policy ルールを out/_headers へ追記する。
// 静的エクスポートでは nonce が使えないためハッシュベースの CSP を採用する。
// ハッシュはビルド成果物から毎回算出するため、Next.js やテーマ初期化スクリプトの
// 変更に手動追従する必要はない。
// CSP 以外のグローバルヘッダー（X-Frame-Options / HSTS 等）は public/_headers に静的定義する。
//
// 使い方: node scripts/generate-headers.ts （package.json の postbuild から実行される）

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCacheUrl } from "../src/utils/precache.ts";
import {
  buildCspRules,
  extractInlineScriptContents,
  mergeGeneratedRules,
  type PageScriptHashes,
  validateHeadersContent,
} from "../src/utils/securityHeaders.ts";
import { listFiles } from "./listFiles.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../out");
const headersPath = path.join(outDir, "_headers");

function fail(message: string): never {
  console.error(`[generate-headers] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // public/_headers は静的エクスポートで out/_headers にコピーされる。
  // 無ければグローバルヘッダーごと欠落しているため fail させる
  if (!existsSync(headersPath)) {
    fail("out/_headers がありません（public/_headers のコピー漏れ）");
  }

  const htmlPaths = (await listFiles(outDir, outDir))
    .map((p) => p.split(path.sep).join("/"))
    .filter((p) => p.endsWith(".html"));
  if (htmlPaths.length === 0) {
    fail("out/ に HTML がありません（ビルド失敗の疑い）");
  }

  const pages: PageScriptHashes[] = [];
  let totalScripts = 0;
  for (const relPath of htmlPaths) {
    const html = await readFile(path.join(outDir, relPath), "utf8");
    const hashes = extractInlineScriptContents(html).map((content) =>
      createHash("sha256").update(content, "utf8").digest("base64"),
    );
    totalScripts += hashes.length;
    pages.push({ url: toCacheUrl(relPath), hashes });
  }

  const existing = await readFile(headersPath, "utf8");
  const merged = mergeGeneratedRules(existing, buildCspRules(pages));

  // Cloudflare Pages の制限（1 行 2000 文字・100 ルール）を超えると黙って無視されるため、
  // 超過時はビルドを fail させて無効な _headers が本番に出ることを防ぐ
  const errors = validateHeadersContent(merged);
  if (errors.length > 0) {
    fail(
      `out/_headers が Cloudflare Pages の制限を超えています:\n  - ${errors.join("\n  - ")}`,
    );
  }

  await writeFile(headersPath, merged, "utf8");
  console.log(
    `[generate-headers] ${pages.length} pages, ${totalScripts} inline scripts hashed -> out/_headers`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
