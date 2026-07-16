// out/ 配下の走査を行う postbuild スクリプト共有ヘルパー
// （scripts/generate-sw.ts と scripts/generate-headers.ts から使う）。

import { readdir } from "node:fs/promises";
import path from "node:path";

/** ディレクトリ配下の全ファイルを再帰的に列挙し、base からの相対パスで返す。 */
export async function listFiles(dir: string, base: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full));
    }
  }
  return files;
}
