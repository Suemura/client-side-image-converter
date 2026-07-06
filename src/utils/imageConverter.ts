import {
  convertFilesWithWorkerPool,
  isOffscreenPipelineSupported,
} from "../workers/imageProcessingPool";
import { encodeCanvasToAvifBlob } from "./avifEncoder";
import {
  type BatchConversionResult,
  type ConversionFailure,
  type ConversionOptions,
  type ConversionResult,
  calculateTargetSize,
  searchQualityForTargetSize,
} from "./conversionCore";
import { buildConversionResult } from "./conversionResult";
import { insertExifIntoBlob, readExifTiffFromDataUrl } from "./exifTransfer";
import { isHeicFile, isTiffFile } from "./fileUtils";
import { decodeHeicToCanvas } from "./heicDecoder";
import { PNG_COMPRESSED_QUALITY_HINT, pngQualityStrategy } from "./pngQuality";
import { decodeTiffToCanvas } from "./tiffDecoder";

// 型・純粋ロジックは Canvas 非依存の conversionCore に集約している。
// 既存のインポート経路を壊さないよう imageConverter からも再エクスポートする。
export type {
  BatchConversionResult,
  ConversionFailure,
  ConversionFormat,
  ConversionOptions,
  ConversionResult,
  QualitySearchOptions,
  QualitySearchResult,
} from "./conversionCore";
export {
  calculateTargetSize,
  searchQualityForTargetSize,
} from "./conversionCore";

/**
 * 画像を指定されたオプションで変換する
 */
