/**
 * 画像処理 Worker とメインスレッド（プール）間で交換するメッセージの型定義
 *
 * File 本体・エンコード結果は `ArrayBuffer` として Transferable で受け渡し、コピーを避ける。
 */

import type { ConversionOptions } from "../utils/conversionCore";

/**
 * デコード方式。`isHeicFile` / `isTiffFile` は File を要するためメインスレッド側で判定し、
 * Worker には結果だけを渡す（standard は createImageBitmap でデコードする）。
 */
export type DecodeKind = "standard" | "heic" | "tiff";

/** メインスレッド → Worker: 1 ファイルの変換要求 */
export interface WorkerRequest {
  /** ジョブ識別子（結果を入力インデックスに対応付けるために使う） */
  id: number;
  /** File の中身（Transferable。postMessage で転送する） */
  buffer: ArrayBuffer;
  fileName: string;
  fileType: string;
  decodeKind: DecodeKind;
  options: ConversionOptions;
}

/** Worker → メインスレッド: 変換結果 */
export type WorkerResponse =
  | {
      id: number;
      ok: true;
      /** エンコード済み画像の中身（Transferable） */
      buffer: ArrayBuffer;
      /** 出力 Blob の MIME タイプ */
      mime: string;
      /** 目標ファイルサイズ探索を行った場合の達成可否（未探索時は undefined） */
      targetSizeAchieved?: boolean;
    }
  | {
      id: number;
      ok: false;
      /** エラーメッセージ（ログ用。ユーザー表示にはファイル名のみ使う） */
      error: string;
    };
