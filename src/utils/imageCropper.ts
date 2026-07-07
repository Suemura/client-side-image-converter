import {
  type CropArea,
  type CropTransform,
  IDENTITY_TRANSFORM,
  orientedSize,
} from "./cropGeometry";
import {
  exifWritableFormat,
  insertExifIntoBlob,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "./exifTransfer";
import {
  buildCanvasFilter,
  IDENTITY_ADJUSTMENTS,
  type ImageAdjustments,
} from "./imageAdjustments";

// 既存の import 経路（`from "../utils/imageCropper"`）を維持するため型を再エクスポートする
export type { CropArea, CropTransform } from "./cropGeometry";
export type { ImageAdjustments } from "./imageAdjustments";

export interface CropResult {
  originalFile: File;
  croppedBlob: Blob;
  fileName: string;
  success: boolean;
  error?: string;
  croppedFile?: File;
}

/** 1 ファイル分のトリミング指示（領域は自然座標。null は画像全体） */
export interface CropJob {
  area: CropArea | null;
  transform: CropTransform;
  adjustments: ImageAdjustments;
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
 * 画像ファイルをHTMLImageElementとして読み込む。
 * 読み込み完了・失敗のいずれでも ObjectURL を revoke してリークを防ぐ
 * （デコード済みの HTMLImageElement は revoke 後もそのまま描画に使える）。
 */
const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    img.src = objectUrl;
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
 * EXIF Orientation を補正しつつ画像をデコードする。
 * createImageBitmap（imageOrientation: "from-image"）で向きをピクセルに焼き込み、
 * 非対応環境では <img>（ブラウザ既定で EXIF 向きを反映）にフォールバックする。
 */
const decodeOrientedSource = async (
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number }> => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // フォールバックへ
    }
  }
  const img = await loadImage(file);
  return { source: img, width: img.naturalWidth, height: img.naturalHeight };
};

/**
 * EXIF Orientation 補正済みの画像に回転・反転・色調/フィルタ調整を適用したキャンバスを返す。
 * プレビュー生成（createOrientedPreviewUrl）と出力（cropImage）で共用し、WYSIWYG を担保する。
 * 色調調整は drawImage の前に `ctx.filter` を設定して 1 回の描画でピクセルへ焼き込む
 * （回転/反転と同じ経路に乗せるため、両者が同時に正しく反映される）。
 */
export const renderOrientedImage = async (
  file: File,
  transform: CropTransform = IDENTITY_TRANSFORM,
  adjustments: ImageAdjustments = IDENTITY_ADJUSTMENTS,
): Promise<HTMLCanvasElement> => {
  const { source, width, height } = await decodeOrientedSource(file);
  const { rotation, flipHorizontal, flipVertical } = transform;
  const { width: outWidth, height: outHeight } = orientedSize(
    width,
    height,
    rotation,
  );

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is not supported");
  }

  // 色調・フィルタ調整を drawImage の前に設定する（無調整時は "none"）
  ctx.filter = buildCanvasFilter(adjustments);

  // 出力中心を基準に回転→反転を適用し、元画像を中心合わせで描画する
  ctx.translate(outWidth / 2, outHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);

  // ImageBitmap はメモリ解放のため明示的に close する
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }

  return canvas;
};

/**
 * EXIF 補正 + 回転/反転 + 色調/フィルタ調整を適用したプレビュー用 ObjectURL を生成する。
 * 呼び出し側で revokeObjectURL によるクリーンアップを行うこと。
 */
export const createOrientedPreviewUrl = async (
  file: File,
  transform: CropTransform = IDENTITY_TRANSFORM,
  adjustments: ImageAdjustments = IDENTITY_ADJUSTMENTS,
): Promise<string> => {
  const canvas = await renderOrientedImage(file, transform, adjustments);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) {
        resolve(b);
      } else {
        reject(new Error("Failed to create preview blob"));
      }
    });
  });
  return URL.createObjectURL(blob);
};

/**
 * トリミング領域を画像境界内へ収める（出力用。最小サイズ制約は課さない）。
 * 無効な領域は画像全体へフォールバックする。
 */
