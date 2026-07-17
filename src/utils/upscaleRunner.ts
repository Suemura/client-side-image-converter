/**
 * AI 超解像のバッチ実行オーケストレーション（メインスレッド側）。
 *
 * Worker（upscale.worker.ts）で 1 ファイルずつ逐次処理する（推論自体が
 * GPU / CPU を飽和させるため、convert のようなファイル並列はしない）。
 * Worker 非対応環境ではメインスレッドで同じエンジン（imageUpscaler.ts）を実行する。
 *
 * キャンセルは Worker への cancel メッセージ（タイル境界での協調停止）を送った上で
 * terminate による即時停止も行い、バッチ全体を cancelled として返す。
 */

import type {
  UpscaleWorkerEvent,
  UpscaleWorkerRequest,
} from "../workers/upscaleMessages";
import {
  exifWritableFormat,
  insertExifIntoBlob,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "./exifTransfer";
import { appendFileNameSuffix } from "./fileName";
import { type CropResult, renderOrientedImage } from "./imageCropper";
import {
  createUpscaleEngine,
  UpscaleCancelledError,
  type UpscaleDownloadCallback,
  type UpscaleEngine,
  upscaleRgba,
} from "./imageUpscaler";
import {
  isUpscalableSize,
  MAX_UPSCALE_INPUT_DIMENSION,
  type UpscaleScale,
} from "./upscaleCore";

/** 出力ファイル名のサフィックス */
const UPSCALED_SUFFIX = "_upscaled";

/** バッチ実行のオプション */
export interface UpscaleBatchOptions {
  scale: UpscaleScale;
  preserveExif: boolean;
}

/** バッチ実行の進捗コールバック */
export interface UpscaleBatchCallbacks {
  /** モデル / ランタイムのダウンロード進捗 */
  onDownloadProgress?: UpscaleDownloadCallback;
  /**
   * ファイル単位の進捗。tileFraction は現在ファイルのタイル推論の進み（0..1）
   * @param fileIndex - 処理中ファイルの 0 始まりインデックス
   */
  onFileProgress?: (
    fileIndex: number,
    totalFiles: number,
    tileFraction: number,
  ) => void;
}

/** バッチ実行の結果 */
export interface UpscaleBatchResult {
  results: CropResult[];
  /** キャンセルで中断された場合 true（results には完了済みぶんだけ入る） */
  cancelled: boolean;
}

/** 実行中のバッチを制御するハンドル */
export interface UpscaleBatchHandle {
  promise: Promise<UpscaleBatchResult>;
  cancel: () => void;
}

/** Worker 経路が使える環境かを判定する */
export const isUpscaleWorkerSupported = (): boolean =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap === "function";

/** 失敗ファイルを CropResult 形式（success: false）へ変換する */
const toFailure = (file: File, error: unknown): CropResult => ({
  originalFile: file,
  croppedBlob: new Blob(),
  fileName: file.name,
  success: false,
  error: error instanceof Error ? error.message : String(error),
});

/** 成功結果を CropResult 形式へ組み立てる（redactImage と同型） */
const toSuccess = (file: File, blob: Blob): CropResult => {
  const fileName = appendFileNameSuffix(file.name, UPSCALED_SUFFIX);
  return {
    originalFile: file,
    croppedBlob: blob,
    fileName,
    success: true,
    croppedFile: new File([blob], fileName, { type: blob.type }),
  };
};

/** Worker 経路でのバッチ実行 */
const runWithWorker = (
  files: File[],
  options: UpscaleBatchOptions,
  callbacks: UpscaleBatchCallbacks,
): UpscaleBatchHandle => {
  const worker = new Worker(
    new URL("../workers/upscale.worker.ts", import.meta.url),
    { type: "module" },
  );
  let cancelled = false;
  // 実行中ジョブの応答待ちを外から解決するフック。terminate すると Worker からの
  // 応答は二度と来ないため、cancel() はこれを使って待ちを即座に打ち切る
  let resolveCurrentAsCancelled: (() => void) | null = null;

  const promise = (async (): Promise<UpscaleBatchResult> => {
    const results: CropResult[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelled) {
          break;
        }
        const file = files[i];
        callbacks.onFileProgress?.(i, files.length, 0);
        const buffer = await file.arrayBuffer();
        const response = await new Promise<
          Extract<UpscaleWorkerEvent, { type: "result" }>
        >((resolve, reject) => {
          resolveCurrentAsCancelled = () =>
            resolve({
              type: "result",
              id: i,
              ok: false,
              cancelled: true,
              error: "cancelled",
            });
          if (cancelled) {
            resolveCurrentAsCancelled();
            return;
          }
          worker.onmessage = (event: MessageEvent<UpscaleWorkerEvent>) => {
            const message = event.data;
            if (message.type === "download") {
              callbacks.onDownloadProgress?.(
                message.stage,
                message.loadedBytes,
                message.totalBytes,
              );
            } else if (message.type === "tile") {
              callbacks.onFileProgress?.(
                i,
                files.length,
                message.completedTiles / message.totalTiles,
              );
            } else if (message.id === req.id) {
              resolve(message);
            }
          };
          worker.onerror = (event) => {
            reject(new Error(event.message || "Worker error"));
          };
          const req: Extract<UpscaleWorkerRequest, { type: "upscale" }> = {
            type: "upscale",
            id: i,
            buffer,
            fileType: file.type,
            scale: options.scale,
            preserveExif: options.preserveExif,
          };
          worker.postMessage(req, [buffer]);
        });
        resolveCurrentAsCancelled = null;

        if (response.ok) {
          results.push(
            toSuccess(
              file,
              new Blob([response.buffer], { type: response.mime }),
            ),
          );
        } else if (response.cancelled) {
          break;
        } else {
          results.push(toFailure(file, new Error(response.error)));
        }
      }
    } finally {
      worker.terminate();
    }
    return { results, cancelled };
  })();

  return {
    promise,
    cancel: (): void => {
      cancelled = true;
      // 協調停止を試みつつ即時に止める（ロード中・推論中のどちらでも確実に停止する）
      const cancelMessage: UpscaleWorkerRequest = { type: "cancel" };
      try {
        worker.postMessage(cancelMessage);
      } catch {
        // terminate 済み等は無視する
      }
      worker.terminate();
      // terminate 後は Worker からの応答が来ないため、応答待ちをここで打ち切る
      resolveCurrentAsCancelled?.();
    },
  };
};

