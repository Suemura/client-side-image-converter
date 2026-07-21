/**
 * 画像編集（ライト/カラー調整）のブラウザ側オーケストレーション。
 *
 * EXIF Orientation を補正したソースへ調整を適用し（`webglImageRenderer` の WebGL / CPU パス）、
 * 出力フォーマットへエンコードして EXIF を引き継ぐ。`imageCropper.ts` の
 * `renderOrientedImage` / `cropImages` に相当し、プレビューと出力で同一の描画経路を通す（WYSIWYG）。
 *
 * Canvas / WebGL に依存するため単体テスト対象外（実ブラウザ動作は E2E で検証）。
 */

import {
  type AdjustmentState,
  clampAdjustments,
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustments,
} from "./adjustments";
import { encodeCanvasToAvifBlob } from "./avifEncoder";
import {
  type ConversionFailure,
  type ConversionFormat,
  type ConversionResult,
  resolveFlattenBackground,
} from "./conversionCore";
import { buildEditResult } from "./conversionResult";
import {
  exifWritableFormat,
  insertExifIntoBlob,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "./exifTransfer";
import { renderOrientedImage } from "./imageCropper";
import { fileToDataUrl } from "./imageUtils";
import { encodeCanvasToJxlBlob } from "./jxlEncoder";
import { type ResizeRequest, resolveResizeDimensions } from "./studioCore";
import {
  type AdjustmentRenderer,
  applyAdjustmentsToCanvas,
  createAdjustmentRenderer,
  type LutApplication,
} from "./webglImageRenderer";

/** 出力フォーマット。"original" は入力と同じ形式を維持する（非エンコード形式は PNG へ） */
export type EditOutputFormat = "original" | ConversionFormat;

/** 1 ファイル分の編集指示 */
export interface EditJob {
  adjustments: AdjustmentState;
  /** 適用する LUT（未指定 / null は LUT なし） */
  lut?: LutApplication | null;
  /** 適用するトーンカーブの焼成テーブル（`buildToneCurveTable`。未指定 / null は恒等スキップ） */
  curve?: Float32Array | null;
}

/** 編集の出力オプション */
export interface EditOptions {
  /** EXIF を保持するか（AVIF 出力・非対応形式では無視される。既存 convert / crop と同基準） */
  preserveExif?: boolean;
  /** 出力フォーマット（既定は "original" = 元形式維持） */
  outputFormat?: EditOutputFormat;
  /** ロッシー形式（JPEG / WebP）の品質 0-1（既定 0.92）。AVIF は 1-100 へ換算する */
  quality?: number;
  /**
   * 出力リサイズ指定（/studio の書き出し用）。ファイルごとの実寸から
   * `resolveResizeDimensions` で出力寸法を解決する。未指定は原寸のまま（既定挙動不変）
   */
  resize?: ResizeRequest;
}

/** 編集バッチの結果（成功結果と失敗ファイルの両方を返す。convert 経路と同形） */
export interface BatchEditResult {
  results: ConversionResult[];
  failures: ConversionFailure[];
}

const DEFAULT_QUALITY = 0.92;

/** ファイルの MIME からネイティブにエンコードできる出力フォーマットを推定する */
const inferOriginalFormat = (fileType: string): ConversionFormat => {
  if (fileType.includes("jpeg") || fileType.includes("jpg")) {
    return "jpeg";
  }
  if (fileType.includes("webp")) {
    return "webp";
  }
  if (fileType.includes("avif")) {
    return "avif";
  }
  // PNG、および Canvas がエンコードできない BMP 等はロスレスな PNG で出力する
  return "png";
};

const FORMAT_MIME: Record<ConversionFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  jxl: "image/jxl",
};

/** 出力フォーマット指定と入力形式から、実際の出力フォーマットを解決する */
const resolveOutputFormat = (
  file: File,
  outputFormat: EditOutputFormat,
): ConversionFormat =>
  outputFormat === "original" ? inferOriginalFormat(file.type) : outputFormat;

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob"));
        }
      },
      mime,
      quality,
    );
  });

/**
 * 1 ファイルへ調整（+ 任意でトーンカーブ / LUT）を適用してエンコードし `ConversionResult` を返す。
 * renderer（WebGL）を渡すと GPU 描画、null のとき CPU フォールバックを使う。
 */
