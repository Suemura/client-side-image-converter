/**
 * 画像処理関連のユーティリティ関数群
 */

/**
 * ファイルから32x32サイズのサムネイルを生成する
 * @param file - サムネイルを生成するファイル
 * @returns サムネイルのDataURL、またはnull
 */
export const generateThumbnail = (file: File): Promise<string | null> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // サムネイルのサイズを設定（32x32）
        const size = 32;
        canvas.width = size;
        canvas.height = size;

        if (ctx) {
          // 画像を正方形にトリミングして描画
          const minDimension = Math.min(img.width, img.height);
          const sx = (img.width - minDimension) / 2;
          const sy = (img.height - minDimension) / 2;

          ctx.drawImage(
            img,
            sx,
            sy,
            minDimension,
            minDimension,
            0,
            0,
            size,
            size,
          );

          const thumbnailUrl = canvas.toDataURL("image/png");
          resolve(thumbnailUrl);
        } else {
          resolve(null);
        }
      };

      img.onerror = () => {
        resolve(null);
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      resolve(null);
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Canvas contextを安全に取得する
 * @param canvas - Canvas要素
 * @returns Canvas context または null
 */
export const getCanvasContext = (
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D | null => {
  return canvas.getContext("2d");
};

/**
 * FileReaderを使用してファイルをDataURLに変換する
 * @param file - 変換するファイル
 * @returns DataURL文字列
 */
export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });
};

/**
 * 画像ファイルをHTMLImageElementに変換する
 * @param file - 変換するファイル
 * @returns HTMLImageElement
 */
export const fileToImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

/**
 * Base64文字列を効率的にUint8Arrayに変換する
 * @param base64 - Base64文字列
 * @returns Uint8Array
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const uint8Array = new Uint8Array(length);

  // 効率的な文字列からUint8Arrayへの変換
  for (let i = 0; i < length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }

  return uint8Array;
};

/**
 * DataURLからBlobを作成する
 * @param dataUrl - DataURL文字列
 * @param mimeType - MIMEタイプ
 * @returns Blob
 */
export const dataUrlToBlob = (dataUrl: string, mimeType: string): Blob => {
  const base64Data = dataUrl.split(",")[1];
  const uint8Array = base64ToUint8Array(base64Data);
  return new Blob([uint8Array], { type: mimeType });
};
