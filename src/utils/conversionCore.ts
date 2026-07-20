/**
 * 画像変換のコア型と Canvas 非依存の純粋ロジック
 *
 * メインスレッド（`imageConverter.ts`）と Web Worker（`imageProcessing.worker.ts`）の双方から
 * 共有するため、DOM / Canvas / WASM に依存しない型定義と純粋関数だけをここに集約する。
 * これにより Worker のバンドルにメインスレッド専用の Canvas コードが混入しない。
 */

import { pngQualityStrategy } from "./pngQuality";
import type { RawDevelopParams } from "./rawDevelopment";

export type ConversionFormat = "jpeg" | "png" | "webp" | "avif" | "jxl";

/**
 * 出力フォーマットが EXIF 保持（piexifjs / バイナリ挿入）に対応しているかを返す純粋関数。
 *
 * AVIF / JXL は WASM エンコーダー（@jsquash/*）が ImageData のみを受け取りメタデータを
 * 書き込めないため対象外。メインスレッド（imageConverter.ts）・Worker
 * （imageProcessing.worker.ts）・UI（ConversionSettings.tsx）がこの関数を
 * 「唯一の真実」として共有する。
 */
export const canPreserveExifForFormat = (
  format: ConversionFormat,
): format is "jpeg" | "png" | "webp" => {
  return format === "jpeg" || format === "png" || format === "webp";
};

/**
 * 処理モード。
 * - "convert": 指定フォーマットへ変換する（既定）
 * - "optimize": フォーマットを維持したまま再圧縮してファイルサイズを削減する（Issue #61）
 */
export type ConversionMode = "convert" | "optimize";

export interface ConversionOptions {
  format: ConversionFormat;
  /**
   * 処理モード（未指定時は "convert"）。"optimize" のときは `format` は無視され、
   * 入力と同じフォーマットのまま最適化（PNG は可逆・JPEG/WebP は再エンコード）する。
   */
  mode?: ConversionMode;
  quality: number; // 0-100
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
  preserveExif?: boolean;
  /**
   * 目標ファイルサイズ（KB）。指定すると品質値を二分探索し、目標サイズ以下で最大品質の結果を採用する。
   * JPEG / WebP でのみ有効（PNG は可逆・AVIF / JXL は WASM エンコードが低速なため対象外）。
   * 未指定または 0 以下の場合は quality をそのまま使う。
   */
  targetFileSizeKB?: number;
  /**
   * RAW 現像パラメータ（露出補正・WB・ハイライト復元。Issue #132）。
   * RAW ソースのデコード時のみ使用され、非 RAW ソースでは無視される。
   * 未指定時はカメラ設定準拠のデフォルト現像。
   */
  rawDevelopParams?: RawDevelopParams;
}

export interface ConversionResult {
  blob: Blob;
  url: string;
  originalSize: number;
  convertedSize: number;
  filename: string;
  originalFilename: string;
  file: File;
  /**
   * 目標ファイルサイズ探索を行った場合の達成可否。
   * 探索を行わなかった場合は undefined、達成できなかった場合（最小サイズで出力）は false。
   */
  targetSizeAchieved?: boolean;
  /** 出力画像の幅 px（リサイズ等適用後）。リネーム規則の {width} 用（編集経路のみ設定） */
  width?: number;
  /** 出力画像の高さ px（リサイズ等適用後）。リネーム規則の {height} 用（編集経路のみ設定） */
  height?: number;
}

export interface QualitySearchOptions {
  minQuality?: number; // 既定 1
  maxQuality?: number; // 既定 100
  maxIterations?: number; // 既定 8（1-100 の整数範囲は ceil(log2(100))=7 で十分絞れる）
}

export interface QualitySearchResult {
  blob: Blob;
  quality: number;
  achieved: boolean; // 目標サイズ以下を達成できたか
}

/**
 * 変換に失敗したファイルの情報（ユーザーへの通知表示に使用する）
 * エラー詳細は console.error に記録されるため、表示に必要なファイル名のみを保持する
 */
export interface ConversionFailure {
  fileName: string;
}

/** 一括変換の結果（成功した変換結果と失敗したファイルの両方を返す） */
export interface BatchConversionResult {
  results: ConversionResult[];
  failures: ConversionFailure[];
}

/**
 * エンコード関数を注入し、目標ファイルサイズ以下で最大品質となる品質値を二分探索する純粋ロジック。
 *
 * Canvas / Image / WASM に非依存（`encode` を差し替えれば happy-dom でも単体テスト可能）。
 * 「品質↑でサイズ↑」という近似単調性を前提とするが、破れても以下の性質により常に妥当な結果を返す:
 * - 探索した品質のいずれかで目標以下になれば、その中で最大品質の Blob（目標以下）を必ず返す
 * - どの品質でも目標を超える場合は、探索中に見つけた最小 Blob を `achieved: false` で返す（フォールバック）
 *
 * @param encode - 品質値（1-100）を受け取り Blob を返すエンコード関数
 * @param targetSizeBytes - 目標ファイルサイズ（バイト）
 * @param options - 探索範囲・反復回数の上書き
 */
