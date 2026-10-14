import { describe, expect, it } from "vitest";
import { buildPageMetadata, SITE_NAME } from "../pageMetadata";

describe("buildPageMetadata", () => {
  const input = {
    title: "画像フォーマット変換",
    description: "テスト用の説明文",
    path: "/convert/",
  };

  it("title と description をそのまま設定する", () => {
    const meta = buildPageMetadata(input);
    expect(meta.title).toBe(input.title);
    expect(meta.description).toBe(input.description);
  });

  it("canonical にルート絶対パスを設定する", () => {
    const meta = buildPageMetadata(input);
    expect(meta.alternates?.canonical).toBe("/convert/");
  });

  it("OGP に website タイプ・サイト名・ロケール・URL・サイト名付きタイトルを設定する", () => {
    const meta = buildPageMetadata(input);
    const expectedTitle = `${input.title} | ${SITE_NAME}`;
    // openGraph / twitter は Metadata 型上でユニオンになるため、
    // 個別のプロパティアクセスを避けて toMatchObject でまとめて検証する
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: SITE_NAME,
      locale: "ja_JP",
      url: "/convert/",
      title: expectedTitle,
      description: input.description,
    });
  });

  it("Twitter カードは summary でサイト名付きタイトルを使う", () => {
    const meta = buildPageMetadata(input);
    const expectedTitle = `${input.title} | ${SITE_NAME}`;
    expect(meta.twitter).toMatchObject({
      card: "summary",
      title: expectedTitle,
      description: input.description,
    });
  });
});
