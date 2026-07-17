/**
 * 画像処理 Web Worker（OffscreenCanvas 経路）
 *
 * 1 メッセージ = 1 ファイルの変換。デコード（createImageBitmap / HEIC / TIFF）→ OffscreenCanvas
 * での描画・リサイズ → エンコード（convertToBlob / @jsquash/avif）→ EXIF 挿入 までを Worker 内で
 * 完結させ、メインスレッドをブロックしない（Issue #32・#47）。エンコード結果は Transferable で返す。
 *
 * メインスレッドの `convertImage`（imageConverter.ts）と同じ変換ロジックを OffscreenCanvas 版で
 * 再現する。品質探索・サイズ計算・AVIF エンコード・PNG ティア判定・EXIF は共通関数を再利用する。
 */

import { encodeCanvasToAvifBlob } from "../utils/avifEncoder";
import {
  calculateTargetSize,
  resolveFlattenBackground,
  searchQualityForTargetSize,
} from "../utils/conversionCore";
import {
  type ExifWritableFormat,
  insertExifIntoBlob,
  readExifTiffFromDataUrl,
} from "../utils/exifTransfer";
import { decodeHeicToImageData } from "../utils/heicDecoder";
import { optimizeImageBuffer } from "../utils/imageOptimizer";
import { uint8ArrayToBase64 } from "../utils/imageUtils";
import {
  PNG_COMPRESSED_QUALITY_HINT,
  pngQualityStrategy,
} from "../utils/pngQuality";
import { decodeRawToImageData } from "../utils/rawDecoder";
import { decodeTiffToImageData } from "../utils/tiffDecoder";
import type { DecodeKind, WorkerRequest, WorkerResponse } from "./messages";

/** デコード種別に応じてソース画像を `ImageBitmap` として取得する */
const decodeToBitmap = async (
  buffer: ArrayBuffer,
  fileType: string,
  decodeKind: DecodeKind,
): Promise<ImageBitmap> => {
  if (decodeKind === "heic") {
    const { data, width, height } = await decodeHeicToImageData(
      new Uint8Array(buffer),
    );
    return createImageBitmap(new ImageData(data, width, height));
  }
  if (decodeKind === "tiff") {
    const { data, width, height } = await decodeTiffToImageData(buffer);
    return createImageBitmap(new ImageData(data, width, height));
  }
  if (decodeKind === "raw") {
    // libraw-wasm は内部で自前の Worker を生成する（ネスト Worker）。
    // 非対応環境では例外になり、当該ファイルはメインスレッドへフォールバックする
    const { data, width, height } = await decodeRawToImageData(buffer);
    return createImageBitmap(new ImageData(data, width, height));
  }
  // 標準フォーマット（JPEG/PNG/WebP/BMP など）は Blob から直接デコードする。
  // imageOrientation: "from-image" でメインスレッドの <img> と同じく EXIF Orientation を適用する。
  //
  // 前提: このワーカー経路は呼び出し側が isOffscreenPipelineSupported()（OffscreenCanvas /
  // OffscreenCanvas.prototype.convertToBlob / createImageBitmap 対応）を満たす環境でのみ使われる。
  // これらを備えるエンジン（Chromium / Firefox / Safari の該当バージョン）は
  // createImageBitmap の imageOrientation: "from-image" も一様にサポートするため、この
  // オプションが黙殺されて Orientation がメイン版（<img> 経路）と乖離するケースは実運用では生じない。
  // 万一未対応エンジンが現れても Worker が失敗すれば当該ファイルはメインスレッドへフォールバックする。
  const blob = new Blob([buffer], {
    type: fileType || "application/octet-stream",
  });
  return createImageBitmap(blob, { imageOrientation: "from-image" });
};

