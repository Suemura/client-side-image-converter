import {
  buildSyntheticJpegFromTiff,
  extractPngExif,
  extractWebpExif,
} from "./exifBinary";
import { dataUrlToBlob } from "./imageUtils";

/**
 * piexifjs のモジュール型。exif-js / piexifjs は重量ライブラリのため静的 import せず、
 * 使用時に動的 import してこの型の値として引き回す（初期バンドル削減。Issue #114）
 */
type Piexif = typeof import("piexifjs");

export interface ExifData {
  [key: string]: string | number | undefined;
}

/**
 * piexifjs で読み込んだ EXIF オブジェクトを可変操作するための型。
 * GPS 緯度・経度は度分秒のペア配列（number[][]）を取るため、値の型に number[][] も含める
 */
type MutableExifObj = Record<
  string,
  Record<number, string | number | number[] | number[][]>
>;

/** GPS 座標を丸める既定精度（十進度の小数点以下の桁数）。2 桁 ≈ 約 1.1km で市区町村レベル */
export const GPS_ROUNDING_DECIMALS = 2;

/** メタデータ削除処理のオプション */
export interface RemoveMetadataOptions {
  /**
   * true の場合、選択された GPS 緯度・経度は削除せず市区町村レベルに丸め、
   * 標高・撮影時刻などその他の選択された GPS サブタグは通常どおり削除する。
   * piexifjs を使う JPEG のみ有効（その他の形式は Canvas 全削除のため無効）
   */
  roundGpsInsteadOfRemove?: boolean;
}

/**
 * GPS 丸めモードで「削除せず丸める」対象とする GPS タグ（緯度・経度とその Ref）。
 * これ以外の GPS サブタグ（GPSAltitude / GPSTimeStamp / GPSDateStamp など）は
 * 丸めモードでも通常どおり削除し、位置以外の情報が残存しないようにする。
 */
const GPS_ROUND_TAGS = new Set([
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
]);

export interface FileMetadata {
  file: File;
  exifData: ExifData;
}

export interface MetadataAnalysis {
  allTags: Set<string>;
  privacyRiskTags: Set<string>;
  fileMetadata: FileMetadata[];
}

// プライバシーリスクのあるEXIFタグ
const PRIVACY_RISK_TAGS = new Set([
  "GPS",
  "GPSLatitude",
  "GPSLongitude",
  "GPSAltitude",
  "GPSImgDirection",
  "GPSDateStamp",
  "GPSTimeStamp",
  "GPS Info IFD Pointer",
  "DateTime",
  "DateTimeOriginal",
  "DateTimeDigitized",
  "Make",
  "Model",
  "Software",
  "Artist",
  "Copyright",
  "CameraOwnerName",
  "BodySerialNumber",
  "LensModel",
  "LensSerialNumber",
]);

/**
 * piexifjsのExifObjから指定されたタグを削除
 */
