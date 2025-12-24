/**
 * アプリケーション全体で使用する定数値
 */

// 画像処理関連の定数
export const IMAGE_CONSTANTS = {
  // サムネイルサイズ
  THUMBNAIL_SIZE: 32,

  // 画像品質設定
  QUALITY: {
    LOW: 0.8,
    MEDIUM: 0.92,
    HIGH: 0.95,
    MAXIMUM: 0.98,
  },

  // デフォルトタイムアウト（ミリ秒）
  DEFAULT_TIMEOUT: 1000,

  // ファイルサイズ計算基数
  FILE_SIZE_BASE: 1024,
} as const;

// サポートされる画像フォーマット
export const SUPPORTED_IMAGE_FORMATS = {
  // 変換でサポートされる形式
  CONVERSION_FORMATS: ["image/jpeg", "image/png", "image/webp"],

  // アップロードでサポートされる形式
  UPLOAD_FORMATS: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
  ],

  // JPEG形式の別名
  JPEG_VARIANTS: ["image/jpeg", "image/jpg"],
} as const;

// ファイルサイズ表示用の単位
export const FILE_SIZE_UNITS = ["Bytes", "KB", "MB", "GB", "TB"] as const;

// 画像変換のフォーマット
export const IMAGE_FORMATS = {
  JPEG: "jpeg",
  PNG: "png",
  WEBP: "webp",
} as const;

// MIME タイプマッピング
export const MIME_TYPE_MAPPING = {
  [IMAGE_FORMATS.JPEG]: "image/jpeg",
  [IMAGE_FORMATS.PNG]: "image/png",
  [IMAGE_FORMATS.WEBP]: "image/webp",
} as const;

// UI関連の定数
export const UI_CONSTANTS = {
  // モーダルのz-index
  MODAL_Z_INDEX: 1000,

  // プログレスバーのアニメーション時間
  PROGRESS_ANIMATION_DURATION: 200,

  // デバウンス時間
  DEBOUNCE_DELAY: 300,

  // 最大ファイル名表示長
  MAX_FILENAME_LENGTH: 12,
} as const;

// EXIF関連の定数
export const EXIF_CONSTANTS = {
  // プライバシーリスクが高いとされるタグ
  PRIVACY_RISK_TAGS: [
    "GPS",
    "GPSLatitude",
    "GPSLongitude",
    "GPSAltitude",
    "GPSTimeStamp",
    "GPSDateStamp",
    "DateTime",
    "DateTimeOriginal",
    "DateTimeDigitized",
    "UserComment",
    "ImageDescription",
    "Artist",
    "Copyright",
    "Make",
    "Model",
    "Software",
    "CameraOwnerName",
    "BodySerialNumber",
    "LensSerialNumber",
  ],

  // 安全とされるタグ
  SAFE_TAGS: [
    "ImageWidth",
    "ImageHeight",
    "Orientation",
    "XResolution",
    "YResolution",
    "ResolutionUnit",
    "ColorSpace",
  ],
} as const;

// デフォルト設定
export const DEFAULT_SETTINGS = {
  // 画像変換のデフォルト設定
  CONVERSION: {
    format: IMAGE_FORMATS.JPEG,
    quality: IMAGE_CONSTANTS.QUALITY.HIGH,
    maintainAspectRatio: true,
    preserveExif: false,
  },

  // トリミングのデフォルト設定
  CROP: {
    preserveExif: false,
    aspectRatio: null,
  },

  // メタデータ処理のデフォルト設定
  METADATA: {
    removePrivacyTags: true,
    preserveImageData: true,
  },
} as const;

// エラーメッセージ
export const ERROR_MESSAGES = {
  CANVAS_CONTEXT_ERROR: "Canvas context を取得できませんでした",
  FILE_READ_ERROR: "ファイルの読み込みに失敗しました",
  IMAGE_LOAD_ERROR: "画像の読み込みに失敗しました",
  BLOB_CREATION_ERROR: "Blobの作成に失敗しました",
  INVALID_FILE_TYPE: "選択されたファイルは画像ではありません",
  EXIF_PROCESSING_ERROR: "EXIFデータの処理に失敗しました",
} as const;
