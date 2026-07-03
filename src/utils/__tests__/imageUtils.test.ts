import { describe, expect, it } from "vitest";
import { base64ToUint8Array, dataUrlToBlob } from "../imageUtils";

describe("base64ToUint8Array", () => {
  it("Base64 文字列をバイト配列に変換する", () => {
    const base64 = btoa("hello");
    const result = base64ToUint8Array(base64);
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
  });

  it("空文字列は空の配列を返す", () => {
    expect(base64ToUint8Array("").length).toBe(0);
  });

  it("バイナリデータも正しく変換する", () => {
    // 0x00, 0xFF, 0x80 を含むバイナリ
    const bytes = String.fromCharCode(0, 255, 128);
    const result = base64ToUint8Array(btoa(bytes));
    expect(Array.from(result)).toEqual([0, 255, 128]);
  });
});

describe("dataUrlToBlob", () => {
  it("DataURL から指定した MIME タイプの Blob を作成する", async () => {
    const dataUrl = `data:image/png;base64,${btoa("fake-image-data")}`;
    const blob = dataUrlToBlob(dataUrl, "image/png");

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe("fake-image-data".length);

    const text = await blob.text();
    expect(text).toBe("fake-image-data");
  });
});
