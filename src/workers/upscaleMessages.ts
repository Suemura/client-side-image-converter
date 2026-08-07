/**
 * AI 超解像 Worker（upscale.worker.ts）とメインスレッド間のメッセージ型定義。
 * imageProcessing 用の messages.ts とは処理形態が異なる（1 ジョブが長時間で
 * 進捗・キャンセルを扱う）ため別ファイルにする。
 */

import type { UpscaleScale } from "../utils/upscaleCore";

/** ダウンロード進捗の対象（ort ランタイム / ONNX モデル） */
export type UpscaleAssetStage = "runtime" | "model";

/** メインスレッド → Worker */
export type UpscaleWorkerRequest =
  | {
      type: "upscale";
      id: number;
      /** 入力ファイルの中身（Transferable で移譲する） */
      buffer: ArrayBuffer;
      fileType: string;
      scale: UpscaleScale;
      preserveExif: boolean;
    }
  | {
      /** 進行中ジョブの中断要求（タイル境界で停止する。即時停止は terminate で行う） */
      type: "cancel";
    };

/** Worker → メインスレッド */
export type UpscaleWorkerEvent =
  | {
      type: "download";
      id: number;
      stage: UpscaleAssetStage;
      loadedBytes: number;
      totalBytes: number | null;
    }
  | {
      type: "tile";
      id: number;
      completedTiles: number;
      totalTiles: number;
    }
  | {
      type: "result";
      id: number;
      ok: true;
      /** エンコード済み画像（Transferable で移譲する） */
      buffer: ArrayBuffer;
      mime: string;
      width: number;
      height: number;
    }
  | {
      type: "result";
      id: number;
      ok: false;
      /** キャンセルによる中断かどうか（エラー表示とキャンセル表示を区別する） */
      cancelled: boolean;
      error: string;
    };
