/**
 * JPEG XL（JXL）のプレビュー用再デコード
 *
 * Chrome / Firefox は `<img>` で JXL を表示できないため、結果一覧・比較モーダルの
 * プレビューでは @jsquash/jxl の WASM デコーダーで一度デコードし、Canvas 経由で
 * PNG の Blob URL に変換して表示する（実エンコード結果をデコードして見せるため WYSIWYG）。
 * ネイティブ対応ブラウザでも常に再デコードし、全ブラウザで挙動を一様にする。
 */

/** JXL Blob をデコードし、プレビュー表示用の PNG Blob URL を生成する */
export const createJxlPreviewUrl = async (blob: Blob): Promise<string> => {
  // 変換時（encode）とは独立にロードされるが、どちらも動的 import のため初期バンドルへは影響しない
  const { default: decode } = await import("@jsquash/jxl/decode.js");
  const imageData = await decode(await blob.arrayBuffer());

  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context を取得できませんでした");
  }
  ctx.putImageData(imageData, 0, 0);

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error("プレビュー画像の生成に失敗しました"));
      }
    }, "image/png");
  });
  return URL.createObjectURL(pngBlob);
};
