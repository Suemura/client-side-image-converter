/**
 * 背景除去 Web Worker（OffscreenCanvas 経路）
 *
 * 1 メッセージ = 1 ファイルの背景除去。デコード（createImageBitmap）→
 * 推論（onnxruntime-web / removeBackgroundRgba）→ 透過形式でエンコード
 * （convertToBlob）→ EXIF 挿入までを Worker 内で完結させ、メインスレッドを
 * ブロックしない。推論エンジン（ort セッション）は Worker 内で 1 度だけ生成して
 * 使い回す。
 *
 * キャンセル: "cancel" メッセージでフラグを立て、推論開始前の境界で中断する。
 * 即時停止はメインスレッド側の terminate が担う。
 */

import {
  type ExifWritableFormat,
  exifWritableFormat,
  insertExifIntoBlob,
  normalizeExifForBakedImage,
  readExifTiffFromDataUrl,
} from "../utils/exifTransfer";
import {
  createRemoveBgEngine,
  RemoveBgCancelledError,
  type RemoveBgEngine,
  removeBackgroundRgba,
} from "../utils/imageBackgroundRemover";
import { uint8ArrayToBase64 } from "../utils/imageUtils";
import {
  isRemovableSize,
  MAX_REMOVE_BG_INPUT_DIMENSION,
  removeBgOutputMime,
} from "../utils/removeBgCore";
import type {
  RemoveBgWorkerEvent,
  RemoveBgWorkerRequest,
} from "./removeBgMessages";

/** 生成済みエンジン（初回ジョブでロードし、以降のジョブで使い回す） */
let enginePromise: Promise<RemoveBgEngine> | null = null;

/** 進行中ジョブのキャンセルフラグ（cancel メッセージで立てる） */
let cancelled = false;

const post = (event: RemoveBgWorkerEvent, transfer?: Transferable[]): void => {
  self.postMessage(event, { transfer });
};

const getEngine = (id: number): Promise<RemoveBgEngine> => {
  if (!enginePromise) {
    enginePromise = createRemoveBgEngine((stage, loadedBytes, totalBytes) => {
      post({ type: "download", id, stage, loadedBytes, totalBytes });
    }).catch((error) => {
      // ロード失敗（オフライン等）は次のジョブで再試行できるようにする
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
};

const processRequest = async (
  req: Extract<RemoveBgWorkerRequest, { type: "removeBg" }>,
): Promise<{ blob: Blob; width: number; height: number }> => {
  const { buffer, fileType, outputFormat, preserveExif } = req;
  const outputMime = removeBgOutputMime(outputFormat);

  // EXIF は元バッファから読む（デコードで失われるため先に取得する）
  const inputExifFormat = exifWritableFormat(fileType);
  let exifTiff: Uint8Array | null = null;
  if (preserveExif && inputExifFormat) {
    const dataUrl = `data:${fileType};base64,${uint8ArrayToBase64(new Uint8Array(buffer))}`;
    exifTiff = await readExifTiffFromDataUrl(dataUrl, fileType);
  }

  // EXIF Orientation は from-image で焼き込む（メインスレッド経路の renderOrientedImage と同等）
  const bitmap = await createImageBitmap(
    new Blob([buffer], { type: fileType || "application/octet-stream" }),
    { imageOrientation: "from-image" },
  );
  const srcCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) {
    bitmap.close();
    throw new Error("Canvas context を取得できませんでした");
  }
  srcCtx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = srcCtx.getImageData(
    0,
    0,
    srcCanvas.width,
    srcCanvas.height,
  );

  if (!isRemovableSize(imageData.width, imageData.height)) {
    throw new Error(
      `画像が大きすぎます（長辺 ${MAX_REMOVE_BG_INPUT_DIMENSION}px まで） / Image too large (max ${MAX_REMOVE_BG_INPUT_DIMENSION}px on the long side)`,
    );
  }

  const engine = await getEngine(req.id);
  if (cancelled) {
    throw new RemoveBgCancelledError();
  }
  const resultRgba = await removeBackgroundRgba(
    imageData.data,
    imageData.width,
    imageData.height,
    engine,
  );

  const outCanvas = new OffscreenCanvas(imageData.width, imageData.height);
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) {
    throw new Error("Canvas context を取得できませんでした");
  }
  outCtx.putImageData(
    new ImageData(resultRgba, imageData.width, imageData.height),
    0,
    0,
  );

  // 透過を保持できる形式でエンコードする（WebP 非対応環境は PNG フォールバック）
  let blob: Blob;
  try {
    blob = await outCanvas.convertToBlob({ type: outputMime });
  } catch {
    blob = await outCanvas.convertToBlob({ type: "image/png" });
  }

  // 向きは焼き込み済みのため Orientation を 1 に正規化し、寸法タグを出力へ揃えて挿入する
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
        outputExifFormat as ExifWritableFormat,
        imageData.width,
        imageData.height,
      );
    } catch (error) {
      console.warn("Failed to insert EXIF data:", error);
    }
  }

  return { blob, width: imageData.width, height: imageData.height };
};

self.onmessage = async (event: MessageEvent<RemoveBgWorkerRequest>) => {
  const req = event.data;
  if (req.type === "cancel") {
    cancelled = true;
    return;
  }
  cancelled = false;
  try {
    const { blob, width, height } = await processRequest(req);
    const buffer = await blob.arrayBuffer();
    post(
      {
        type: "result",
        id: req.id,
        ok: true,
        buffer,
        mime: blob.type,
        width,
        height,
      },
      [buffer],
    );
  } catch (error) {
    post({
      type: "result",
      id: req.id,
      ok: false,
      cancelled: error instanceof RemoveBgCancelledError,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