const removeTagsFromExifObj = (
  piexif: Piexif,
  exifObj: MutableExifObj,
  tagsToRemove: string[],
): void => {
  // タグ名とpiexifjsの定数のマッピング
  const tagMapping: Record<string, { ifd: string; tag: number }> = {
    // 0th IFD
    Make: { ifd: "0th", tag: piexif.ImageIFD.Make },
    Model: { ifd: "0th", tag: piexif.ImageIFD.Model },
    Software: { ifd: "0th", tag: piexif.ImageIFD.Software },
    DateTime: { ifd: "0th", tag: piexif.ImageIFD.DateTime },
    Artist: { ifd: "0th", tag: piexif.ImageIFD.Artist },
    Copyright: { ifd: "0th", tag: piexif.ImageIFD.Copyright },
    Orientation: { ifd: "0th", tag: piexif.ImageIFD.Orientation },

    // Exif IFD
    DateTimeOriginal: { ifd: "Exif", tag: piexif.ExifIFD.DateTimeOriginal },
    DateTimeDigitized: { ifd: "Exif", tag: piexif.ExifIFD.DateTimeDigitized },
    ExposureTime: { ifd: "Exif", tag: piexif.ExifIFD.ExposureTime },
    FNumber: { ifd: "Exif", tag: piexif.ExifIFD.FNumber },
    ISO: { ifd: "Exif", tag: piexif.ExifIFD.ISOSpeedRatings },
    ISOSpeedRatings: { ifd: "Exif", tag: piexif.ExifIFD.ISOSpeedRatings },
    FocalLength: { ifd: "Exif", tag: piexif.ExifIFD.FocalLength },
    Flash: { ifd: "Exif", tag: piexif.ExifIFD.Flash },
    WhiteBalance: { ifd: "Exif", tag: piexif.ExifIFD.WhiteBalance },
    ExposureMode: { ifd: "Exif", tag: piexif.ExifIFD.ExposureMode },
    CameraOwnerName: { ifd: "Exif", tag: piexif.ExifIFD.CameraOwnerName },
    BodySerialNumber: { ifd: "Exif", tag: piexif.ExifIFD.BodySerialNumber },
    LensModel: { ifd: "Exif", tag: piexif.ExifIFD.LensModel },
    LensSerialNumber: { ifd: "Exif", tag: piexif.ExifIFD.LensSerialNumber },
  };

  // GPS関連のタグは piexif.GPSIFD の定義（全 GPS タグ名 → タグ ID）を参照して削除する
  // （個別マッピングだと GPSLatitudeRef / GPSLongitudeRef 等の Ref 系タグが漏れるため）
  const gpsTagMapping = piexif.GPSIFD as unknown as Record<string, number>;

  for (const tagName of tagsToRemove) {
    // GPS全体を削除する場合
    if (tagName === "GPS" || tagName === "GPS Info IFD Pointer") {
      (exifObj as { GPS?: unknown }).GPS = undefined;
      continue;
    }

    // 通常のタグマッピングから削除
    const mapping = tagMapping[tagName];
    if (mapping && exifObj[mapping.ifd]) {
      delete exifObj[mapping.ifd][mapping.tag];
    }

    // GPSタグの個別削除
    // GPSVersionID はタグ ID が 0（falsy）のため、undefined チェックで判定する
    if (
      tagName.startsWith("GPS") &&
      gpsTagMapping[tagName] !== undefined &&
      exifObj.GPS
    ) {
      delete exifObj.GPS[gpsTagMapping[tagName]];
    }
  }

  // 空になったIFDを削除
  const ifds = ["0th", "Exif", "GPS", "1st"];
  for (const ifd of ifds) {
    if (exifObj[ifd] && Object.keys(exifObj[ifd]).length === 0) {
      delete exifObj[ifd];
    }
  }
};

/**
 * GPS の度分秒（有理数配列 [[度,分母],[分,分母],[秒,分母]]）と参照（N/S/E/W）から
 * 十進度に変換する。S / W は負値になる
 */
export const gpsRationalsToDecimal = (dms: number[][], ref: string): number => {
  const toNumber = (pair: number[] | undefined): number => {
    if (!pair) return 0;
    const [num, den] = pair;
    return den === 0 ? 0 : num / den;
  };
  const deg = toNumber(dms[0]);
  const min = toNumber(dms[1]);
  const sec = toNumber(dms[2]);
  const decimal = deg + min / 60 + sec / 3600;
  return ref === "S" || ref === "W" ? -decimal : decimal;
};

/**
 * 十進度の絶対値を GPS の度分秒（有理数配列）に変換する。
 * 秒は 1/100 秒単位の有理数で表現し、丸め後の値を保持できるようにする
 */
export const decimalToGpsRationals = (decimalAbs: number): number[][] => {
  const abs = Math.abs(decimalAbs);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const secFloat = (minFloat - min) * 60;
  const sec = Math.round(secFloat * 100);
  return [
    [deg, 1],
    [min, 1],
    [sec, 100],
  ];
};

/**
 * ExifObj 内の GPS 緯度・経度を指定精度に丸める（完全削除の代替）。
 * Ref（N/S/E/W）は保持する。GPS がなければ何もしない
 */
