/**
 * AI 超解像 Web Worker（OffscreenCanvas 経路）
 *
 * 1 メッセージ = 1 ファイルのアップスケール。デコード（createImageBitmap）→
 * タイル推論（onnxruntime-web / upscaleRgba）→ エンコード（convertToBlob）→
 * EXIF 挿入までを Worker 内で完結させ、メインスレッドをブロックしない。
 * 推論エンジン（ort セッション）は Worker 内で 1 度だけ生成して使い回す。
 *
 * キャンセル: "cancel" メッセージでフラグを立て、タイル境界で中断する
 * （upscaleRgba がタイル間で macrotask へ譲るため受信できる）。
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
  createUpscaleEngine,
  UpscaleCancelledError,
  type UpscaleEngine,
  upscaleRgba,
} from "../utils/imageUpscaler";
import { uint8ArrayToBase64 } from "../utils/imageUtils";
import {
  isUpscalableSize,
  MAX_UPSCALE_INPUT_DIMENSION,
} from "../utils/upscaleCore";
import type {
  UpscaleWorkerEvent,
  UpscaleWorkerRequest,
} from "./upscaleMessages";

/** 生成済みエンジン（初回ジョブでロードし、以降のジョブで使い回す） */
let enginePromise: Promise<UpscaleEngine> | null = null;

/** 進行中ジョブのキャンセルフラグ（cancel メッセージで立てる） */
let cancelled = false;

const post = (event: UpscaleWorkerEvent, transfer?: Transferable[]): void => {
  self.postMessage(event, { transfer });
};

const getEngine = (id: number): Promise<UpscaleEngine> => {
  if (!enginePromise) {
    enginePromise = createUpscaleEngine((stage, loadedBytes, totalBytes) => {
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
  req: Extract<UpscaleWorkerRequest, { type: "upscale" }>,
): Promise<{ blob: Blob; width: number; height: number }> => {
  const { buffer, fileType, scale, preserveExif } = req;

  // EXIF は元バッファから読む（デコードで失われるため先に取得する）
  const exifFormat = exifWritableFormat(fileType);
  let exifTiff: Uint8Array | null = null;
  if (preserveExif && exifFormat) {
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

  if (!isUpscalableSize(imageData.width, imageData.height)) {
    throw new Error(
      `画像が大きすぎます（長辺 ${MAX_UPSCALE_INPUT_DIMENSION}px まで） / Image too large (max ${MAX_UPSCALE_INPUT_DIMENSION}px on the long side)`,
    );
  }

  const engine = await getEngine(req.id);
  const result = await upscaleRgba(
    imageData.data,
    imageData.width,
    imageData.height,
    scale,
    engine,
    {
      onTileProgress: (completedTiles, totalTiles) => {
        post({ type: "tile", id: req.id, completedTiles, totalTiles });
      },
      shouldCancel: () => cancelled,
    },
  );

  const outCanvas = new OffscreenCanvas(result.width, result.height);
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) {
    throw new Error("Canvas context を取得できませんでした");
  }
  outCtx.putImageData(
    new ImageData(result.data, result.width, result.height),
    0,
    0,
  );

  // 元と同じ形式でエンコードする（convertToBlob 非対応形式は PNG フォールバック）
  let blob: Blob;
  try {
    blob = await outCanvas.convertToBlob({
      type: fileType || "image/png",
      quality: 0.95,
    });
  } catch {
    blob = await outCanvas.convertToBlob({ type: "image/png" });
  }

  // 向きは焼き込み済みのため Orientation を 1 に正規化し、寸法タグを出力へ揃えて挿入する
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
        exifFormat as ExifWritableFormat,
        result.width,
        result.height,
      );
    } catch (error) {
      console.warn("Failed to insert EXIF data:", error);
    }
  }

  return { blob, width: result.width, height: result.height };
};

self.onmessage = async (event: MessageEvent<UpscaleWorkerRequest>) => {
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
      cancelled: error instanceof UpscaleCancelledError,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
