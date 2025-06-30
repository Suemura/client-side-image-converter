// ファイルパス: /Users/suemura/Documents/GitHub/web-image-converter/src/utils/imageConverter.ts

import JSZip from "jszip";

export interface ConversionOptions {
  format: "jpeg" | "png" | "webp";
  quality: number; // 0-100
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
}

export interface ConversionResult {
  blob: Blob;
  url: string;
  originalSize: number;
  convertedSize: number;
  filename: string;
}

export class ImageConverter {
  static async convertImage(
    file: File,
    options: ConversionOptions,
  ): Promise<ConversionResult> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("選択されたファイルは画像ではありません"));
        return;
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

          // 変換
          const quality = options.quality / 100;
          const mimeType = `image/${options.format}`;

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("画像の変換に失敗しました"));
                return;
              }

              const url = URL.createObjectURL(blob);
              const originalFilename = file.name;
              const nameWithoutExt =
                originalFilename.substring(
                  0,
                  originalFilename.lastIndexOf("."),
                ) || originalFilename;
              const filename = `${nameWithoutExt}.${options.format}`;

              resolve({
                blob,
                url,
                originalSize: file.size,
                convertedSize: blob.size,
                filename,
              });
            },
            mimeType,
            quality,
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      img.src = URL.createObjectURL(file);
    });
  }

  static async convertMultipleImages(
    files: File[],
    options: ConversionOptions,
    onProgress?: (current: number, total: number) => void,
  ): Promise<ConversionResult[]> {
    const results: ConversionResult[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const result = await ImageConverter.convertImage(files[i], options);
        results.push(result);
        onProgress?.(i + 1, files.length);
      } catch (error) {
        console.error(`ファイル ${files[i].name} の変換に失敗:`, error);
        // エラーが発生しても他のファイルの変換を続行
      }
    }

    return results;
  }

  static downloadFile(result: ConversionResult): void {
    const link = document.createElement("a");
    link.href = result.url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  static downloadMultipleFiles(results: ConversionResult[]): void {
    results.forEach((result, index) => {
      // 複数ファイルの場合、少し遅延を入れてダウンロード
      setTimeout(() => {
        ImageConverter.downloadFile(result);
      }, index * 100);
    });
  }

  static async downloadAsZip(results: ConversionResult[]): Promise<void> {
    if (results.length === 0) return;

    try {
      const zip = new JSZip();

      // ファイル名の重複を避けるためのカウンター
      const fileNameCounts = new Map<string, number>();

      for (const result of results) {
        let filename = result.filename;

        // 重複ファイル名の処理
        if (fileNameCounts.has(filename)) {
          const count = (fileNameCounts.get(filename) || 0) + 1;
          fileNameCounts.set(filename, count);

          const nameWithoutExt =
            filename.substring(0, filename.lastIndexOf(".")) || filename;
          const extension = filename.substring(filename.lastIndexOf(".")) || "";
          filename = `${nameWithoutExt}_${count}${extension}`;
        } else {
          fileNameCounts.set(filename, 1);
        }

        // Blobをzipに追加
        zip.file(filename, result.blob);
      }

      // Zipファイルを生成
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      // 現在の日時を使用してZipファイル名を生成
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/:/g, "-");
      const zipFilename = `converted_images_${timestamp}.zip`;

      // Zipファイルをダウンロード
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // URLを解放
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
      }, 1000);
    } catch (error) {
      console.error("Zipファイルの作成に失敗しました:", error);
      throw new Error("Zipファイルの作成に失敗しました");
    }
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  static calculateCompressionRatio(
    originalSize: number,
    convertedSize: number,
  ): number {
    return Math.round(((originalSize - convertedSize) / originalSize) * 100);
  }
}
