import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectBrowserLanguage,
  getInitialLanguage,
  getStoredLanguage,
  isValidLanguage,
  setStoredLanguage,
} from "../languageStorage";

/** navigator の言語設定をモックする */
const mockNavigatorLanguage = (
  language: string,
  languages?: string[],
): void => {
  vi.stubGlobal("navigator", {
    language,
    languages: languages ?? [language],
  });
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isValidLanguage", () => {
  it("サポートされている言語のみ有効と判定する", () => {
    expect(isValidLanguage("ja")).toBe(true);
    expect(isValidLanguage("en")).toBe(true);
    expect(isValidLanguage("fr")).toBe(false);
    expect(isValidLanguage("")).toBe(false);
  });
});

describe("detectBrowserLanguage", () => {
  it("日本語のブラウザ設定では ja を返す", () => {
    mockNavigatorLanguage("ja-JP");
    expect(detectBrowserLanguage()).toBe("ja");
  });

  it("英語のブラウザ設定では en を返す", () => {
    mockNavigatorLanguage("en-US");
    expect(detectBrowserLanguage()).toBe("en");
  });

  it("サポート外の言語では navigator.languages をフォールバックとして参照する", () => {
    mockNavigatorLanguage("fr-FR", ["fr-FR", "en-GB"]);
    expect(detectBrowserLanguage()).toBe("en");
  });

  it("サポート外の言語のみの場合はデフォルトの ja を返す", () => {
    mockNavigatorLanguage("fr-FR", ["fr-FR", "de-DE"]);
    expect(detectBrowserLanguage()).toBe("ja");
  });
});

describe("getStoredLanguage / setStoredLanguage", () => {
  it("保存した言語設定を取得できる", () => {
    setStoredLanguage("en");
    expect(getStoredLanguage()).toBe("en");
  });

  it("未保存の場合は null を返す", () => {
    expect(getStoredLanguage()).toBe(null);
  });

  it("不正な値が保存されている場合は null を返す", () => {
    localStorage.setItem("preferred-language", "fr");
    expect(getStoredLanguage()).toBe(null);
  });
});

describe("getInitialLanguage", () => {
  it("ローカルストレージの設定を最優先する", () => {
    mockNavigatorLanguage("ja-JP");
    setStoredLanguage("en");
    expect(getInitialLanguage()).toBe("en");
  });

  it("保存済み設定がなければブラウザ言語を使用する", () => {
    mockNavigatorLanguage("en-US");
    expect(getInitialLanguage()).toBe("en");
  });
});
