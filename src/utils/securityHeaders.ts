// セキュリティヘッダー（CSP）生成の純粋ロジック。
// ビルド時のジェネレーター（scripts/generate-headers.ts）と単体テスト・E2E の両方から使う。
// Canvas / DOM / Node API 非依存にして vitest でそのまま検証できるようにする
// （sha256 ハッシュの算出は node:crypto に、相対パス→URL 変換は precache.ts の
// toCacheUrl に依存するため、どちらも scripts/ 側で行う。他モジュールを import すると
// Node の型ストリップ実行が extensionless import を解決できない点にも注意）。

// Cloudflare Pages の _headers ファイルの制限（超過分は無視されるため、ビルド時に検査して fail させる）
// https://developers.cloudflare.com/pages/configuration/headers/
export const MAX_LINE_LENGTH = 2000;
export const MAX_RULES = 100;

// 生成区間を示すマーカー。postbuild を複数回実行しても重複しないよう、
// この区間だけを冪等に差し替える。
export const GENERATED_START = "# --- generated:security-headers:start ---";
export const GENERATED_END = "# --- generated:security-headers:end ---";

/** ページ（HTML ファイル）ごとのインラインスクリプトハッシュ。 */
export interface PageScriptHashes {
  /** 配信 URL（toCacheUrl で変換済み。例: "/" / "/convert/" / "/404.html"） */
  url: string;
  /** インラインスクリプト本文の sha256 ハッシュ（base64。CSP の 'sha256-...' に埋める値） */
  hashes: string[];
}

/**
 * HTML からインラインスクリプト（src 属性を持たない <script> タグ）の本文を抽出する。
 * CSP のハッシュはタグ間のテキストを**そのまま**（空白・改行含む）ハッシュ化した値と
 * 照合されるため、本文は一切加工せずに返す。
 */
export function extractInlineScriptContents(html: string): string[] {
  const contents: string[] = [];
  const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptTag)) {
    const attrs = match[1];
    // src 属性を持つ外部スクリプトは 'self' で許可されるため対象外
    if (/\bsrc\s*=/i.test(attrs)) continue;
    contents.push(match[2]);
  }
  return contents;
}

/**
 * 1 ページ分の Content-Security-Policy 値を組み立てる。
 * - script-src はハッシュ + 'wasm-unsafe-eval'（@jsquash 等の WASM 用）のみで、
 *   'unsafe-inline' / 'unsafe-eval' は含めない
 * - style-src の 'unsafe-inline' は style 属性による動的スタイル用
 *   （Firefox が style-src-attr 未対応のため style-src 側で許可する）
 * - img-src の blob: / data: はプレビュー（createObjectURL / toDataURL）用
 * - connect-src / worker-src の blob: は自コード生成物の読み取り用
 */
export function buildPageCsp(hashes: string[]): string {
  const scriptSrc = [
    "'self'",
    "'wasm-unsafe-eval'",
    ...Array.from(new Set(hashes)).map((hash) => `'sha256-${hash}'`),
  ].join(" ");
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * ページ別の CSP ルール群（_headers 形式のテキスト）を組み立てる。
 * 全ハッシュを /* に集約すると 1 行 2000 文字制限を超えるリスクがあるため、
 * HTML ページ単位のルールとして生成する（Cloudflare Pages は同名ヘッダーを
 * カンマ結合するため、CSP はここで生成するルールにのみ置き、/* には置かない）。
 */
export function buildCspRules(pages: PageScriptHashes[]): string {
  const rules = [...pages]
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    .map(
      (page) =>
        `${page.url}\n  Content-Security-Policy: ${buildPageCsp(page.hashes)}`,
    );
  return rules.join("\n");
}

/**
 * 既存の _headers 内容へ生成ルールをマーカー区間として合成する。
 * マーカー区間が既にあれば差し替え、なければ末尾に追記する（冪等）。
 */
export function mergeGeneratedRules(
  existing: string,
  generatedRules: string,
): string {
  const section = `${GENERATED_START}\n${generatedRules}\n${GENERATED_END}`;
  const startIndex = existing.indexOf(GENERATED_START);
  const endIndex = existing.indexOf(GENERATED_END);
  if (startIndex !== -1 && endIndex !== -1) {
    const before = existing.slice(0, startIndex);
    const after = existing.slice(endIndex + GENERATED_END.length);
    return `${before}${section}${after}`;
  }
  const base = existing.endsWith("\n") ? existing : `${existing}\n`;
  return `${base}\n${section}\n`;
}

/**
 * _headers の内容が Cloudflare Pages の制限内かを検査する。
 * 違反があればエラーメッセージの一覧を返す（空配列なら妥当）。
 * 制限を超えたルールは Cloudflare 側で黙って無視されるため、ビルド時に fail させる。
 */
export function validateHeadersContent(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\n");
  let ruleCount = 0;
  lines.forEach((line, index) => {
    if (line.length > MAX_LINE_LENGTH) {
      errors.push(
        `${index + 1} 行目が ${MAX_LINE_LENGTH} 文字を超えています（${line.length} 文字）`,
      );
    }
    // ルールパス行 = インデントなし・コメントでも空行でもない行
    if (line !== "" && !line.startsWith(" ") && !line.startsWith("#")) {
      ruleCount++;
    }
  });
  if (ruleCount > MAX_RULES) {
    errors.push(
      `ルール数が上限 ${MAX_RULES} を超えています（${ruleCount} 件）`,
    );
  }
  return errors;
}

/**
 * _headers の内容から、指定 URL パスに完全一致するルールの
 * Content-Security-Policy 値を取り出す（単体テスト・E2E の検証用）。
 */
export function parseCspForPath(
  content: string,
  urlPath: string,
): string | undefined {
  const lines = content.split("\n");
  let inTargetRule = false;
  for (const line of lines) {
    if (line !== "" && !line.startsWith(" ") && !line.startsWith("#")) {
      inTargetRule = line.trim() === urlPath;
      continue;
    }
    if (inTargetRule) {
      const header = line.trim().match(/^Content-Security-Policy:\s*(.+)$/i);
      if (header) return header[1];
    }
  }
  return undefined;
}