export const roundGpsInExifObj = (
  piexif: Piexif,
  exifObj: MutableExifObj,
  decimals: number = GPS_ROUNDING_DECIMALS,
): void => {
  const gps = exifObj.GPS;
  if (!gps) {
    return;
  }

  const factor = 10 ** decimals;
  const round = (decimal: number): number =>
    Math.round(decimal * factor) / factor;

  const roundCoordinate = (
    valueTag: number,
    refTag: number,
    defaultRef: string,
  ): void => {
    const value = gps[valueTag];
    if (!Array.isArray(value)) {
      return;
    }
    const ref = (gps[refTag] as string) || defaultRef;
    const decimal = gpsRationalsToDecimal(value as number[][], ref);
    // 丸めは絶対値に対して行い、符号は Ref（N/S/E/W）で表現されるため Ref は維持する
    gps[valueTag] = decimalToGpsRationals(round(decimal));
  };

  roundCoordinate(piexif.GPSIFD.GPSLatitude, piexif.GPSIFD.GPSLatitudeRef, "N");
  roundCoordinate(
    piexif.GPSIFD.GPSLongitude,
    piexif.GPSIFD.GPSLongitudeRef,
    "E",
  );
};

/**
 * Canvas APIを使用してすべてのメタデータを削除（フォールバック）
 */
const removeAllMetadataWithCanvas = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob"));
            return;
          }

          const cleanedFile = new File([blob], file.name, {
            type: file.type,
          });

          resolve(cleanedFile);
        },
        file.type,
        file.type.includes("webp") ? 0.95 : 0.98,
      );
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = URL.createObjectURL(file);
  });
};

/**
 * ファイルからEXIF情報を抽出する
 */
export const extractExifData = async (file: File): Promise<ExifData> => {
  if (!file.type.startsWith("image/")) {
    return {};
  }

  // exif-js は EXIF 解析時のみロードし、初期バンドルへ影響させない
  const { default: EXIF } = await import("exif-js");

  return new Promise((resolve) => {
    // exif-js の getAllTags 結果を ExifData に整形する（JPEG / WebP 共通）
    const collectTags = (source: File): void => {
      EXIF.getData(source, function (this) {
        const allMetaData = EXIF.getAllTags(this);
        const relevantData: ExifData = {};

        // すべてのEXIF情報を抽出（元のFileDetailModalより包括的）
        for (const [key, value] of Object.entries(allMetaData)) {
          if (value !== undefined && value !== null) {
            relevantData[key] = value as string | number;
          }
        }

        resolve(relevantData);
      });
    };

    // WebP / PNG はコンテナの EXIF チャンク（RIFF EXIF / PNG eXIf）を取り出し、
    // 合成 JPEG に包んで既存の exif-js 読み取り経路を再利用する
    // （JPEG の APP1 と同じ TIFF 構造のため。exif-js は先頭が JPEG SOI でないと読めない）
    const containerExtractor = file.type.includes("webp")
      ? extractWebpExif
      : file.type.includes("png")
        ? extractPngExif
        : null;

    if (containerExtractor) {
      file
        .arrayBuffer()
        .then((buffer) => {
          const tiff = containerExtractor(new Uint8Array(buffer));
          if (!tiff) {
            resolve({});
            return;
          }
          const syntheticJpeg = buildSyntheticJpegFromTiff(tiff);
          const jpegFile = new File([syntheticJpeg], "exif-source.jpg", {
            type: "image/jpeg",
          });
          collectTags(jpegFile);
        })
        .catch(() => resolve({}));
      return;
    }

    // JPEG などはそのまま exif-js に渡す
    collectTags(file);
  });
};

/**
 * 複数ファイルのメタデータを分析する
 */
export const analyzeMetadata = async (
  files: File[],
): Promise<MetadataAnalysis> => {
  const allTags = new Set<string>();
  const privacyRiskTags = new Set<string>();

  // 並列処理でEXIFデータを取得
  const metadataPromises = files.map(async (file) => {
    const exifData = await extractExifData(file);
    return { file, exifData };
  });

  const fileMetadata = await Promise.all(metadataPromises);

  // タグを集計
  for (const { exifData } of fileMetadata) {
    for (const tag of Object.keys(exifData)) {
      allTags.add(tag);
      if (PRIVACY_RISK_TAGS.has(tag) || tag.toLowerCase().includes("gps")) {
        privacyRiskTags.add(tag);
      }
    }
  }

  return {
    allTags,
    privacyRiskTags,
    fileMetadata,
  };
};

