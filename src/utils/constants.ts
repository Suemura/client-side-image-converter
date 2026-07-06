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
  CONVERSION_FORMATS: ["image/jpeg", "image/png", "image/webp", "image/avif"],

  // アップロードでサポートされる形式（crop / metadata ページ用。
  // TIFF はブラウザの Image がデコードできずプレビュー描画できないため HEIC 同様に対象外）
  UPLOAD_FORMATS: ["image/jpeg", "image/png", "image/webp", "image/bmp"],

  // 変換ページのアップロードでサポートされる形式（TIFF / HEIC / HEIF はデコード専用の入力として受理）
  CONVERT_UPLOAD_FORMATS: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
  ],

  // HEIC/HEIF 形式（ブラウザの Image ではデコードできず WASM デコーダーを使用する）
  // sequence 系（image/heic-sequence / image/heif-sequence、バースト写真等）は
  // 実ファイルでのデコード検証ができていないため意図的に対象外とする
  // （対応する場合はフィクスチャの用意と E2E 検証をセットで行うこと）
  HEIC_FORMATS: ["image/heic", "image/heif"],

  // TIFF 形式（ブラウザの Image ではデコードできず utif2 デコーダーを使用する）
  TIFF_FORMATS: ["image/tiff"],

  // JPEG形式の別名
  JPEG_VARIANTS: ["image/jpeg", "image/jpg"],
} as const;

// 一度に取り込めるファイルの上限件数
// フォルダドロップ（サブフォルダ再帰取込）や multiple 選択で巨大なツリーを誤投入すると、
// サムネイル生成（各画像を readAsDataURL でメモリ展開し一斉デコード）でタブがフリーズ/
// メモリ圧迫する。真のボトルネックを有界化するためのハード上限（超過分は取り込まず警告する）。
export const MAX_INPUT_FILES = 200;

// HEIC/HEIF の拡張子（MIME タイプが空になるブラウザ向けのフォールバック判定に使用）
export const HEIC_EXTENSIONS = [".heic", ".heif"] as const;

// TIFF の拡張子（MIME タイプが特定されない環境向けのフォールバック判定に使用）
export const TIFF_EXTENSIONS = [".tif", ".tiff"] as const;

// ファイルサイズ表示用の単位
export const FILE_SIZE_UNITS = ["Bytes", "KB", "MB", "GB", "TB"] as const;

// 画像変換のフォーマット
export const IMAGE_FORMATS = {
  JPEG: "jpeg",
  PNG: "png",
  WEBP: "webp",
  AVIF: "avif",
} as const;

// MIME タイプマッピング
export const MIME_TYPE_MAPPING = {
  [IMAGE_FORMATS.JPEG]: "image/jpeg",
  [IMAGE_FORMATS.PNG]: "image/png",
  [IMAGE_FORMATS.WEBP]: "image/webp",
  [IMAGE_FORMATS.AVIF]: "image/avif",
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
