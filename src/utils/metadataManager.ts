import EXIF from "exif-js";
import piexif from "piexifjs";

export interface ExifData {
  [key: string]: string | number | undefined;
}

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

export class MetadataManager {
  /**
   * ファイルからEXIF情報を抽出する
   */
  static async extractExifData(file: File): Promise<ExifData> {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve({});
        return;
      }

      // WebPは現在EXIF読み取りサポート対象外
      if (file.type.includes("webp")) {
        resolve({});
        return;
      }

      // JPEG/その他の形式にはexif-jsを使用
      EXIF.getData(file, function (this) {
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
    });
  }

  /**
   * 複数ファイルのメタデータを分析する
   */
  static async analyzeMetadata(files: File[]): Promise<MetadataAnalysis> {
    const fileMetadata: FileMetadata[] = [];
    const allTags = new Set<string>();
    const privacyRiskTags = new Set<string>();

    for (const file of files) {
      const exifData = await MetadataManager.extractExifData(file);
      fileMetadata.push({ file, exifData });

      // タグを集計
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
  }

  /**
   * 指定されたタグを画像から削除する
   * piexifjsを使用したEXIFデータの選択的削除
   */
  static async removeMetadataFromImage(
    file: File,
    tagsToRemove: string[],
  ): Promise<File> {
    return new Promise((resolve, reject) => {
      if (tagsToRemove.length === 0) {
        resolve(file);
        return;
      }

      // JPEGファイルのみ対応
      if (!file.type.includes("jpeg") && !file.type.includes("jpg")) {
        // JPEG以外はCanvas経由で全削除
        MetadataManager.removeAllMetadataWithCanvas(file)
          .then(resolve)
          .catch(reject);
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

          // piexifjsでEXIFデータを読み込み
          const exifObj = piexif.load(imageData);

          // 指定されたタグを削除
          MetadataManager.removeTagsFromExifObj(
            exifObj as Record<
              string,
              Record<number, string | number | number[]>
            >,
            tagsToRemove,
          );

          // 修正したEXIFデータを画像に挿入
          const exifBytes = piexif.dump(exifObj);
          const newImageData = piexif.insert(exifBytes, imageData);

          // Base64からBlobに変換
          const base64Data = newImageData.split(",")[1];
          const binaryData = atob(base64Data);
          const uint8Array = new Uint8Array(binaryData.length);
          for (let i = 0; i < binaryData.length; i++) {
            uint8Array[i] = binaryData.charCodeAt(i);
          }

          const modifiedBlob = new Blob([uint8Array], { type: file.type });
          const modifiedFile = new File([modifiedBlob], file.name, {
            type: file.type,
          });

          resolve(modifiedFile);
        } catch (error) {
          console.error("EXIF編集エラー:", error);
          // エラーの場合はCanvas経由で全削除
          MetadataManager.removeAllMetadataWithCanvas(file)
            .then(resolve)
            .catch(reject);
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * piexifjsのExifObjから指定されたタグを削除
   */
  private static removeTagsFromExifObj(
    exifObj: Record<string, Record<number, string | number | number[]>>,
    tagsToRemove: string[],
  ): void {
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

    // GPS関連のタグを処理
    const gpsTagMapping: Record<string, number> = {
      GPSLatitude: piexif.GPSIFD.GPSLatitude,
      GPSLongitude: piexif.GPSIFD.GPSLongitude,
      GPSAltitude: piexif.GPSIFD.GPSAltitude,
      GPSImgDirection: piexif.GPSIFD.GPSImgDirection,
      GPSDateStamp: piexif.GPSIFD.GPSDateStamp,
      GPSTimeStamp: piexif.GPSIFD.GPSTimeStamp,
    };

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
      if (tagName.startsWith("GPS") && gpsTagMapping[tagName] && exifObj.GPS) {
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
  }

  /**
   * Canvas APIを使用してすべてのメタデータを削除（フォールバック）
   */
  private static async removeAllMetadataWithCanvas(file: File): Promise<File> {
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
  }

  /**
   * 複数ファイルから指定されたメタデータを削除する
   */
  static async removeMetadataFromFiles(
    files: File[],
    tagsToRemove: string[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<File[]> {
    const cleanedFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i, files.length);
      }

      try {
        const cleanedFile = await MetadataManager.removeMetadataFromImage(
          file,
          tagsToRemove,
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
  }

  /**
   * プライバシーリスクの評価
   */
  static assessPrivacyRisk(exifData: ExifData): "high" | "medium" | "low" {
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
  }
}