export const convertImage = async (
  file: File,
  options: ConversionOptions,
): Promise<ConversionResult> => {
  return new Promise((resolve, reject) => {
    if (
      !file.type.startsWith("image/") &&
      !isHeicFile(file) &&
      !isTiffFile(file)
    ) {
      reject(new Error("選択されたファイルは画像ではありません"));
      return;
    }

    // デコード済みの画像ソースを Canvas に描画してエンコードする（全フォーマット共通の変換経路）
    const processSource = (
      source: CanvasImageSource,
      srcWidth: number,
      srcHeight: number,
      exifTiff: Uint8Array | null,
    ) => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas context を取得できませんでした"));
          return;
        }

        // サイズ計算
        const { width, height } = calculateTargetSize(
          srcWidth,
          srcHeight,
          options,
        );

        canvas.width = width;
        canvas.height = height;

        // 画像を描画
        ctx.drawImage(source, 0, 0, width, height);

        // 変換後の処理を共通化
        // targetSizeAchieved は目標サイズ探索を行った場合のみ渡す（未指定時は undefined）
        const handleBlob = (
          blob: Blob | null,
          targetSizeAchieved?: boolean,
        ) => {
          if (!blob) {
            reject(
              new Error(
                `${options.format.toUpperCase()}画像の変換に失敗しました`,
              ),
            );
            return;
          }

          // Exif データを挿入し ConversionResult を組み立てて解決する
          const processBlob = (finalBlob: Blob) => {
            resolve(
              buildConversionResult(
                file,
                finalBlob,
                options.format,
                targetSizeAchieved,
              ),
            );
          };

          // Exif データを出力形式（JPEG / PNG / WebP）に応じて Blob に挿入する
          if (exifTiff && options.format !== "avif") {
            insertExifIntoBlob(blob, exifTiff, options.format, width, height)
              .then(processBlob)
              .catch((error) => {
                console.warn("Failed to insert EXIF data:", error);
                processBlob(blob);
              });
          } else {
            processBlob(blob);
          }
        };

        // 変換
        if (options.format === "png") {
          // PNG専用の品質制御
          convertToPngWithQuality(canvas, options.quality, handleBlob);
        } else if (options.format === "avif") {
          // AVIF は Canvas ネイティブ未対応のため WASM エンコーダーを使用
          encodeCanvasToAvifBlob(canvas, options.quality)
            .then(handleBlob)
            .catch(reject);
        } else {
          // JPEG/WebP用の標準品質制御
          const mimeType = `image/${options.format}`;

          // 目標ファイルサイズが指定されていれば品質を二分探索する（JPEG/WebP のみ）
          // 既知の制限: JPEG / WebP で preserveExif も有効な場合、探索は EXIF 挿入前のサイズに
          // 対して行われるため（EXIF は handleBlob 内で後挿入する）、最終物は EXIF 分だけ目標を
          // わずかに超えうる。preserveExif は既定 false かつ超過幅は小さいため許容する。
          // if 条件に直接展開することで TS が targetFileSizeKB を number に絞り込む
          // （別変数に切り出すと絞り込みが効かず型アサーションが必要になる）
          if (
            options.targetFileSizeKB !== undefined &&
            options.targetFileSizeKB > 0
          ) {
            const targetSizeBytes = options.targetFileSizeKB * 1024;
            // Canvas.toBlob を品質可変の Promise 化エンコード関数として探索に注入する
            const encode = (quality: number): Promise<Blob> =>
              new Promise((resolveEncode, rejectEncode) => {
                canvas.toBlob(
                  (blob) => {
                    if (blob) {
                      resolveEncode(blob);
                    } else {
                      rejectEncode(
                        new Error(
                          `${options.format.toUpperCase()}画像の変換に失敗しました`,
                        ),
                      );
                    }
                  },
                  mimeType,
                  quality / 100,
                );
              });

            searchQualityForTargetSize(encode, targetSizeBytes)
              .then((result) => handleBlob(result.blob, result.achieved))
              .catch(reject);
          } else {
            const quality = options.quality / 100;
            canvas.toBlob(handleBlob, mimeType, quality);
          }
        }
      } catch (error) {
        reject(error);
      }
    };

    // HEIC はブラウザの Image でデコードできないため WASM デコーダーで Canvas に展開する
    if (isHeicFile(file)) {
      decodeHeicToCanvas(file)
        .then((decoded) =>
          processSource(decoded, decoded.width, decoded.height, null),
        )
        .catch(reject);
      return;
    }

    // TIFF もブラウザの Image でデコードできないため utif2 デコーダーで Canvas に展開する
    if (isTiffFile(file)) {
      decodeTiffToCanvas(file)
        .then((decoded) =>
          processSource(decoded, decoded.width, decoded.height, null),
        )
        .catch(reject);
      return;
    }

    // EXIF 保持は AVIF 以外の出力（JPEG / PNG / WebP）で有効。
    // ソース側は JPEG / WebP / PNG から EXIF を読み取れる（readSourceExifTiff）
    const shouldPreserveExif =
      options.preserveExif === true && options.format !== "avif";

    const reader = new FileReader();
    reader.onload = (e) => {
      let exifTiff: Uint8Array | null = null;
      if (shouldPreserveExif) {
        exifTiff = readExifTiffFromDataUrl(
          e.target?.result as string,
          file.type,
        );
      }

      const img = new Image();
      img.onload = () => {
        processSource(img, img.width, img.height, exifTiff);
      };

      img.onerror = () => {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("ファイルの読み込みに失敗しました"));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * 複数の画像を一括変換する
 * 変換に失敗したファイルがあっても処理を続行し、失敗情報を failures として返す
 *
 * 対応環境では Web Worker + OffscreenCanvas のプールで並列処理し、メインスレッド（UI）の
 * ブロックを避ける（Issue #32・#47）。非対応環境ではメインスレッドで逐次処理する。
 */
export const convertMultipleImages = async (
  files: File[],
  options: ConversionOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<BatchConversionResult> => {
  // OffscreenCanvas / Worker が使える環境ではワーカープールで並列処理する。
  // Worker が個別に失敗した場合は convertImage（メインスレッド）でフォールバックする。
  if (isOffscreenPipelineSupported()) {
    return convertFilesWithWorkerPool(files, options, onProgress, convertImage);
  }

  // フォールバック: メインスレッドで逐次変換する（従来挙動）
  const results: ConversionResult[] = [];
  const failures: ConversionFailure[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const result = await convertImage(files[i], options);
      results.push(result);
    } catch (error) {
      console.error(`ファイル ${files[i].name} の変換に失敗:`, error);
      // エラーが発生しても他のファイルの変換を続行し、失敗として記録する
      failures.push({ fileName: files[i].name });
    }
    onProgress?.(i + 1, files.length);
  }

  return { results, failures };
};

/**
 * 変換結果をダウンロードする
 */
export const downloadFile = (result: ConversionResult): void => {
  const link = document.createElement("a");
  link.href = result.url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * 複数の変換結果をダウンロードする
 */
export const downloadMultipleFiles = (results: ConversionResult[]): void => {
  results.forEach((result, index) => {
    // 複数ファイルの場合、少し遅延を入れてダウンロード
    setTimeout(() => {
      downloadFile(result);
    }, index * 100);
  });
};

/**
 * 圧縮率を計算する
 */
export const calculateCompressionRatio = (
  originalSize: number,
  convertedSize: number,
): number => {
  return Math.round(((originalSize - convertedSize) / originalSize) * 100);
};

/**
 * PNG形式で品質制御を行い変換する
 */
export const convertToPngWithQuality = (
  canvas: HTMLCanvasElement,
  quality: number,
  callback: (blob: Blob | null) => void,
): void => {
  // PNG品質制御: Canvas APIの標準的なPNG出力を使用
  // 品質ティア判定は Worker（OffscreenCanvas 版）と共有する純粋関数に集約している
  const strategy = pngQualityStrategy(quality);
  if (strategy === "lossless") {
    // 高品質: 標準PNG出力
    canvas.toBlob(callback, "image/png");
  } else if (strategy === "compressed") {
    // 中品質: 少し圧縮
    canvas.toBlob(callback, "image/png", PNG_COMPRESSED_QUALITY_HINT);
  } else {
    // 低品質: より積極的な圧縮のため、一度JPEGに変換してからPNGに
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) {
      canvas.toBlob(callback, "image/png");
      return;
    }

    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    // JPEGで圧縮してから再度Canvasに描画
    canvas.toBlob(
      (jpegBlob) => {
        if (!jpegBlob) {
          canvas.toBlob(callback, "image/png");
          return;
        }

        const img = new Image();
        img.onload = () => {
          tempCtx.drawImage(img, 0, 0);
          tempCanvas.toBlob(callback, "image/png");
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(jpegBlob);
      },
      "image/jpeg",
      quality / 100,
    );
  }
};