/**
 * 指定されたタグを画像から削除する
 * piexifjsを使用したEXIFデータの選択的削除
 */
export const removeMetadataFromImage = async (
  file: File,
  tagsToRemove: string[],
  options?: RemoveMetadataOptions,
): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (tagsToRemove.length === 0) {
      resolve(file);
      return;
    }

    // JPEGファイルのみ対応
    if (!file.type.includes("jpeg") && !file.type.includes("jpg")) {
      // JPEG以外はCanvas経由で全削除（GPS 丸めは piexif 経路のみのため非対応）
      removeAllMetadataWithCanvas(file).then(resolve).catch(reject);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imageData = e.target?.result as string;
        if (!imageData) {
          reject(new Error("Failed to read file"));
          return;
        }

        // piexifjs は JPEG の選択的削除時のみロードする
        const { default: piexif } = await import("piexifjs");

        // piexifjsでEXIFデータを読み込み
        const exifObj = piexif.load(imageData) as MutableExifObj;

        if (options?.roundGpsInsteadOfRemove) {
          // GPS 丸めモード: 緯度・経度（と Ref）は削除せず丸め、
          // それ以外の選択されたタグ（GPSAltitude / GPSTimeStamp などの GPS サブタグを含む）は削除する
          const roundedGpsSelected = tagsToRemove.some((tag) =>
            GPS_ROUND_TAGS.has(tag),
          );
          const tagsToDelete = tagsToRemove.filter(
            (tag) => !GPS_ROUND_TAGS.has(tag),
          );
          removeTagsFromExifObj(piexif, exifObj, tagsToDelete);
          // 緯度・経度が削除対象に選ばれている場合のみ丸めを適用する
          if (roundedGpsSelected) {
            roundGpsInExifObj(piexif, exifObj);
          }
        } else {
          // 指定されたタグを削除
          removeTagsFromExifObj(piexif, exifObj, tagsToRemove);
        }

        // 修正したEXIFデータを画像に挿入
        const exifBytes = piexif.dump(exifObj);
        const newImageData = piexif.insert(exifBytes, imageData);

        // Base64からBlobに変換
        const modifiedBlob = dataUrlToBlob(newImageData, file.type);
        const modifiedFile = new File([modifiedBlob], file.name, {
          type: file.type,
        });

        resolve(modifiedFile);
      } catch (error) {
        console.error("EXIF編集エラー:", error);
        // エラーの場合はCanvas経由で全削除
        removeAllMetadataWithCanvas(file).then(resolve).catch(reject);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * 複数ファイルから指定されたメタデータを削除する
 */
export const removeMetadataFromFiles = async (
  files: File[],
  tagsToRemove: string[],
  onProgress?: (current: number, total: number) => void,
  options?: RemoveMetadataOptions,
): Promise<File[]> => {
  const cleanedFiles: File[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (onProgress) {
      onProgress(i, files.length);
    }

    try {
      const cleanedFile = await removeMetadataFromImage(
        file,
        tagsToRemove,
        options,
      );
      cleanedFiles.push(cleanedFile);
    } catch (error) {
      console.error(`Failed to clean metadata from ${file.name}:`, error);
      // エラーが発生した場合は元のファイルをそのまま使用
      cleanedFiles.push(file);
    }
  }

  if (onProgress) {
    onProgress(files.length, files.length);
  }

  return cleanedFiles;
};

/**
 * プライバシーリスクの評価
 */
export const assessPrivacyRisk = (
  exifData: ExifData,
): "high" | "medium" | "low" => {
  const tags = Object.keys(exifData);

  // GPS情報があれば高リスク
  if (tags.some((tag) => tag.toLowerCase().includes("gps"))) {
    return "high";
  }

  // 日時・機器情報があれば中リスク
  if (tags.some((tag) => PRIVACY_RISK_TAGS.has(tag))) {
    return "medium";
  }

  return "low";
};
