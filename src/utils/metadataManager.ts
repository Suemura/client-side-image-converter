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
   * EXIFデータの選択的削除を実装
   */
  static async removeMetadataFromImage(
    file: File, 
    tagsToRemove: string[]
  ): Promise<File> {
    return new Promise((resolve, reject) => {
      if (tagsToRemove.length === 0) {
        resolve(file);
        return;
      }

      // FileReaderでファイルをArrayBufferとして読み込み
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          if (!arrayBuffer) {
            reject(new Error('Failed to read file'));
            return;
          }

          // EXIFデータを抽出・編集
          const modifiedBuffer = await this.removeExifTags(arrayBuffer, tagsToRemove);
          
          // 新しいFileオブジェクトを作成
          const modifiedBlob = new Blob([modifiedBuffer], { type: file.type });
          const modifiedFile = new File([modifiedBlob], file.name, {
            type: file.type,
            lastModified: Date.now()
          });

          resolve(modifiedFile);
        } catch (error) {
          console.error('EXIF編集エラー:', error);
          // エラーの場合はCanvas経由で全削除
          this.removeAllMetadataWithCanvas(file).then(resolve).catch(reject);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * EXIFタグを選択的に削除する
   */
  private static async removeExifTags(
    arrayBuffer: ArrayBuffer, 
    tagsToRemove: string[]
  ): Promise<ArrayBuffer> {
    const dataView = new DataView(arrayBuffer);
    
    // JPEGの場合の処理
    if (dataView.getUint16(0) === 0xFFD8) {
      return this.removeJpegExifTags(arrayBuffer, tagsToRemove);
    }
    
    // JPEG以外の場合は、Canvas経由での削除にフォールバック
    throw new Error('EXIF editing only supported for JPEG files');
  }

  /**
   * JPEGファイルからEXIFタグを選択的に削除
   */
  private static removeJpegExifTags(
    arrayBuffer: ArrayBuffer, 
    tagsToRemove: string[]
  ): ArrayBuffer {
    const dataView = new DataView(arrayBuffer);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // APP1セグメント（EXIF）を探す
    let offset = 2; // SOI (0xFFD8) の後から開始
    
    while (offset < dataView.byteLength - 1) {
      const marker = dataView.getUint16(offset);
      
      if (marker === 0xFFE1) { // APP1セグメント
        const segmentLength = dataView.getUint16(offset + 2);
        
        // "Exif\0\0" を確認
        if (offset + 10 < dataView.byteLength &&
            dataView.getUint32(offset + 4) === 0x45786966 && // "Exif"
            dataView.getUint16(offset + 8) === 0x0000) { // "\0\0"
          
          // EXIFデータを処理
          const exifData = this.processExifData(
            uint8Array, 
            offset + 10, 
            segmentLength - 6, 
            tagsToRemove
          );
          
          // 修正されたバッファを作成
          const result = new Uint8Array(arrayBuffer.byteLength - (segmentLength - 6) + exifData.length);
          
          // 前の部分をコピー
          result.set(uint8Array.slice(0, offset + 10));
          
          // 修正されたEXIFデータを設定
          result.set(exifData, offset + 10);
          
          // 後の部分をコピー
          result.set(
            uint8Array.slice(offset + 4 + segmentLength), 
            offset + 10 + exifData.length
          );
          
          // 新しいセグメント長を設定
          const newDataView = new DataView(result.buffer);
          newDataView.setUint16(offset + 2, exifData.length + 6);
          
          return result.buffer;
        }
      }
      
      if (marker >= 0xFFD0 && marker <= 0xFFD7) {
        // RSTマーカー（長さフィールドなし）
        offset += 2;
      } else if (marker === 0xFFDA) {
        // SOS（画像データ開始）- これ以上EXIFはない
        break;
      } else {
        // その他のマーカー
        const segmentLength = dataView.getUint16(offset + 2);
        offset += 2 + segmentLength;
      }
    }
    
    // EXIFセグメントが見つからなかった場合は元のデータを返す
    return arrayBuffer;
  }

  /**
   * EXIFデータ内の指定タグを削除
   */
  private static processExifData(
    data: Uint8Array, 
    startOffset: number, 
    length: number, 
    tagsToRemove: string[]
  ): Uint8Array {
    // 簡易的な実装: タグマッピング
    const tagMap: Record<string, number> = {
      'Make': 0x010F,
      'Model': 0x0110,
      'DateTime': 0x0132,
      'DateTimeOriginal': 0x9003,
      'DateTimeDigitized': 0x9004,
      'Software': 0x0131,
      'Artist': 0x013B,
      'Copyright': 0x8298,
      'GPS': 0x8825,
      'GPSLatitude': 0x0002,
      'GPSLongitude': 0x0004,
      'GPSAltitude': 0x0006,
      'ExposureTime': 0x829A,
      'FNumber': 0x829D,
      'ISO': 0x8827,
      'ISOSpeedRatings': 0x8827,
      'FocalLength': 0x920A,
      'Flash': 0x9209,
      'WhiteBalance': 0xA403,
      'ExposureMode': 0xA402,
      'Orientation': 0x0112
    };

    // 削除対象のタグ番号を取得
    const tagsToRemoveNumbers = tagsToRemove
      .map(tag => tagMap[tag])
      .filter(num => num !== undefined);

    if (tagsToRemoveNumbers.length === 0) {
      return data.slice(startOffset, startOffset + length);
    }

    // TIFF形式のEXIFデータを解析・編集
    const exifData = data.slice(startOffset, startOffset + length);
    return this.removeTiffTags(exifData, tagsToRemoveNumbers);
  }

  /**
   * TIFFフォーマットのEXIFデータから指定タグを削除
   */
  private static removeTiffTags(data: Uint8Array, tagsToRemove: number[]): Uint8Array {
    // エンディアンを確認
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const endian = dataView.getUint16(0);
    const littleEndian = endian === 0x4949;
    
    // IFDオフセットを取得
    const ifdOffset = littleEndian ? 
      dataView.getUint32(4, true) : 
      dataView.getUint32(4, false);
    
    // 簡易実装: タグが見つかった場合は該当エントリを除去
    // 完全な実装には更に詳細な解析が必要
    return this.filterIfdEntries(data, ifdOffset, tagsToRemove, littleEndian);
  }

  /**
   * IFDエントリから指定タグを除去
   */
  private static filterIfdEntries(
    data: Uint8Array, 
    ifdOffset: number, 
    tagsToRemove: number[], 
    littleEndian: boolean
  ): Uint8Array {
    // 簡易実装: 指定されたタグのエントリを除去した新しいバッファを作成
    // 実際の実装ではより複雑なIFD構造の解析が必要
    
    const result = new Uint8Array(data);
    const dataView = new DataView(result.buffer, result.byteOffset, result.byteLength);
    
    try {
      if (ifdOffset < data.length - 2) {
        const entryCount = littleEndian ? 
          dataView.getUint16(ifdOffset, true) : 
          dataView.getUint16(ifdOffset, false);
        
        // エントリを確認して削除対象をマーク
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifdOffset + 2 + (i * 12);
          if (entryOffset + 2 < data.length) {
            const tag = littleEndian ? 
              dataView.getUint16(entryOffset, true) : 
              dataView.getUint16(entryOffset, false);
            
            if (tagsToRemove.includes(tag)) {
              // タグを無効化（タイプを0に設定）
              if (littleEndian) {
                dataView.setUint16(entryOffset + 2, 0, true);
              } else {
                dataView.setUint16(entryOffset + 2, 0, false);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('EXIF tag removal warning:', error);
    }
    
    return result;
  }

  /**
   * Canvas APIを使用してすべてのメタデータを削除（フォールバック）
   */
  private static async removeAllMetadataWithCanvas(file: File): Promise<File> {
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
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }
          
          const cleanedFile = new File([blob], file.name, { 
            type: file.type,
            lastModified: Date.now()
          });
          
          resolve(cleanedFile);
        }, file.type, 0.98);
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