import { describe, expect, it } from "vitest";
import {
  buildCspRules,
  buildPageCsp,
  extractInlineScriptContents,
  GENERATED_END,
  GENERATED_START,
  MAX_LINE_LENGTH,
  MAX_RULES,
  mergeGeneratedRules,
  parseCspForPath,
  validateHeadersContent,
} from "../securityHeaders";

describe("extractInlineScriptContents", () => {
  it("src 属性のない script タグの本文を抽出する", () => {
    const html = "<html><body><script>alert(1)</script></body></html>";
    expect(extractInlineScriptContents(html)).toEqual(["alert(1)"]);
  });

  it("属性付きのインラインスクリプトも抽出する", () => {
    const html = '<script type="module" defer>run()</script>';
    expect(extractInlineScriptContents(html)).toEqual(["run()"]);
  });

  it("src 属性を持つ外部スクリプトは対象外", () => {
    const html =
      '<script src="/a.js"></script><script defer src="/b.js"></script>';
    expect(extractInlineScriptContents(html)).toEqual([]);
  });

  it("複数のインラインスクリプトを文書順に抽出する", () => {
    const html =
      '<script>first()</script><script src="/x.js"></script><script>second()</script>';
    expect(extractInlineScriptContents(html)).toEqual(["first()", "second()"]);
  });

  it("本文の空白・改行を一切加工せずそのまま返す（CSP ハッシュの前提）", () => {
    const content = "\n  (function() {\n    init();\n  })()\n";
    const html = `<script>${content}</script>`;
    expect(extractInlineScriptContents(html)).toEqual([content]);
  });

  it("script タグがない HTML では空配列を返す", () => {
    expect(extractInlineScriptContents("<html><body></body></html>")).toEqual(
      [],
    );
  });
});

describe("buildPageCsp", () => {
  it("script-src にハッシュと 'wasm-unsafe-eval' を含める", () => {
    const csp = buildPageCsp(["abc123=", "def456="]);
    expect(csp).toContain(
      "script-src 'self' 'wasm-unsafe-eval' 'sha256-abc123=' 'sha256-def456='",
    );
  });

  it("script-src に 'unsafe-inline' / 'unsafe-eval' を含めない", () => {
    const csp = buildPageCsp(["abc123="]);
    const scriptSrc = csp
      .split("; ")
      .find((directive) => directive.startsWith("script-src "));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("重複するハッシュは 1 つにまとめる", () => {
    const csp = buildPageCsp(["same=", "same="]);
    expect(csp.match(/'sha256-same='/g)).toHaveLength(1);
  });

  it("主要ディレクティブが揃っている", () => {
    const csp = buildPageCsp([]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("connect-src 'self' blob:");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("buildCspRules", () => {
  it("URL 順にソートされたページ別ルールを生成する", () => {
    const rules = buildCspRules([
      { url: "/convert/", hashes: ["a="] },
      { url: "/", hashes: ["b="] },
    ]);
    const lines = rules.split("\n");
    expect(lines[0]).toBe("/");
    expect(lines[1]).toMatch(/^ {2}Content-Security-Policy: /);
    expect(lines[1]).toContain("'sha256-b='");
    expect(lines[2]).toBe("/convert/");
    expect(lines[3]).toContain("'sha256-a='");
  });

  it("ファイルパス形式の URL もそのままルールにする", () => {
    const rules = buildCspRules([{ url: "/404.html", hashes: [] }]);
    expect(rules.split("\n")[0]).toBe("/404.html");
  });
});

describe("mergeGeneratedRules", () => {
  const existing = "/sw.js\n  Cache-Control: no-cache\n";
  const rules = "/\n  Content-Security-Policy: default-src 'self'";

  it("マーカー区間がなければ末尾に追記する", () => {
    const merged = mergeGeneratedRules(existing, rules);
    expect(merged).toContain(existing);
    expect(merged).toContain(`${GENERATED_START}\n${rules}\n${GENERATED_END}`);
  });

  it("2 回適用しても生成区間が重複しない（冪等）", () => {
    const once = mergeGeneratedRules(existing, rules);
    const twice = mergeGeneratedRules(once, rules);
    expect(twice).toBe(once);
  });

  it("マーカー区間があれば内容を差し替える", () => {
    const once = mergeGeneratedRules(existing, "/old\n  X-Old: 1");
    const updated = mergeGeneratedRules(once, rules);
    expect(updated).not.toContain("X-Old");
    expect(updated).toContain(rules);
    // 生成区間の外側（既存ルール）は保持される
    expect(updated).toContain(existing);
  });
});

describe("validateHeadersContent", () => {
  it("制限内の内容ではエラーなし", () => {
    const content =
      "/*\n  X-Frame-Options: DENY\n\n# comment\n/convert/\n  A: b\n";
    expect(validateHeadersContent(content)).toEqual([]);
  });

  it("1 行が上限を超えるとエラーを返す", () => {
    const longLine = `  Content-Security-Policy: ${"x".repeat(MAX_LINE_LENGTH)}`;
    const errors = validateHeadersContent(`/*\n${longLine}\n`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`${MAX_LINE_LENGTH} 文字を超え`);
  });

  it("ルール数が上限を超えるとエラーを返す", () => {
    const content = Array.from(
      { length: MAX_RULES + 1 },
      (_, i) => `/page-${i}/\n  A: b`,
    ).join("\n");
    const errors = validateHeadersContent(content);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`上限 ${MAX_RULES} を超え`);
  });

  it("コメント・空行・ヘッダー行はルール数に数えない", () => {
    const lines = ["# comment", "", "/a/", "  X: 1", "  Y: 2"];
    expect(validateHeadersContent(lines.join("\n"))).toEqual([]);
  });
});

describe("parseCspForPath", () => {
  const content = [
    "/*",
    "  X-Frame-Options: DENY",
    "/",
    "  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-root='",
    "/convert/",
    "  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-convert='",
    "",
  ].join("\n");

  it("指定パスのルールから CSP 値を取り出す", () => {
    expect(parseCspForPath(content, "/convert/")).toContain(
      "'sha256-convert='",
    );
    expect(parseCspForPath(content, "/")).toContain("'sha256-root='");
  });

  it("CSP を持たないパスや存在しないパスでは undefined", () => {
    expect(parseCspForPath(content, "/*")).toBeUndefined();
    expect(parseCspForPath(content, "/missing/")).toBeUndefined();
  });
});