export const renderEdited = async (
  file: File,
  adjustments: AdjustmentState,
  lut: LutApplication | null = null,
  curve: Float32Array | null = null,
  options: EditOptions = {},
  renderer: AdjustmentRenderer | null = null,
): Promise<ConversionResult> => {
  const { preserveExif = false, outputFormat = "original" } = options;
  const quality = options.quality ?? DEFAULT_QUALITY;

  // EXIF Orientation を補正した（向きを焼き込んだ）ソース canvas
  const orientedCanvas = await renderOrientedImage(file);
  const width = orientedCanvas.width;
  const height = orientedCanvas.height;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions");
  }

  // 調整（+ トーンカーブ / LUT）を適用（GPU / CPU）した canvas を、エンコード用の 2D canvas へ転写する。
  // GL canvas は getImageData / toBlob の取り回しのため必ず 2D canvas へコピーしてから扱う。
  const normalized = normalizeAdjustments(clampAdjustments(adjustments));
  const adjustedCanvas = applyAdjustmentsToCanvas(
    orientedCanvas,
    width,
    height,
    normalized,
    renderer,
    lut,
    curve,
  );
  // 出力リサイズ（/studio の書き出し）。未指定・同寸は原寸のまま
  const resized = options.resize
    ? resolveResizeDimensions(width, height, options.resize)
    : null;
  const outputWidth = resized?.width ?? width;
  const outputHeight = resized?.height ?? height;
  const encodeCanvas = document.createElement("canvas");
  encodeCanvas.width = outputWidth;
  encodeCanvas.height = outputHeight;
  const encodeCtx = encodeCanvas.getContext("2d");
  if (!encodeCtx) {
    throw new Error("Canvas 2D context is not supported");
  }
  const format = resolveOutputFormat(file, outputFormat);
  const mime = FORMAT_MIME[format];

  // アルファ非対応出力（JPEG）では透過部分が黒くならないよう描画前に背景色を合成する
  // （Issue #108。convert 経路と同じ純粋関数で判定する。quality は渡さない =
  // PNG 出力はネイティブエンコードのためアルファを保持する）
  const background = resolveFlattenBackground(format);
  if (background) {
    encodeCtx.fillStyle = background;
    encodeCtx.fillRect(0, 0, outputWidth, outputHeight);
  }
  encodeCtx.drawImage(adjustedCanvas, 0, 0, outputWidth, outputHeight);

  // エンコード（AVIF / JXL は WASM、その他は Canvas.toBlob）
  let blob =
    format === "avif"
      ? await encodeCanvasToAvifBlob(encodeCanvas, Math.round(quality * 100))
      : format === "jxl"
        ? await encodeCanvasToJxlBlob(encodeCanvas, Math.round(quality * 100))
        : await canvasToBlob(encodeCanvas, mime, quality);

  // EXIF 保持（出力が書き込み可能形式かつソースに読み取り可能な EXIF がある場合のみ）。
  // 向き・寸法はピクセルへ焼き込み済みのため Orientation を 1 に正規化し寸法タグを揃える（crop 経路と同じ）。
  const writableFormat = exifWritableFormat(mime);
  if (preserveExif && writableFormat) {
    try {
      const dataUrl = await fileToDataUrl(file);
      const exifTiff = await readExifTiffFromDataUrl(dataUrl, file.type);
      if (exifTiff) {
        const normalizedExif = await normalizeExifForBakedImage(
          exifTiff,
          outputWidth,
          outputHeight,
        );
        blob = await insertExifIntoBlob(
          blob,
          normalizedExif,
          writableFormat,
          outputWidth,
          outputHeight,
        );
      }
    } catch (error) {
      console.warn("Failed to insert EXIF data:", error);
    }
  }

  return buildEditResult(file, blob, format);
};

/**
 * 複数の画像へ一括で調整を適用する。
 * WebGL レンダラを 1 個だけ生成して全ファイルで使い回し（コンテキスト枯渇を防ぐ）、
 * 最後に必ず dispose する。個別のファイルで失敗しても他を止めず、失敗一覧として返す。
 * jobs は files と同じインデックスで調整を指定する（未指定インデックスは無調整）。
 */
export const editImages = async (
  files: File[],
  jobs: EditJob[],
  onProgress?: (completed: number, total: number) => void,
  options: EditOptions = {},
): Promise<BatchEditResult> => {
  // createAdjustmentRenderer() は WebGL2 非対応（document 未定義 / getContext 失敗 / シェーダ
  // コンパイル失敗）でいずれも null を返すため、事前の可用性チェックは不要。
  // null のとき呼び出し先（applyAdjustmentsToCanvas）が CPU フォールバックへ切り替わる。
  const renderer = createAdjustmentRenderer();

  const results: ConversionResult[] = [];
  const failures: ConversionFailure[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const adjustments = jobs[i]?.adjustments ?? DEFAULT_ADJUSTMENTS;
      const lut = jobs[i]?.lut ?? null;
      const curve = jobs[i]?.curve ?? null;
      try {
        results.push(
          await renderEdited(
            files[i],
            adjustments,
            lut,
            curve,
            options,
            renderer,
          ),
        );
      } catch (error) {
        console.error("Edit error:", error);
        failures.push({ fileName: files[i].name });
      }
      onProgress?.(i + 1, files.length);
    }
  } finally {
    renderer?.dispose();
  }

  return { results, failures };
};
