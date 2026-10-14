import { describe, expect, it } from "vitest";
import {
  base64ToUint8Array,
  dataUrlToBlob,
  uint8ArrayToBase64,
} from "../imageUtils";

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

describe("uint8ArrayToBase64", () => {
  it("バイト配列を Base64 文字列に変換する（base64ToUint8Array の逆変換）", () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    expect(uint8ArrayToBase64(bytes)).toBe(btoa("hello"));
  });

  it("0x00 / 0xFF を含むバイナリも正しく変換する", () => {
    const bytes = new Uint8Array([0, 255, 128]);
    const base64 = uint8ArrayToBase64(bytes);
    // 往復で元に戻る
    expect(Array.from(base64ToUint8Array(base64))).toEqual([0, 255, 128]);
  });

  it("空配列は空文字列を返す", () => {
    expect(uint8ArrayToBase64(new Uint8Array([]))).toBe("");
  });

  it("チャンク境界（32KB）をまたぐ大きな配列も正しく往復変換できる", () => {
    // 0x8000 チャンク処理の境界を跨ぐサイズで検証する
    const size = 0x8000 * 2 + 123;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      bytes[i] = i % 256;
    }
    const roundTripped = base64ToUint8Array(uint8ArrayToBase64(bytes));
    expect(roundTripped.length).toBe(size);
    expect(Array.from(roundTripped)).toEqual(Array.from(bytes));
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
