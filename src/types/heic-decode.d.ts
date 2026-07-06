declare module "heic-decode" {
  /** デコード結果（RGBA の生ピクセルデータ。ImageData にそのまま渡せる型にする） */
  interface HeicDecodeResult {
    width: number;
    height: number;
    data: Uint8ClampedArray<ArrayBuffer>;
  }

  /** HEIC バイナリの先頭画像をデコードする */
  function decode(options: { buffer: Uint8Array }): Promise<HeicDecodeResult>;

  export default decode;
}
