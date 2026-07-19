/**
 * 背景除去のバッチ実行オーケストレーション（メインスレッド側）。
 *
 * Worker（removeBg.worker.ts）で 1 ファイルずつ逐次処理する（推論自体が
 * GPU / CPU を飽和させるため、convert のようなファイル並列はしない）。
 * Worker 非対応環境ではメインスレッドで同じエンジン（imageBackgroundRemover.ts）を
 * 実行する。upscaleRunner.ts と同型の構成。
 *
 * キャンセルは Worker への cancel メッセージ（推論前境界での協調停止）を送った上で
 * terminate による即時停止も行い、バッチ全体を cancelled として返す。
 */

import type {
  RemoveBgWorkerEvent,
  RemoveBgWorkerRequest,
} from "../workers/removeBgMessages";
import {
  exifWritableFormat,
  insertExifIntoBlob,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "./exifTransfer";
import { appendFileNameSuffix, replaceFileExtension } from "./fileName";
import {
  createRemoveBgEngine,
  RemoveBgCancelledError,
  type RemoveBgDownloadCallback,
  type RemoveBgEngine,
  removeBackgroundRgba,
} from "./imageBackgroundRemover";
import { type CropResult, renderOrientedImage } from "./imageCropper";
import {
  isRemovableSize,
  MAX_REMOVE_BG_INPUT_DIMENSION,
  type RemoveBgOutputFormat,
  removeBgOutputMime,
} from "./removeBgCore";

/** 出力ファイル名のサフィックス */
const REMOVE_BG_SUFFIX = "_nobg";

/** バッチ実行のオプション */
export interface RemoveBgBatchOptions {
  outputFormat: RemoveBgOutputFormat;
  preserveExif: boolean;
}

/** バッチ実行の進捗コールバック */
export interface RemoveBgBatchCallbacks {
  /** モデル / ランタイムのダウンロード進捗 */
  onDownloadProgress?: RemoveBgDownloadCallback;
  /** ファイル単位の進捗（fileIndex は処理中ファイルの 0 始まりインデックス） */
  onFileProgress?: (fileIndex: number, totalFiles: number) => void;
}

/** バッチ実行の結果 */
export interface RemoveBgBatchResult {
  results: CropResult[];
  /** キャンセルで中断された場合 true（results には完了済みぶんだけ入る） */
  cancelled: boolean;
}

/** 実行中のバッチを制御するハンドル */
export interface RemoveBgBatchHandle {
  promise: Promise<RemoveBgBatchResult>;
  cancel: () => void;
}

/** Worker 経路が使える環境かを判定する */
export const isRemoveBgWorkerSupported = (): boolean =>
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap === "function";

/**
 * 出力ファイル名を組み立てる（`_nobg` サフィックス + 出力形式の拡張子）。
 * 元形式と異なる形式で出力するため、拡張子は実際のエンコード結果に合わせる。
 */
export const buildRemoveBgFileName = (
  originalName: string,
  outputMime: string,
): string =>
  replaceFileExtension(
    appendFileNameSuffix(originalName, REMOVE_BG_SUFFIX),
    outputMime === "image/webp" ? "webp" : "png",
  );

/** 失敗ファイルを CropResult 形式（success: false）へ変換する */
const toFailure = (file: File, error: unknown): CropResult => ({
  originalFile: file,
  croppedBlob: new Blob(),
  fileName: file.name,
  success: false,
  error: error instanceof Error ? error.message : String(error),
});

/** 成功結果を CropResult 形式へ組み立てる（upscaleRunner と同型） */
const toSuccess = (file: File, blob: Blob): CropResult => {
  const fileName = buildRemoveBgFileName(file.name, blob.type);
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
  options: RemoveBgBatchOptions,
  callbacks: RemoveBgBatchCallbacks,
): RemoveBgBatchHandle => {
  const worker = new Worker(
    new URL("../workers/removeBg.worker.ts", import.meta.url),
    { type: "module" },
  );
  let cancelled = false;
  // 実行中ジョブの応答待ちを外から解決するフック。terminate すると Worker からの
  // 応答は二度と来ないため、cancel() はこれを使って待ちを即座に打ち切る
  let resolveCurrentAsCancelled: (() => void) | null = null;

  const promise = (async (): Promise<RemoveBgBatchResult> => {
    const results: CropResult[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelled) {
          break;
        }
        const file = files[i];
        callbacks.onFileProgress?.(i, files.length);
        const buffer = await file.arrayBuffer();
        const response = await new Promise<
          Extract<RemoveBgWorkerEvent, { type: "result" }>
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
          const req: Extract<RemoveBgWorkerRequest, { type: "removeBg" }> = {
            type: "removeBg",
            id: i,
            buffer,
            fileType: file.type,
            outputFormat: options.outputFormat,
            preserveExif: options.preserveExif,
          };
          worker.onmessage = (event: MessageEvent<RemoveBgWorkerEvent>) => {
            const message = event.data;
            if (message.type === "download") {
              callbacks.onDownloadProgress?.(
                message.stage,
                message.loadedBytes,
                message.totalBytes,
              );
            } else if (message.id === req.id) {
              resolve(message);
            }
          };
          worker.onerror = (event) => {
            reject(new Error(event.message || "Worker error"));
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
      if (!cancelled && files.length > 0) {
        // 最後の 1 枚の完了を UI へ伝える（体感進捗を 100% まで進める）
        callbacks.onFileProgress?.(files.length, files.length);
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
      const cancelMessage: RemoveBgWorkerRequest = { type: "cancel" };
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
let mainEnginePromise: Promise<RemoveBgEngine> | null = null;

/** メインスレッド経路での 1 ファイル処理（upscaleRunner と同型の EXIF フロー） */
const removeBgImageOnMain = async (
  file: File,
  options: RemoveBgBatchOptions,
  engine: RemoveBgEngine,
): Promise<CropResult> => {
  try {
    const outputMime = removeBgOutputMime(options.outputFormat);
    const inputExifFormat = exifWritableFormat(file.type);
    let exifTiff: Uint8Array | null = null;
    if (options.preserveExif && inputExifFormat) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      exifTiff = await readExifTiffFromDataUrl(dataUrl, file.type);
    }

    const canvas = await renderOrientedImage(file);
    if (!isRemovableSize(canvas.width, canvas.height)) {
      throw new Error(
        `画像が大きすぎます（長辺 ${MAX_REMOVE_BG_INPUT_DIMENSION}px まで） / Image too large (max ${MAX_REMOVE_BG_INPUT_DIMENSION}px on the long side)`,
      );
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context を取得できませんでした");
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const resultRgba = await removeBackgroundRgba(
      imageData.data,
      imageData.width,
      imageData.height,
      engine,
    );

    const outCanvas = document.createElement("canvas");
    outCanvas.width = imageData.width;
    outCanvas.height = imageData.height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) {
      throw new Error("Canvas context を取得できませんでした");
    }
    outCtx.putImageData(
      new ImageData(resultRgba, imageData.width, imageData.height),
      0,
      0,
    );

    // 透過を保持できる形式でエンコードする（toBlob 非対応形式は PNG になる）
    let blob = await new Promise<Blob>((resolve, reject) => {
      outCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
        outputMime,
      );
    });

    const outputExifFormat = exifWritableFormat(blob.type);
    if (exifTiff && outputExifFormat) {
      try {
        const normalized = await normalizeExifForBakedImage(
          exifTiff,
          imageData.width,
          imageData.height,
        );
        blob = await insertExifIntoBlob(
          blob,
          normalized,
          outputExifFormat,
          imageData.width,
          imageData.height,
        );
      } catch (error) {
        console.warn("Failed to insert EXIF data:", error);
      }
    }

    return toSuccess(file, blob);
  } catch (error) {
    if (error instanceof RemoveBgCancelledError) {
      throw error;
    }
    return toFailure(file, error);
  }
};

/** メインスレッド経路でのバッチ実行（Worker 非対応環境のフォールバック） */
const runOnMainThread = (
  files: File[],
  options: RemoveBgBatchOptions,
  callbacks: RemoveBgBatchCallbacks,
): RemoveBgBatchHandle => {
  let cancelled = false;

  const promise = (async (): Promise<RemoveBgBatchResult> => {
    if (!mainEnginePromise) {
      mainEnginePromise = createRemoveBgEngine(
        callbacks.onDownloadProgress,
      ).catch((error) => {
        mainEnginePromise = null;
        throw error;
      });
    }
    const results: CropResult[] = [];
    let engine: RemoveBgEngine;
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
      callbacks.onFileProgress?.(i, files.length);
      try {
        results.push(await removeBgImageOnMain(files[i], options, engine));
      } catch (error) {
        if (error instanceof RemoveBgCancelledError) {
          break;
        }
        results.push(toFailure(files[i], error));
      }
    }
    if (!cancelled && files.length > 0) {
      // 最後の 1 枚の完了を UI へ伝える（体感進捗を 100% まで進める）
      callbacks.onFileProgress?.(files.length, files.length);
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
 * ファイル群の背景を除去するバッチを開始する。
 * 返り値の cancel() でいつでも中断できる（結果は cancelled: true で解決する）。
 */
export const runRemoveBgBatch = (
  files: File[],
  options: RemoveBgBatchOptions,
  callbacks: RemoveBgBatchCallbacks = {},
): RemoveBgBatchHandle =>
  isRemoveBgWorkerSupported()
    ? runWithWorker(files, options, callbacks)
    : runOnMainThread(files, options, callbacks);