export const searchQualityForTargetSize = async (
  encode: (quality: number) => Promise<Blob>,
  targetSizeBytes: number,
  options?: QualitySearchOptions,
): Promise<QualitySearchResult> => {
  const minQuality = options?.minQuality ?? 1;
  const maxQuality = options?.maxQuality ?? 100;
  const maxIterations = options?.maxIterations ?? 8;

  let lo = minQuality;
  let hi = maxQuality;
  // 目標以下で見つかった最大品質の候補
  let best: QualitySearchResult | null = null;
  // 全探索点のうち最小サイズの Blob（達成不可時のフォールバック）
  let smallest: QualitySearchResult | null = null;

  let iterations = 0;
  while (lo <= hi && iterations < maxIterations) {
    const mid = Math.floor((lo + hi) / 2);
    const blob = await encode(mid);
    iterations++;

    if (smallest === null || blob.size < smallest.blob.size) {
      smallest = { blob, quality: mid, achieved: false };
    }

    if (blob.size <= targetSizeBytes) {
      // 目標達成: より高品質を狙って範囲を上へ
      best = { blob, quality: mid, achieved: true };
      lo = mid + 1;
    } else {
      // 目標超過: 品質を下げる
      hi = mid - 1;
    }
  }

  if (best) {
    return best;
  }
  if (smallest) {
    // どの品質でも目標を超えた: 最小サイズの結果を返す
    return smallest;
  }
  // maxIterations <= 0 等で一度もエンコードしなかった場合のガード
  const fallbackBlob = await encode(minQuality);
  return {
    blob: fallbackBlob,
    quality: minQuality,
    achieved: fallbackBlob.size <= targetSizeBytes,
  };
};

/** アルファ非対応出力へ合成する背景色（透過部分の黒化を防ぐ。Issue #108） */
export const FLATTEN_BACKGROUND_COLOR = "#ffffff";

/**
 * 出力時に透過部分へ合成すべき背景色を返す純粋関数（合成不要なら null）。
 *
 * Canvas はアルファ 0 のピクセルが RGBA(0,0,0,0) のため、アルファを保持できない
 * JPEG へそのままエンコードすると透過部分が黒くなる。`drawImage` の前にこの色で
 * `fillRect` することで背景を合成する。メインスレッド（`imageConverter.ts`）・
 * Worker（`imageProcessing.worker.ts`）・編集（`imageEditor.ts`）の全エンコード経路が
 * この関数を「唯一の真実」として共有する（WYSIWYG 原則）。
 *
 * @param format - 出力フォーマット
 * @param quality - 品質値（0-100）。PNG は低品質ティア（jpeg-roundtrip）のみ中間 JPEG を
 *   経由して透過が失われるため、quality を渡した場合に限りティアを判定して背景色を返す。
 *   PNG をネイティブエンコードする経路（編集ページ等）では渡さないこと（アルファ保持）
 */
export const resolveFlattenBackground = (
  format: ConversionFormat,
  quality?: number,
): string | null => {
  if (format === "jpeg") {
    return FLATTEN_BACKGROUND_COLOR;
  }
  if (
    format === "png" &&
    quality !== undefined &&
    pngQualityStrategy(quality) === "jpeg-roundtrip"
  ) {
    return FLATTEN_BACKGROUND_COLOR;
  }
  // PNG（lossless / compressed）・WebP・AVIF・JXL はアルファを保持できるため合成しない
  return null;
};

/**
 * 変換オプションから出力サイズを計算する
 * @param srcWidth - 元画像の幅
 * @param srcHeight - 元画像の高さ
 * @param options - 変換オプション（サイズ指定・アスペクト比維持）
 * @returns 出力する幅と高さ
 */
export const calculateTargetSize = (
  srcWidth: number,
  srcHeight: number,
  options: Pick<ConversionOptions, "width" | "height" | "maintainAspectRatio">,
): { width: number; height: number } => {
  let width = srcWidth;
  let height = srcHeight;

  if (options.width || options.height) {
    if (options.maintainAspectRatio) {
      const aspectRatio = srcWidth / srcHeight;

      if (options.width && options.height) {
        // 両方指定されている場合、アスペクト比を維持して小さい方に合わせる
        const targetRatio = options.width / options.height;
        if (aspectRatio > targetRatio) {
          width = options.width;
          height = options.width / aspectRatio;
        } else {
          height = options.height;
          width = options.height * aspectRatio;
        }
      } else if (options.width) {
        width = options.width;
        height = options.width / aspectRatio;
      } else if (options.height) {
        height = options.height;
        width = options.height * aspectRatio;
      }
    } else {
      width = options.width || width;
      height = options.height || height;
    }
  }

  return { width, height };
};