/** OffscreenCanvas を PNG にエンコードする（品質ティアに応じて戦略を切り替える） */
const encodePng = async (
  canvas: OffscreenCanvas,
  quality: number,
): Promise<Blob> => {
  const strategy = pngQualityStrategy(quality);
  if (strategy === "lossless") {
    return canvas.convertToBlob({ type: "image/png" });
  }
  if (strategy === "compressed") {
    // PNG はロスレスのため quality は実質無視されるが、メインスレッド版と挙動を揃える
    return canvas.convertToBlob({
      type: "image/png",
      quality: PNG_COMPRESSED_QUALITY_HINT,
    });
  }
  // 低品質: 一度 JPEG で圧縮してから PNG へ再エンコードする
  const jpegBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: quality / 100,
  });
  const bitmap = await createImageBitmap(jpegBlob);
  const tmp = new OffscreenCanvas(canvas.width, canvas.height);
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) {
    bitmap.close();
    return canvas.convertToBlob({ type: "image/png" });
  }
  tmpCtx.drawImage(bitmap, 0, 0);
  // 中間 bitmap を早期解放する（processRequest のデコード bitmap と同様に close する）
  bitmap.close();
  return tmp.convertToBlob({ type: "image/png" });
};

/** 変換要求 1 件を処理し、エンコード結果 Blob と目標サイズ達成可否を返す */
const processRequest = async (
  req: WorkerRequest,
): Promise<{ blob: Blob; targetSizeAchieved?: boolean }> => {
  const { buffer, fileType, decodeKind, options } = req;

  // 最適化モード（Issue #61）: フォーマットを維持したまま再圧縮する。
  // Canvas / OffscreenCanvas を経由せず jsquash で完結するため、convert 経路より前に分岐する。
  if (options.mode === "optimize") {
    const { buffer: outBuffer, mime } = await optimizeImageBuffer(
      buffer,
      fileType,
    );
    return { blob: new Blob([outBuffer], { type: mime }) };
  }

  // EXIF 保持は AVIF 以外の出力かつ標準フォーマットのソースでのみ有効（HEIC/TIFF は保持対象外）。
  // メインスレッドの convertImage と同じ条件・読み取り経路を再現する。
  let exifTiff: Uint8Array | null = null;
  if (
    options.preserveExif === true &&
    options.format !== "avif" &&
    decodeKind === "standard"
  ) {
    const dataUrl = `data:${fileType};base64,${uint8ArrayToBase64(new Uint8Array(buffer))}`;
    exifTiff = await readExifTiffFromDataUrl(dataUrl, fileType);
  }

  const bitmap = await decodeToBitmap(buffer, fileType, decodeKind);
  const { width, height } = calculateTargetSize(
    bitmap.width,
    bitmap.height,
    options,
  );

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context を取得できませんでした");
  }
  // アルファ非対応出力（JPEG / PNG 低品質ティア）では透過部分が黒くならないよう
  // 描画前に背景色を合成する（Issue #108。メインスレッド経路と同じ純粋関数で判定する）
  const background = resolveFlattenBackground(options.format, options.quality);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob: Blob;
  let targetSizeAchieved: boolean | undefined;

  if (options.format === "png") {
    blob = await encodePng(canvas, options.quality);
  } else if (options.format === "avif") {
    blob = await encodeCanvasToAvifBlob(canvas, options.quality);
  } else {
    // JPEG / WebP
    const mimeType = `image/${options.format}`;
    const encode = (quality: number): Promise<Blob> =>
      canvas.convertToBlob({ type: mimeType, quality: quality / 100 });

    if (
      options.targetFileSizeKB !== undefined &&
      options.targetFileSizeKB > 0
    ) {
      const result = await searchQualityForTargetSize(
        encode,
        options.targetFileSizeKB * 1024,
      );
      blob = result.blob;
      targetSizeAchieved = result.achieved;
    } else {
      blob = await encode(options.quality);
    }
  }

  // EXIF を出力形式（JPEG / PNG / WebP）に応じて挿入する
  if (exifTiff && options.format !== "avif") {
    try {
      blob = await insertExifIntoBlob(
        blob,
        exifTiff,
        options.format as ExifWritableFormat,
        width,
        height,
      );
    } catch (error) {
      console.warn("Failed to insert EXIF data:", error);
    }
  }

  return { blob, targetSizeAchieved };
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const { blob, targetSizeAchieved } = await processRequest(req);
    const buffer = await blob.arrayBuffer();
    const response: WorkerResponse = {
      id: req.id,
      ok: true,
      buffer,
      mime: blob.type,
      targetSizeAchieved,
    };
    self.postMessage(response, { transfer: [buffer] });
  } catch (error) {
    const response: WorkerResponse = {
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