const clampAreaToImage = (
  area: CropArea,
  imageWidth: number,
  imageHeight: number,
): CropArea => {
  const x = Math.max(0, Math.min(Math.round(area.x), imageWidth));
  const y = Math.max(0, Math.min(Math.round(area.y), imageHeight));
  let width = Math.round(area.width);
  let height = Math.round(area.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { x: 0, y: 0, width: imageWidth, height: imageHeight };
  }

  if (x + width > imageWidth) {
    width = imageWidth - x;
  }
  if (y + height > imageHeight) {
    height = imageHeight - y;
  }
  return { x, y, width, height };
};

/**
 * 画像をトリミングする。
 * EXIF Orientation 補正・回転/反転・色調/フィルタ調整をピクセルへ焼き込んだ上で、
 * 指定領域（自然座標）を切り出す。
 */
export const cropImage = async (
  file: File,
  cropArea: CropArea | null,
  transform: CropTransform = IDENTITY_TRANSFORM,
  adjustments: ImageAdjustments = IDENTITY_ADJUSTMENTS,
  preserveExif = false,
  quality = 0.95,
): Promise<CropResult> => {
  try {
    // Exif データを読み込む（JPEG / PNG / WebP のソースに対応）
    const exifFormat = exifWritableFormat(file.type);
    let exifTiff: Uint8Array | null = null;
    if (preserveExif && exifFormat) {
      const dataUrl = await fileToDataUrl(file);
      exifTiff = readExifTiffFromDataUrl(dataUrl, file.type);
    }

    // EXIF Orientation 補正 + 回転/反転 + 色調/フィルタ調整を焼き込んだキャンバス
    const orientedCanvas = await renderOrientedImage(
      file,
      transform,
      adjustments,
    );
    const imageWidth = orientedCanvas.width;
    const imageHeight = orientedCanvas.height;

    if (imageWidth <= 0 || imageHeight <= 0) {
      throw new Error("Invalid image dimensions");
    }

    // トリミング領域を境界内へ収める（未指定は画像全体）
    const requested = cropArea ?? {
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
    };
    const area = clampAreaToImage(requested, imageWidth, imageHeight);

    if (area.width <= 0 || area.height <= 0) {
      throw new Error(
        `Invalid crop area: ${JSON.stringify(area)}, imageSize=${imageWidth}x${imageHeight}`,
      );
    }

    // トリミング領域のサイズでcanvasを設定
    const canvas = document.createElement("canvas");
    canvas.width = area.width;
    canvas.height = area.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context is not supported");
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      orientedCanvas,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      area.width,
      area.height,
    );

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
        quality,
      );
    });

    // Exif データを出力（入力と同じ形式：JPEG / PNG / WebP）に挿入する。
    // 向き・寸法は既にピクセルへ焼き込んでいるため、Orientation タグを 1 に正規化しつつ
    // 実ピクセル寸法タグを出力寸法へ揃えて、二重回転やメタデータの寸法不整合を防ぐ。
    if (exifTiff && exifFormat) {
      try {
        const normalized = normalizeExifForBakedImage(
          exifTiff,
          canvas.width,
          canvas.height,
        );
        croppedBlob = await insertExifIntoBlob(
          croppedBlob,
          normalized,
          exifFormat,
          canvas.width,
          canvas.height,
        );
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
 * 複数の画像を一括でトリミングする。
 * jobs は files と同じインデックスで領域・変換を指定する（未指定インデックスは画像全体・無変換）。
 */
export const cropImages = async (
  files: File[],
  jobs: CropJob[],
  onProgress?: (completed: number, total: number) => void,
  preserveExif = false,
  quality = 0.95,
): Promise<CropResult[]> => {
  const results: CropResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const job = jobs[i] ?? {
      area: null,
      transform: IDENTITY_TRANSFORM,
      adjustments: IDENTITY_ADJUSTMENTS,
    };
    const result = await cropImage(
      files[i],
      job.area,
      job.transform,
      job.adjustments,
      preserveExif,
      quality,
    );
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
