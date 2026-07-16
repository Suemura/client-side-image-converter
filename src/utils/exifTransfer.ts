/**
 * EXIF をソース画像から出力 Blob へ引き継ぐためのブラウザ側ヘルパー群
 *
 * 純粋なバイナリ操作は exifBinary.ts に、piexifjs / FileReader / Blob を伴う
 * 「読み取り→書き込み」の橋渡しをここに集約する（変換・トリミングの両経路で共用）。
 */

import piexif from "piexifjs";
import {
  buildSyntheticJpegFromTiff,
  extractPngExif,
  extractWebpExif,
  insertPngExif,
  insertWebpExif,
  piexifDumpToTiff,
  tiffToPiexifDump,
} from "./exifBinary";
import {
  base64ToUint8Array,
  dataUrlToBlob,
  uint8ArrayToBase64,
} from "./imageUtils";

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

/**
 * 純 TIFF を、向き・寸法をピクセルへ焼き込んだ出力画像に整合させた TIFF を返す。
 *
 * トリミング側は EXIF Orientation と回転/反転をピクセルへ焼き込むため、
 * (1) 元の Orientation を残すと閲覧側で二重回転してしまうので 1（無回転）へ揃え、
 * (2) ExifIFD の実ピクセル寸法（PixelXDimension 40962 / PixelYDimension 40963）を
 *     トリミング/回転後の実寸 width / height へ更新して、メタデータと実ピクセルの
 *     不整合（回転で幅・高さが入れ替わる場合など）を防ぐ。
 * 寸法タグは元画像に存在する場合のみ上書きし、無い画像へは新規追加しない。
 * 失敗時は元の TIFF をそのまま返す（EXIF 保持を優先）。
 * ただし stripThumbnail 指定時の失敗は例外を投げる（下記オプション参照）。
 */
export interface NormalizeExifOptions {
  /**
   * IFD1（EXIF 埋め込みサムネイル）を除去する。
   * サムネイルには編集前の縮小画像がそのまま残っているため、レタッチ（/redact）の
   * ように「画像の一部を不可逆に隠す」経路では、隠したはずの内容がサムネイル経由で
   * リークしないよう必ず除去する。除去を保証できない（パース失敗等の）場合は
   * 元 TIFF を返す代わりに例外を投げ、呼び出し側に EXIF 引き継ぎ自体を中止させる。
   */
  stripThumbnail?: boolean;
}

export const normalizeExifForBakedImage = (
  tiff: Uint8Array,
  width: number,
  height: number,
  options: NormalizeExifOptions = {},
): Uint8Array => {
  try {
    const jpeg = buildSyntheticJpegFromTiff(tiff);
    const dataUrl = `data:image/jpeg;base64,${uint8ArrayToBase64(jpeg)}`;
    const exifObj = piexif.load(dataUrl);
    if (exifObj["0th"]) {
      // Orientation タグ（274）。無回転を表す 1 に設定する
      exifObj["0th"][piexif.ImageIFD.Orientation] = 1;
    }
    const exifIfd = exifObj.Exif;
    if (exifIfd) {
      // 実寸タグが存在するときだけ、焼き込み後の実ピクセル寸法へ更新する
      if (piexif.ExifIFD.PixelXDimension in exifIfd) {
        exifIfd[piexif.ExifIFD.PixelXDimension] = width;
      }
      if (piexif.ExifIFD.PixelYDimension in exifIfd) {
        exifIfd[piexif.ExifIFD.PixelYDimension] = height;
      }
    }
    if (options.stripThumbnail) {
      // IFD1 とサムネイル本体を除去する（レタッチ前画像のリーク防止）
      exifObj["1st"] = {};
      exifObj.thumbnail = null;
    }
    return piexifDumpToTiff(piexif.dump(exifObj));
  } catch (error) {
    if (options.stripThumbnail) {
      // サムネイル除去を保証できない場合、未編集サムネイルが残り得る元 TIFF を
      // 返してはいけない。失敗させて呼び出し側に EXIF 引き継ぎを中止させる
      throw error instanceof Error ? error : new Error(String(error));
    }
    console.warn("Failed to normalize EXIF for baked image:", error);
    return tiff;
  }
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
