/**
 * モザイク / ぼかしレタッチのブラウザ側オーケストレーション。
 * Canvas とのやり取り（getImageData / putImageData / toBlob）を担い、
 * ピクセル演算そのものは redactCore.ts の純粋関数に委譲する
 * （cropGeometry.ts / imageCropper.ts と同じ分離方針）。
 * プレビューと出力の両方が renderRedacted を通るため WYSIWYG が成立する。
 */

import {
  exifWritableFormat,
  insertExifIntoBlob,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "./exifTransfer";
import { appendFileNameSuffix } from "./fileName";
import { type CropResult, renderOrientedImage } from "./imageCropper";
import {
  applyRedactionsToImageData,
  clampRegionToImage,
  type RedactRegion,
  type RedactState,
  type RedactStyle,
  resolveRegionsForIndex,
} from "./redactCore";

/** 出力ファイル名のサフィックス */
const REDACTED_SUFFIX = "_redacted";

/**
 * ファイルを DataURL に変換する（EXIF 読み取り用）
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
 * キャンバス上のレタッチ領域へモザイク / ぼかし / 塗りつぶしを焼き込む（in-place）。
 * 全面ではなく領域ごとに getImageData / putImageData することで、
 * 大きな画像でも処理量を領域面積に比例させる。
 * プレビュー（RedactSelector）と出力（redactImage）の共通経路。
 */
export const renderRedacted = (
  canvas: HTMLCanvasElement,
  regions: readonly RedactRegion[],
  style: RedactStyle,
): void => {
  if (regions.length === 0) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is not supported");
  }
  for (const region of regions) {
    const area = clampRegionToImage(region.area, canvas.width, canvas.height);
    if (!area) {
      continue;
    }
    const imageData = ctx.getImageData(area.x, area.y, area.width, area.height);
    // 切り出した ImageData 内では領域が原点に移る
    applyRedactionsToImageData(
      imageData,
      [
        {
          id: region.id,
          area: { x: 0, y: 0, width: area.width, height: area.height },
        },
      ],
      style,
    );
    ctx.putImageData(imageData, area.x, area.y);
  }
};

/**
 * 1 ファイルへレタッチを適用する。
 * EXIF Orientation 補正の焼き込み → レタッチ焼き込み → 元形式でエンコード →
 * EXIF 挿入（Orientation 正規化込み）の流れは cropImage と同型。
 * 領域が空の場合もそのまま再エンコードして結果一覧に並べる（crop の「領域 null = 全体」と同じ一貫性）。
 */
export const redactImage = async (
  file: File,
  regions: readonly RedactRegion[],
  style: RedactStyle,
  preserveExif = false,
  quality = 0.95,
): Promise<CropResult> => {
  try {
    // Exif データを読み込む（JPEG / PNG / WebP のソースに対応）
    const exifFormat = exifWritableFormat(file.type);
    let exifTiff: Uint8Array | null = null;
    if (preserveExif && exifFormat) {
      const dataUrl = await fileToDataUrl(file);
      exifTiff = await readExifTiffFromDataUrl(dataUrl, file.type);
    }

    // EXIF Orientation 補正を焼き込んだキャンバスへレタッチを適用する
    const canvas = await renderOrientedImage(file);
    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error("Invalid image dimensions");
    }
    renderRedacted(canvas, regions, style);

    // 元と同じ形式でエンコードする（canvas.toBlob 非対応形式は PNG フォールバック）
    let redactedBlob = await new Promise<Blob>((resolve, reject) => {
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

    // 向きは焼き込み済みのため Orientation を 1 に正規化し、寸法タグを出力へ揃えて挿入する。
    // EXIF 埋め込みサムネイル（IFD1）にはレタッチ前の縮小画像が残るため必ず除去する
    // （除去を保証できない場合は例外になり、EXIF 引き継ぎ自体を中止する = プライバシー優先）
    if (exifTiff && exifFormat) {
      try {
        const normalized = await normalizeExifForBakedImage(
          exifTiff,
          canvas.width,
          canvas.height,
          { stripThumbnail: true },
        );
        redactedBlob = await insertExifIntoBlob(
          redactedBlob,
          normalized,
          exifFormat,
          canvas.width,
          canvas.height,
        );
      } catch (error) {
        console.warn("Failed to insert EXIF data:", error);
      }
    }

    const fileName = appendFileNameSuffix(file.name, REDACTED_SUFFIX);
    const redactedFile = new File([redactedBlob], fileName, {
      type: file.type,
    });

    return {
      originalFile: file,
      croppedBlob: redactedBlob,
      fileName,
      success: true,
      croppedFile: redactedFile,
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
 * 複数の画像へ一括でレタッチを適用する。
 * 領域は state（画像インデックス → 領域リスト）から解決する（未設定は無加工で再エンコード）。
 */
export const redactImages = async (
  files: File[],
  state: RedactState,
  style: RedactStyle,
  onProgress?: (completed: number, total: number) => void,
  preserveExif = false,
): Promise<CropResult[]> => {
  const results: CropResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const regions = resolveRegionsForIndex(i, state);
    const result = await redactImage(files[i], regions, style, preserveExif);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }

  return results;
};
