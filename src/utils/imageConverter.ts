import piexif from "piexifjs";

export interface ConversionOptions {
  format: "jpeg" | "png" | "webp";
  quality: number; // 0-100
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
  preserveExif?: boolean;
}

export interface ConversionResult {
  blob: Blob;
  url: string;
  originalSize: number;
  convertedSize: number;
  filename: string;
  originalFilename: string;
  file: File;
}

/**
 * 画像を指定されたオプションで変換する
 */
export const convertImage = async (
  file: File,
  options: ConversionOptions,
): Promise<ConversionResult> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("選択されたファイルは画像ではありません"));
      return;
    }

    // Exifデータを読み込む（JPEGの場合のみ）
    let exifData: string | null = null;
    const shouldPreserveExif =
      options.preserveExif &&
      (file.type.includes("jpeg") || file.type.includes("jpg")) &&
      options.format === "jpeg";

    const reader = new FileReader();
    reader.onload = (e) => {
      if (shouldPreserveExif) {
        try {
          const imageData = e.target?.result as string;
          exifData = piexif.dump(piexif.load(imageData));
        } catch (error) {
          console.warn("Failed to read EXIF data:", error);
        }
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Canvas context を取得できませんでした"));
            return;
          }

          // サイズ計算
          let { width, height } = img;

          if (options.width || options.height) {
            if (options.maintainAspectRatio) {
              const aspectRatio = width / height;

              if (options.width && options.height) {
                // 両方指定されている場合、アスペクト比を維持して小さい方に合わせる
                const targetRatio = options.width / options.height;
                if (aspectRatio > targetRatio) {
                  width = options.width;
                  height = options.width / aspectRatio;
                } else {
                  height = options.height;
                  width = options.height * aspectRatio;
                }
              } else if (options.width) {
                width = options.width;
                height = options.width / aspectRatio;
              } else if (options.height) {
                height = options.height;
                width = options.height * aspectRatio;
              }
            } else {
              width = options.width || width;
              height = options.height || height;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // 画像を描画
          ctx.drawImage(img, 0, 0, width, height);

          // 変換後の処理を共通化
          const handleBlob = (blob: Blob | null) => {
            if (!blob) {
              reject(
                new Error(
                  `${options.format.toUpperCase()}画像の変換に失敗しました`,
                ),
              );
              return;
            }

            // Exifデータを挿入する処理
            const processBlob = async (finalBlob: Blob) => {
              const url = URL.createObjectURL(finalBlob);
              const originalFilename = file.name;
              const nameWithoutExt =
                originalFilename.substring(
                  0,
                  originalFilename.lastIndexOf("."),
                ) || originalFilename;
              const filename = `${nameWithoutExt}.${options.format}`;

              // ファイルオブジェクトを作成
              const resultFile = new File([finalBlob], filename, {
                type: finalBlob.type,
              });

              resolve({
                blob: finalBlob,
                url,
                originalSize: file.size,
                convertedSize: finalBlob.size,
                filename,
                originalFilename: file.name,
                file: resultFile,
              });
            };

            // ExifデータをBlobに挿入（JPEGのみ）
            if (exifData && options.format === "jpeg") {
              const reader2 = new FileReader();
              reader2.onload = (e2) => {
                try {
                  const dataUrl = e2.target?.result as string;
                  const newDataUrl = piexif.insert(exifData, dataUrl);
                  const base64Data = newDataUrl.split(",")[1];
                  const binaryData = atob(base64Data);
                  const uint8Array = new Uint8Array(binaryData.length);
                  for (let i = 0; i < binaryData.length; i++) {
                    uint8Array[i] = binaryData.charCodeAt(i);
                  }
                  const newBlob = new Blob([uint8Array], { type: blob.type });
                  processBlob(newBlob);
                } catch (error) {
                  console.warn("Failed to insert EXIF data:", error);
                  processBlob(blob);
                }
              };
              reader2.readAsDataURL(blob);
            } else {
              processBlob(blob);
            }
          };

          // 変換
          if (options.format === "png") {
            // PNG専用の品質制御
            convertToPngWithQuality(canvas, options.quality, handleBlob);
          } else {
            // JPEG/WebP用の標準品質制御
            const quality = options.quality / 100;
            const mimeType = `image/${options.format}`;

            canvas.toBlob(handleBlob, mimeType, quality);
          }
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("ファイルの読み込みに失敗しました"));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * 複数の画像を一括変換する
 */
export const convertMultipleImages = async (
  files: File[],
  options: ConversionOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<ConversionResult[]> => {
  const results: ConversionResult[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await convertImage(files[i], options);
      results.push(result);
      onProgress?.(i + 1, files.length);
    } catch (error) {
      console.error(`ファイル ${files[i].name} の変換に失敗:`, error);
      // エラーが発生しても他のファイルの変換を続行
    }
  }

  return results;
};

/**
 * 変換結果をダウンロードする
 */
export const downloadFile = (result: ConversionResult): void => {
  const link = document.createElement("a");
  link.href = result.url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * 複数の変換結果をダウンロードする
 */
export const downloadMultipleFiles = (results: ConversionResult[]): void => {
  results.forEach((result, index) => {
    // 複数ファイルの場合、少し遅延を入れてダウンロード
    setTimeout(() => {
      downloadFile(result);
    }, index * 100);
  });
};

/**
 * ファイルサイズを読みやすい形式でフォーマットする
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

/**
 * 圧縮率を計算する
 */
export const calculateCompressionRatio = (
  originalSize: number,
  convertedSize: number,
): number => {
  return Math.round(((originalSize - convertedSize) / originalSize) * 100);
};

/**
 * PNG形式で品質制御を行い変換する
 */
export const convertToPngWithQuality = (
  canvas: HTMLCanvasElement,
  quality: number,
  callback: (blob: Blob | null) => void,
): void => {
  // PNG品質制御: Canvas APIの標準的なPNG出力を使用
  // 品質値に基づいて出力戦略を変更
  if (quality >= 95) {
    // 高品質: 標準PNG出力
    canvas.toBlob(callback, "image/png");
  } else if (quality >= 70) {
    // 中品質: 少し圧縮
    canvas.toBlob(callback, "image/png", 0.92);
  } else {
    // 低品質: より積極的な圧縮のため、一度JPEGに変換してからPNGに
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) {
      canvas.toBlob(callback, "image/png");
      return;
    }

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    // JPEGで圧縮してから再度Canvasに描画
    canvas.toBlob(
      (jpegBlob) => {
        if (!jpegBlob) {
          canvas.toBlob(callback, "image/png");
          return;
        }

        const img = new Image();
        img.onload = () => {
          tempCtx.drawImage(img, 0, 0);
          tempCanvas.toBlob(callback, "image/png");
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(jpegBlob);
      },
      "image/jpeg",
      quality / 100,
    );
  }
};

// 後方互換性のためのクラス形式のエクスポート（非推奨）
/** @deprecated Use individual functions instead */
export class ImageConverter {
  /** @deprecated Use convertImage function instead */
  static convertImage = convertImage;
  /** @deprecated Use convertMultipleImages function instead */
  static convertMultipleImages = convertMultipleImages;
  /** @deprecated Use downloadFile function instead */
  static downloadFile = downloadFile;
  /** @deprecated Use downloadMultipleFiles function instead */
  static downloadMultipleFiles = downloadMultipleFiles;
  /** @deprecated Use formatFileSize function instead */
  static formatFileSize = formatFileSize;
  /** @deprecated Use calculateCompressionRatio function instead */
  static calculateCompressionRatio = calculateCompressionRatio;
  /** @deprecated Use convertToPngWithQuality function instead */
  static convertToPngWithQuality = convertToPngWithQuality;
}
