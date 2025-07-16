declare module "exif-js" {
  interface ExifData {
    [key: string]: string | number | undefined;
  }

  interface ExifContext {
    exifdata: ExifData;
    iptcdata: unknown;
    xmpdata: unknown;
    [key: string]: unknown;
  }

  interface ExifLibrary {
    /**
     * EXIFデータを取得する
     * @param file - ファイルまたはDOM要素
     * @param callback - コールバック関数（thisコンテキストでEXIFデータを取得）
     */
    getData(file: File | HTMLElement, callback: (this: ExifContext) => void): void;

    /**
     * すべてのEXIFタグを取得する
     * @param context - EXIFコンテキスト
     * @returns EXIFデータオブジェクト
     */
    getAllTags(context: ExifContext): ExifData;

    /**
     * 指定されたタグを取得する
     * @param context - EXIFコンテキスト
     * @param tag - タグ名
     * @returns タグの値
     */
    getTag(context: ExifContext, tag: string): string | number | undefined;

    /**
     * GPSデータを取得する
     * @param context - EXIFコンテキスト
     * @returns GPSデータオブジェクト
     */
    pretty(context: ExifContext): ExifData;

    /**
     * 度分秒形式を十進数に変換する
     * @param coordinate - 座標配列
     * @returns 十進数の座標
     */
    getGPSCoordinate(coordinate: number[]): number;

    /**
     * 文字列を読み取り専用配列に変換する
     * @param str - 文字列
     * @returns 読み取り専用配列
     */
    StringToBytes(str: string): Uint8Array;
  }

  const EXIF: ExifLibrary;
  export = EXIF;
}