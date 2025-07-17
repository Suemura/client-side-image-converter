import piexif from "piexifjs";
import { dataUrlToBlob } from "./imageUtils";

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

/**
 * ファイルをDataURLに変換
 */
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * 画像ファイルをHTMLImageElementとして読み込む
 */
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

/**
 * トリミング後のファイル名を生成
 */
const generateCroppedFileName = (originalName: string): string => {
  const extensionIndex = originalName.lastIndexOf(".");
  if (extensionIndex === -1) {
    return `${originalName}_cropped`;
  }

  const nameWithoutExtension = originalName.slice(0, extensionIndex);
  const extension = originalName.slice(extensionIndex);
  return `${nameWithoutExtension}_cropped${extension}`;
};

/**
 * 画像をトリミングする
 */
export const cropImage = async (
  file: File,
  cropArea: CropArea,
  preserveExif = false,
): Promise<CropResult> => {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas context is not supported");
    }

    // Exifデータを読み込む（JPEGの場合のみ）
    let exifData: string | null = null;
    if (
      preserveExif &&
      (file.type.includes("jpeg") || file.type.includes("jpg"))
    ) {
      try {
        const dataUrl = await fileToDataUrl(file);
        exifData = piexif.dump(piexif.load(dataUrl));
      } catch (error) {
        console.warn("Failed to read EXIF data:", error);
      }
    }

    // 画像を読み込み
    const img = await loadImage(file);

    // ローカル変数を使用してパラメータの再代入を避ける
    let adjustedCropArea = cropArea;

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
      const newCropArea = {
        x: Math.max(0, Math.min(cropArea.x, img.width - 1)),
        y: Math.max(0, Math.min(cropArea.y, img.height - 1)),
        width: Math.min(cropArea.width, img.width - Math.max(0, cropArea.x)),
        height: Math.min(cropArea.height, img.height - Math.max(0, cropArea.y)),
      };

      // 調整後も有効な領域であることを確認
      if (newCropArea.width <= 0 || newCropArea.height <= 0) {
        // 全体画像を使用
        newCropArea.x = 0;
        newCropArea.y = 0;
        newCropArea.width = img.width;
        newCropArea.height = img.height;
      }
      adjustedCropArea = newCropArea;
    }

    // 最終的な検証
    // NaNや無限大の値をチェック
    if (
      !Number.isFinite(adjustedCropArea.x) ||
      !Number.isFinite(adjustedCropArea.y) ||
      !Number.isFinite(adjustedCropArea.width) ||
      !Number.isFinite(adjustedCropArea.height)
    ) {
      throw new Error(
        `Non-finite values in crop area: x=${adjustedCropArea.x}, y=${adjustedCropArea.y}, width=${adjustedCropArea.width}, height=${adjustedCropArea.height}`,
      );
    }

    if (
      adjustedCropArea.width <= 0 ||
      adjustedCropArea.height <= 0 ||
      adjustedCropArea.x < 0 ||
      adjustedCropArea.y < 0 ||
      adjustedCropArea.x >= img.width ||
      adjustedCropArea.y >= img.height
    ) {
      throw new Error(
        `Invalid final crop area: x=${adjustedCropArea.x}, y=${adjustedCropArea.y}, width=${adjustedCropArea.width}, height=${adjustedCropArea.height}, imageSize=${img.width}x${img.height}`,
      );
    }

    // トリミング領域が画像を超えていないかチェック
    if (
      adjustedCropArea.x + adjustedCropArea.width > img.width ||
      adjustedCropArea.y + adjustedCropArea.height > img.height
    ) {
      console.warn("Crop area extends beyond image, adjusting...");
      adjustedCropArea = {
        x: adjustedCropArea.x,
        y: adjustedCropArea.y,
        width: Math.min(adjustedCropArea.width, img.width - adjustedCropArea.x),
        height: Math.min(
          adjustedCropArea.height,
          img.height - adjustedCropArea.y,
        ),
      };
      console.log("Adjusted crop area:", adjustedCropArea);
    }

    // トリミング領域のサイズでcanvasを設定
    canvas.width = adjustedCropArea.width;
    canvas.height = adjustedCropArea.height;

    // 画像をトリミングしてcanvasに描画
    // 描画前にcanvasをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      ctx.drawImage(
        img,
        adjustedCropArea.x,
        adjustedCropArea.y,
        adjustedCropArea.width,
        adjustedCropArea.height,
        0,
        0,
        adjustedCropArea.width,
        adjustedCropArea.height,
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
    if (exifData && (file.type.includes("jpeg") || file.type.includes("jpg"))) {
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(croppedBlob);
        });

        const newDataUrl = piexif.insert(exifData, dataUrl);
        croppedBlob = dataUrlToBlob(newDataUrl, file.type);
      } catch (error) {
        console.warn("Failed to insert EXIF data:", error);
      }
    }

    const fileName = generateCroppedFileName(file.name);

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
};

/**
 * 複数の画像を一括でトリミングする
 */
export const cropImages = async (
  files: File[],
  cropArea: CropArea,
  onProgress?: (completed: number, total: number) => void,
  preserveExif = false,
): Promise<CropResult[]> => {
  const results: CropResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await cropImage(files[i], cropArea, preserveExif);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }

  return results;
};

/**
 * Blobからダウンロード用のURLを生成
 */
export const createDownloadUrl = (blob: Blob): string => {
  return URL.createObjectURL(blob);
};

/**
 * ダウンロード用のURLを解放
 */
export const revokeDownloadUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};
