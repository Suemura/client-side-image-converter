import piexif from "piexifjs";
import { encodeCanvasToAvifBlob } from "./avifEncoder";
import { isHeicFile, isTiffFile } from "./fileUtils";
import { decodeHeicToCanvas } from "./heicDecoder";
import { dataUrlToBlob } from "./imageUtils";
import { decodeTiffToCanvas } from "./tiffDecoder";

export type ConversionFormat = "jpeg" | "png" | "webp" | "avif";

export interface ConversionOptions {
  format: ConversionFormat;
  quality: number; // 0-100
  width?: number;
  height?: number;
  maintainAspectRatio: boolean;
  preserveExif?: boolean;
  /**
   * 目標ファイルサイズ（KB）。指定すると品質値を二分探索し、目標サイズ以下で最大品質の結果を採用する。
   * JPEG / WebP でのみ有効（PNG は可逆・AVIF は WASM エンコードが低速なため対象外）。
   * 未指定または 0 以下の場合は quality をそのまま使う。
   */
  targetFileSizeKB?: number;
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
      exifData: string | null,
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

          // Exifデータを挿入する処理
          const processBlob = async (finalBlob: Blob) => {
            const url = URL.createObjectURL(finalBlob);
            const originalFilename = file.name;
            const nameWithoutExt =
              originalFilename.substring(
                0,
                originalFilename.lastIndexOf("."),
              ) || originalFilename;
            const filename = `${nameWithoutExt}.${options.format}`;

            // ファイルオブジェクトを作成
            const resultFile = new File([finalBlob], filename, {
              type: finalBlob.type,
            });

            resolve({
              blob: finalBlob,
              url,
              originalSize: file.size,
              convertedSize: finalBlob.size,
              filename,
              originalFilename: file.name,
              file: resultFile,
              targetSizeAchieved,
            });
          };

          // ExifデータをBlobに挿入（JPEGのみ）
          if (exifData && options.format === "jpeg") {
            const reader2 = new FileReader();
            reader2.onload = (e2) => {
              try {
                const dataUrl = e2.target?.result as string;
                if (!dataUrl || !exifData) {
                  console.warn("Failed to read data URL for EXIF insertion");
                  processBlob(blob);
                  return;
                }
                const newDataUrl = piexif.insert(exifData, dataUrl);
                const newBlob = dataUrlToBlob(newDataUrl, blob.type);
                processBlob(newBlob);
              } catch (error) {
                console.warn("Failed to insert EXIF data:", error);
                processBlob(blob);
              }
            };
            reader2.readAsDataURL(blob);
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
          // 既知の制限: JPEG で preserveExif も有効な場合、探索は EXIF 挿入前のサイズに対して
          // 行われるため（EXIF は handleBlob 内で後挿入する）、最終物は EXIF 分だけ目標を
          // わずかに超えうる。preserveExif は既定 false かつ超過幅は小さいため許容する。
          const shouldSearchTargetSize =
            options.targetFileSizeKB !== undefined &&
            options.targetFileSizeKB > 0;

          if (shouldSearchTargetSize) {
            const targetSizeBytes = (options.targetFileSizeKB as number) * 1024;
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

    // Exifデータを読み込む（JPEGの場合のみ）
    const shouldPreserveExif =
      options.preserveExif &&
      (file.type.includes("jpeg") || file.type.includes("jpg")) &&
      options.format === "jpeg";

    const reader = new FileReader();
    reader.onload = (e) => {
      let exifData: string | null = null;
      if (shouldPreserveExif) {
        try {
          const imageData = e.target?.result as string;
          exifData = piexif.dump(piexif.load(imageData));
        } catch (error) {
          console.warn("Failed to read EXIF data:", error);
        }
      }

      const img = new Image();
      img.onload = () => {
        processSource(img, img.width, img.height, exifData);
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
 */
export const convertMultipleImages = async (
  files: File[],
  options: ConversionOptions,
  onProgress?: (current: number, total: number) => void,
): Promise<BatchConversionResult> => {
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
  // 品質値に基づいて出力戦略を変更
  if (quality >= 95) {
    // 高品質: 標準PNG出力
    canvas.toBlob(callback, "image/png");
  } else if (quality >= 70) {
    // 中品質: 少し圧縮
    canvas.toBlob(callback, "image/png", 0.92);
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
