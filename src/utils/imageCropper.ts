export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  originalFile: File;
  croppedBlob: Blob;
  fileName: string;
  success: boolean;
  error?: string;
}

export class ImageCropper {
  /**
   * 画像をクロップする
   */
  static async cropImage(
    file: File,
    cropArea: CropArea
  ): Promise<CropResult> {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Canvas context is not supported");
      }

      // 画像を読み込み
      const img = await this.loadImage(file);

      // クロップ領域の妥当性をチェック
      if (cropArea.width <= 0 || cropArea.height <= 0) {
        throw new Error("Invalid crop area dimensions");
      }

      if (cropArea.x < 0 || cropArea.y < 0 ||
          cropArea.x + cropArea.width > img.width ||
          cropArea.y + cropArea.height > img.height) {
        // 境界内に調整
        const adjustedCropArea = {
          x: Math.max(0, Math.min(cropArea.x, img.width - 1)),
          y: Math.max(0, Math.min(cropArea.y, img.height - 1)),
          width: Math.min(cropArea.width, img.width - Math.max(0, cropArea.x)),
          height: Math.min(cropArea.height, img.height - Math.max(0, cropArea.y))
        };
        cropArea = adjustedCropArea;
      }

      // クロップ領域のサイズでcanvasを設定
      canvas.width = cropArea.width;
      canvas.height = cropArea.height;

      // 画像をクロップしてcanvasに描画
      ctx.drawImage(
        img,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height
      );

      // canvasからBlobを生成
      const croppedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        }, file.type || "image/png", 0.95);
      });

      const fileName = this.generateCroppedFileName(file.name);

      return {
        originalFile: file,
        croppedBlob,
        fileName,
        success: true,
      };
    } catch (error) {
      return {
        originalFile: file,
        croppedBlob: new Blob(),
        fileName: file.name,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 複数の画像を一括でクロップする
   */
  static async cropImages(
    files: File[],
    cropArea: CropArea,
    onProgress?: (completed: number, total: number) => void
  ): Promise<CropResult[]> {
    const results: CropResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const result = await this.cropImage(files[i], cropArea);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, files.length);
      }
    }

    return results;
  }

  /**
   * 画像ファイルをHTMLImageElementとして読み込む
   */
  private static loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * クロップ後のファイル名を生成
   */
  private static generateCroppedFileName(originalName: string): string {
    const extensionIndex = originalName.lastIndexOf(".");
    if (extensionIndex === -1) {
      return `${originalName}_cropped`;
    }

    const nameWithoutExtension = originalName.slice(0, extensionIndex);
    const extension = originalName.slice(extensionIndex);
    return `${nameWithoutExtension}_cropped${extension}`;
  }

  /**
   * Blobからダウンロード用のURLを生成
   */
  static createDownloadUrl(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  /**
   * ダウンロード用のURLを解放
   */
  static revokeDownloadUrl(url: string): void {
    URL.revokeObjectURL(url);
  }
}
