/**
 * 背景除去 Worker（removeBg.worker.ts）とメインスレッド間のメッセージ型定義。
 * upscaleMessages.ts と同型（1 ジョブが長時間で進捗・キャンセルを扱う）だが、
 * ツールごとに独立して進化できるよう別ファイルにする。
 */

import type { OnnxAssetStage } from "../utils/onnxSession";
import type { RemoveBgOutputFormat } from "../utils/removeBgCore";

/** ダウンロード進捗の対象（ort ランタイム / ONNX モデル） */
export type RemoveBgAssetStage = OnnxAssetStage;

/** メインスレッド → Worker */
export type RemoveBgWorkerRequest =
  | {
      type: "removeBg";
      id: number;
      /** 入力ファイルの中身（Transferable で移譲する） */
      buffer: ArrayBuffer;
      fileType: string;
      outputFormat: RemoveBgOutputFormat;
      preserveExif: boolean;
    }
  | {
      /** 進行中ジョブの中断要求（推論前の境界で停止する。即時停止は terminate で行う） */
      type: "cancel";
    };

/** Worker → メインスレッド */
export type RemoveBgWorkerEvent =
  | {
      type: "download";
      id: number;
      stage: RemoveBgAssetStage;
      loadedBytes: number;
      totalBytes: number | null;
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
