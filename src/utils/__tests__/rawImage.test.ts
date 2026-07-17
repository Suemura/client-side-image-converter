import { describe, expect, it } from "vitest";
import { rawImageDataToRgba } from "../rawImage";

describe("rawImageDataToRgba", () => {
  it("RGB 8bit をアルファ 255 補完で RGBA 化する", () => {
    const result = rawImageDataToRgba({
      data: new Uint8Array([10, 20, 30, 40, 50, 60]),
      width: 2,
      height: 1,
      colors: 3,
      bits: 8,
    });
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(Array.from(result.data)).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
  });

  it("RGBA 8bit はそのまま透過を保持する", () => {
    const result = rawImageDataToRgba({
      data: new Uint8Array([10, 20, 30, 128]),
      width: 1,
      height: 1,
      colors: 4,
      bits: 8,
    });
    expect(Array.from(result.data)).toEqual([10, 20, 30, 128]);
  });

  it("RGB 16bit は上位 8bit へ縮退する", () => {
    // 0xff00 -> 0xff, 0x8000 -> 0x80, 0x00ff -> 0x00
    const result = rawImageDataToRgba({
      data: new Uint16Array([0xff00, 0x8000, 0x00ff]),
      width: 1,
      height: 1,
      colors: 3,
      bits: 16,
    });
    expect(Array.from(result.data)).toEqual([0xff, 0x80, 0x00, 255]);
  });

  it("RGBA 16bit はアルファも縮退する", () => {
    const result = rawImageDataToRgba({
      data: new Uint16Array([0xffff, 0x0000, 0x1234, 0x8080]),
      width: 1,
      height: 1,
      colors: 4,
      bits: 16,
    });
    expect(Array.from(result.data)).toEqual([0xff, 0x00, 0x12, 0x80]);
  });

  it("ImageData にそのまま渡せる Uint8ClampedArray を返す", () => {
    const result = rawImageDataToRgba({
      data: new Uint8Array([1, 2, 3]),
      width: 1,
      height: 1,
      colors: 3,
      bits: 8,
    });
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.data.length).toBe(4);
  });

  it("非対応のチャンネル数は例外を投げる", () => {
    expect(() =>
      rawImageDataToRgba({
        data: new Uint8Array([1, 2]),
        width: 1,
        height: 1,
        colors: 2,
        bits: 8,
      }),
    ).toThrow(/チャンネル数/);
  });

  it("非対応のビット深度は例外を投げる", () => {
    expect(() =>
      rawImageDataToRgba({
        data: new Uint8Array([1, 2, 3]),
        width: 1,
        height: 1,
        colors: 3,
        bits: 12,
      }),
    ).toThrow(/ビット深度/);
  });

  it("データ長が寸法と一致しない場合は例外を投げる", () => {
    expect(() =>
      rawImageDataToRgba({
        data: new Uint8Array([1, 2, 3]),
        width: 2,
        height: 1,
        colors: 3,
        bits: 8,
      }),
    ).toThrow(/データ長/);
  });

  it("不正な寸法は例外を投げる", () => {
    expect(() =>
      rawImageDataToRgba({
        data: new Uint8Array(0),
        width: 0,
        height: 1,
        colors: 3,
        bits: 8,
      }),
    ).toThrow(/寸法/);
    expect(() =>
      rawImageDataToRgba({
        data: new Uint8Array(0),
        width: 1.5,
        height: 1,
        colors: 3,
        bits: 8,
      }),
    ).toThrow(/寸法/);
  });
});
