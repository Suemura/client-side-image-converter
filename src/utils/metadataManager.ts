import EXIF from "exif-js";

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
  'GPS', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSImgDirection',
  'GPSDateStamp', 'GPSTimeStamp', 'GPS Info IFD Pointer',
  'DateTime', 'DateTimeOriginal', 'DateTimeDigitized',
  'Make', 'Model', 'Software', 'Artist', 'Copyright',
  'CameraOwnerName', 'BodySerialNumber', 'LensModel', 'LensSerialNumber'
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (EXIF as any).getData(file, function (this: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allMetaData = (EXIF as any).getAllTags(this);
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
      const exifData = await this.extractExifData(file);
      fileMetadata.push({ file, exifData });

      // タグを集計
      for (const tag of Object.keys(exifData)) {
        allTags.add(tag);
        if (PRIVACY_RISK_TAGS.has(tag) || tag.toLowerCase().includes('gps')) {
          privacyRiskTags.add(tag);
        }
      }
    }

    return {
      allTags,
      privacyRiskTags,
      fileMetadata
    };
  }

  /**
   * 指定されたタグを画像から削除する
   */
  static async removeMetadataFromImage(
    file: File, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _tagsToRemove: string[]
  ): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 画像をcanvasに描画（これによりメタデータが削除される）
        ctx.drawImage(img, 0, 0);
        
        // canvasから新しいファイルを作成
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }
          
          // 元のファイル名を使用して新しいファイルを作成
          const cleanedFile = new File([blob], file.name, { 
            type: file.type,
            lastModified: Date.now()
          });
          
          resolve(cleanedFile);
        }, file.type, 0.98); // 高品質で出力
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
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
    onProgress?: (current: number, total: number) => void
  ): Promise<File[]> {
    const cleanedFiles: File[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i, files.length);
      }
      
      try {
        const cleanedFile = await this.removeMetadataFromImage(file, tagsToRemove);
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
  static assessPrivacyRisk(exifData: ExifData): 'high' | 'medium' | 'low' {
    const tags = Object.keys(exifData);
    
    // GPS情報があれば高リスク
    if (tags.some(tag => tag.toLowerCase().includes('gps'))) {
      return 'high';
    }
    
    // 日時・機器情報があれば中リスク
    if (tags.some(tag => PRIVACY_RISK_TAGS.has(tag))) {
      return 'medium';
    }
    
    return 'low';
  }
}