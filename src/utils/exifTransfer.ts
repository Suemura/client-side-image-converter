/**
 * EXIF をソース画像から出力 Blob へ引き継ぐためのブラウザ側ヘルパー群
 *
 * 純粋なバイナリ操作は exifBinary.ts に、piexifjs / FileReader / Blob を伴う
 * 「読み取り→書き込み」の橋渡しをここに集約する（変換・トリミングの両経路で共用）。
 */

import piexif from "piexifjs";
import {
  extractPngExif,
  extractWebpExif,
  insertPngExif,
  insertWebpExif,
  piexifDumpToTiff,
  tiffToPiexifDump,
} from "./exifBinary";
import { base64ToUint8Array, dataUrlToBlob } from "./imageUtils";

/** EXIF を書き込める出力形式 */
export type ExifWritableFormat = "jpeg" | "png" | "webp";

/**
 * file.type から EXIF を書き込める形式を判定する（非対応形式は null）。
 * AVIF は Canvas ネイティブ非対応かつ本ツールではメタデータ書き込み未対応のため除外する
 */
export const exifWritableFormat = (
  fileType: string,
): ExifWritableFormat | null => {
  if (fileType.includes("jpeg") || fileType.includes("jpg")) {
    return "jpeg";
  }
  if (fileType.includes("png")) {
    return "png";
  }
  if (fileType.includes("webp")) {
    return "webp";
  }
  return null;
};

/**
 * ソース画像の DataURL から EXIF（純 TIFF）を読み取る。
 * JPEG は piexifjs、PNG / WebP は各コンテナのチャンクからパースする。EXIF が無ければ null。
 */
export const readExifTiffFromDataUrl = (
  dataUrl: string,
  fileType: string,
): Uint8Array | null => {
  try {
    if (fileType.includes("jpeg") || fileType.includes("jpg")) {
      return piexifDumpToTiff(piexif.dump(piexif.load(dataUrl)));
    }
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      return null;
    }
    const bytes = base64ToUint8Array(base64);
    if (fileType.includes("webp")) {
      return extractWebpExif(bytes);
    }
    if (fileType.includes("png")) {
      return extractPngExif(bytes);
    }
  } catch (error) {
    console.warn("Failed to read EXIF data:", error);
  }
  return null;
};

/** Blob を DataURL に変換する（EXIF 挿入時の piexif 用） */
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });

/**
 * 出力 Blob に EXIF（純 TIFF）を出力形式に応じて挿入する。
 * JPEG は APP1（piexifjs）、PNG は eXIf チャンク、WebP は VP8X + EXIF チャンクとして書き込む。
 * width / height は WebP を VP8X 化する際の Canvas 寸法に使用する。
 */
export const insertExifIntoBlob = async (
  blob: Blob,
  exifTiff: Uint8Array,
  format: ExifWritableFormat,
  width: number,
  height: number,
): Promise<Blob> => {
  if (format === "jpeg") {
    const dataUrl = await blobToDataUrl(blob);
    // piexif.insert は "Exif\0\0" 前置の dump 文字列を要求する
    const newDataUrl = piexif.insert(tiffToPiexifDump(exifTiff), dataUrl);
    return dataUrlToBlob(newDataUrl, blob.type);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (format === "png") {
    return new Blob([insertPngExif(bytes, exifTiff)], { type: blob.type });
  }
  return new Blob([insertWebpExif(bytes, exifTiff, width, height)], {
    type: blob.type,
  });
};
