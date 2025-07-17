import piexif from "piexifjs";

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
  croppedFile?: File;
}

export class ImageCropper {
  /**
   * 画像をトリミングする
   */
  static async cropImage(file: File, cropArea: CropArea, preserveExif = false): Promise<CropResult> {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Canvas context is not supported");
      }

      // Exifデータを読み込む（JPEGの場合のみ）
      let exifData: string | null = null;
      if (preserveExif && (file.type.includes('jpeg') || file.type.includes('jpg'))) {
        try {
          const dataUrl = await this.fileToDataUrl(file);
          exifData = piexif.dump(piexif.load(dataUrl));
        } catch (error) {
          console.warn('Failed to read EXIF data:', error);
        }
      }

      // 画像を読み込み
      const img = await this.loadImage(file);

      // トリミング領域の妥当性をチェック
      if (cropArea.width <= 0 || cropArea.height <= 0) {
        throw new Error("Invalid crop area dimensions");
      }

      if (
        cropArea.x < 0 ||
        cropArea.y < 0 ||
        cropArea.x + cropArea.width > img.width ||
        cropArea.y + cropArea.height > img.height
      ) {
        // 境界内に調整
        const adjustedCropArea = {
          x: Math.max(0, Math.min(cropArea.x, img.width - 1)),
          y: Math.max(0, Math.min(cropArea.y, img.height - 1)),
          width: Math.min(cropArea.width, img.width - Math.max(0, cropArea.x)),
          height: Math.min(
            cropArea.height,
            img.height - Math.max(0, cropArea.y),
          ),
        };

        // 調整後も有効な領域であることを確認
        if (adjustedCropArea.width <= 0 || adjustedCropArea.height <= 0) {
          // 全体画像を使用
          adjustedCropArea.x = 0;
          adjustedCropArea.y = 0;
          adjustedCropArea.width = img.width;
          adjustedCropArea.height = img.height;
        }
        cropArea = adjustedCropArea;
      }

      // 最終的な検証
      // NaNや無限大の値をチェック
      if (
        !Number.isFinite(cropArea.x) ||
        !Number.isFinite(cropArea.y) ||
        !Number.isFinite(cropArea.width) ||
        !Number.isFinite(cropArea.height)
      ) {
        throw new Error(
          `Non-finite values in crop area: x=${cropArea.x}, y=${cropArea.y}, width=${cropArea.width}, height=${cropArea.height}`,
        );
      }

      if (
        cropArea.width <= 0 ||
        cropArea.height <= 0 ||
        cropArea.x < 0 ||
        cropArea.y < 0 ||
        cropArea.x >= img.width ||
        cropArea.y >= img.height
      ) {
        throw new Error(
          `Invalid final crop area: x=${cropArea.x}, y=${cropArea.y}, width=${cropArea.width}, height=${cropArea.height}, imageSize=${img.width}x${img.height}`,
        );
      }

      // トリミング領域が画像を超えていないかチェック
      if (
        cropArea.x + cropArea.width > img.width ||
        cropArea.y + cropArea.height > img.height
      ) {
        console.warn("Crop area extends beyond image, adjusting...");
        cropArea = {
          x: cropArea.x,
          y: cropArea.y,
          width: Math.min(cropArea.width, img.width - cropArea.x),
          height: Math.min(cropArea.height, img.height - cropArea.y),
        };
        console.log("Adjusted crop area:", cropArea);
      } // トリミング領域のサイズでcanvasを設定
      canvas.width = cropArea.width;
      canvas.height = cropArea.height;

      // 画像をトリミングしてcanvasに描画
      // 描画前にcanvasをクリア
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        ctx.drawImage(
          img,
          cropArea.x,
          cropArea.y,
          cropArea.width,
          cropArea.height,
          0,
          0,
          cropArea.width,
          cropArea.height,
        );
      } catch (drawError) {
        console.error("Error drawing image:", drawError);
        throw new Error(`Failed to draw image: ${drawError}`);
      }

      // canvasからBlobを生成
      let croppedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Failed to create blob"));
            }
          },
          file.type || "image/png",
          0.95,
        );
      });

      // Exifデータを挿入（JPEGのみ）
      if (exifData && (file.type.includes('jpeg') || file.type.includes('jpg'))) {
        try {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(croppedBlob);
          });
          
          const newDataUrl = piexif.insert(exifData, dataUrl);
          const base64Data = newDataUrl.split(',')[1];
          const binaryData = atob(base64Data);
          const uint8Array = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            uint8Array[i] = binaryData.charCodeAt(i);
          }
          croppedBlob = new Blob([uint8Array], { type: file.type });
        } catch (error) {
          console.warn('Failed to insert EXIF data:', error);
        }
      }

      const fileName = this.generateCroppedFileName(file.name);

      // ファイルオブジェクトを作成
      const croppedFile = new File([croppedBlob], fileName, {
        type: file.type,
      });

      return {
        originalFile: file,
        croppedBlob,
        fileName,
        success: true,
        croppedFile,
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
   * 複数の画像を一括でトリミングする
   */
  static async cropImages(
    files: File[],
    cropArea: CropArea,
    onProgress?: (completed: number, total: number) => void,
    preserveExif = false,
  ): Promise<CropResult[]> {
    const results: CropResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const result = await this.cropImage(files[i], cropArea, preserveExif);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, files.length);
      }
    }

    return results;
  }

  /**
   * ファイルをDataURLに変換
   */
  private static fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
   * トリミング後のファイル名を生成
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