/** メインスレッド経路のエンジン（1 度だけ生成して使い回す） */
let mainEnginePromise: Promise<UpscaleEngine> | null = null;

/** メインスレッド経路での 1 ファイル処理（redactImage と同型の EXIF フロー） */
const upscaleImageOnMain = async (
  file: File,
  options: UpscaleBatchOptions,
  engine: UpscaleEngine,
  onTileProgress: (completed: number, total: number) => void,
  shouldCancel: () => boolean,
): Promise<CropResult> => {
  try {
    const exifFormat = exifWritableFormat(file.type);
    let exifTiff: Uint8Array | null = null;
    if (options.preserveExif && exifFormat) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      exifTiff = await readExifTiffFromDataUrl(dataUrl, file.type);
    }

    const canvas = await renderOrientedImage(file);
    if (!isUpscalableSize(canvas.width, canvas.height)) {
      throw new Error(
        `画像が大きすぎます（長辺 ${MAX_UPSCALE_INPUT_DIMENSION}px まで） / Image too large (max ${MAX_UPSCALE_INPUT_DIMENSION}px on the long side)`,
      );
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context を取得できませんでした");
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const result = await upscaleRgba(
      imageData.data,
      imageData.width,
      imageData.height,
      options.scale,
      engine,
      { onTileProgress, shouldCancel },
    );

    const outCanvas = document.createElement("canvas");
    outCanvas.width = result.width;
    outCanvas.height = result.height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) {
      throw new Error("Canvas context を取得できませんでした");
    }
    outCtx.putImageData(
      new ImageData(result.data, result.width, result.height),
      0,
      0,
    );

    let blob = await new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
        file.type || "image/png",
        0.95,
      );
    });

    if (exifTiff && exifFormat) {
      try {
        const normalized = await normalizeExifForBakedImage(
          exifTiff,
          result.width,
          result.height,
        );
        blob = await insertExifIntoBlob(
          blob,
          normalized,
          exifFormat,
          result.width,
          result.height,
        );
      } catch (error) {
        console.warn("Failed to insert EXIF data:", error);
      }
    }

    return toSuccess(file, blob);
  } catch (error) {
    if (error instanceof UpscaleCancelledError) {
      throw error;
    }
    return toFailure(file, error);
  }
};

/** メインスレッド経路でのバッチ実行（Worker 非対応環境のフォールバック） */
const runOnMainThread = (
  files: File[],
  options: UpscaleBatchOptions,
  callbacks: UpscaleBatchCallbacks,
): UpscaleBatchHandle => {
  let cancelled = false;

  const promise = (async (): Promise<UpscaleBatchResult> => {
    if (!mainEnginePromise) {
      mainEnginePromise = createUpscaleEngine(
        callbacks.onDownloadProgress,
      ).catch((error) => {
        mainEnginePromise = null;
        throw error;
      });
    }
    const results: CropResult[] = [];
    let engine: UpscaleEngine;
    try {
      engine = await mainEnginePromise;
    } catch (error) {
      return {
        results: files.map((file) => toFailure(file, error)),
        cancelled,
      };
    }
    for (let i = 0; i < files.length; i++) {
      if (cancelled) {
        break;
      }
      callbacks.onFileProgress?.(i, files.length, 0);
      try {
        results.push(
          await upscaleImageOnMain(
            files[i],
            options,
            engine,
            (completed, total) =>
              callbacks.onFileProgress?.(i, files.length, completed / total),
            () => cancelled,
          ),
        );
      } catch (error) {
        if (error instanceof UpscaleCancelledError) {
          break;
        }
        results.push(toFailure(files[i], error));
      }
    }
    return { results, cancelled };
  })();

  return {
    promise,
    cancel: (): void => {
      cancelled = true;
    },
  };
};

/**
 * ファイル群を指定倍率でアップスケールするバッチを開始する。
 * 返り値の cancel() でいつでも中断できる（結果は cancelled: true で解決する）。
 */
export const runUpscaleBatch = (
  files: File[],
  options: UpscaleBatchOptions,
  callbacks: UpscaleBatchCallbacks = {},
): UpscaleBatchHandle =>
  isUpscaleWorkerSupported()
    ? runWithWorker(files, options, callbacks)
    : runOnMainThread(files, options, callbacks);
