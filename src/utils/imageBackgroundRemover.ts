/**
 * 背景除去（/remove-bg）の推論エンジンとオーケストレーション。
 *
 * onnxruntime-web（動的 import・自己ホスト）で u2netp（U²-Net 軽量版）を実行する。
 * WebGPU EP を優先し、使えない環境では WASM EP へ自動フォールバックする
 * （セッション生成は onnxSession.ts の共通基盤に委譲）。
 * 前後処理のピクセル演算は removeBgCore.ts の純粋関数に委譲する。
 * Canvas 非依存のため Web Worker（removeBg.worker.ts）からも利用される。
 *
 * モデル・ランタイムのロードは modelLoader.ts（Cache Storage キャッシュ・進捗通知）
 * に委譲する。すべて自己オリジンから取得し、画像・モデルとも外部送信しない。
 */

import { REMOVE_BG_MODEL_URL } from "./modelLoader";
import { createOnnxSession, type OnnxDownloadCallback } from "./onnxSession";
import {
  applyMaskToAlpha,
  normalizeMaskMinMax,
  REMOVE_BG_INPUT_SIZE,
  resizeMaskBilinear,
  resizeRgbaBilinear,
  rgbaToNormalizedTensor,
} from "./removeBgCore";

/** キャンセルによる中断を通常エラーと区別するための専用エラー */
export class RemoveBgCancelledError extends Error {
  constructor() {
    super("Background removal cancelled");
    this.name = "RemoveBgCancelledError";
  }
}

/** アセットダウンロードの進捗コールバック（stage は "runtime" | "model"） */
export type RemoveBgDownloadCallback = OnnxDownloadCallback;

/**
 * 背景除去の推論エンジン。run は入力サイズの正規化テンソル（NCHW 1×3×s×s）を
 * 受け取り、同解像度のサリエンシーマップ（1ch 平面）を返す
 */
export interface RemoveBgEngine {
  run: (tensor: Float32Array) => Promise<Float32Array>;
  /** 実際に選択された実行プロバイダ（UI の注記表示に使う） */
  backend: "webgpu" | "wasm";
}

/**
 * 背景除去の推論エンジンを生成する。
 * u2netp は複数解像度の出力（d0..d6）を持つが、最終予測は先頭の出力を使う。
 */
export const createRemoveBgEngine = async (
  onDownloadProgress?: RemoveBgDownloadCallback,
): Promise<RemoveBgEngine> => {
  // u2netp の MaxPool（ceil_mode）は WebGPU EP 未対応で初回実行時に失敗するため、
  // 検証推論付きでセッションを生成し、失敗時は WASM へフォールバックさせる
  const { ort, session, backend } = await createOnnxSession(
    REMOVE_BG_MODEL_URL,
    onDownloadProgress,
    {
      warmupInputShape: [1, 3, REMOVE_BG_INPUT_SIZE, REMOVE_BG_INPUT_SIZE],
    },
  );

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  return {
    backend,
    run: async (tensor: Float32Array): Promise<Float32Array> => {
      const input = new ort.Tensor("float32", tensor, [
        1,
        3,
        REMOVE_BG_INPUT_SIZE,
        REMOVE_BG_INPUT_SIZE,
      ]);
      const results = await session.run({ [inputName]: input });
      const output = results[outputName];
      const data = output.data as Float32Array;
      // WebGPU EP の出力は GPU 側リソースを持つことがあるため明示的に解放する
      output.dispose?.();
      input.dispose?.();
      return data;
    },
  };
};

/**
 * RGBA バッファの背景を除去する（Canvas 非依存・Worker 兼用）。
 * 入力サイズへ縮小 → 推論 → マスク min-max 正規化 → 元解像度へ拡大 →
 * アルファ合成の順で処理し、元解像度の RGBA（背景が透過）を返す。
 */
export const removeBackgroundRgba = async (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  engine: RemoveBgEngine,
): Promise<Uint8ClampedArray<ArrayBuffer>> => {
  const inputRgba = resizeRgbaBilinear(
    rgba,
    width,
    height,
    REMOVE_BG_INPUT_SIZE,
    REMOVE_BG_INPUT_SIZE,
  );
  const tensor = rgbaToNormalizedTensor(
    inputRgba,
    REMOVE_BG_INPUT_SIZE,
    REMOVE_BG_INPUT_SIZE,
  );
  const saliency = await engine.run(tensor);
  const mask = resizeMaskBilinear(
    normalizeMaskMinMax(saliency),
    REMOVE_BG_INPUT_SIZE,
    REMOVE_BG_INPUT_SIZE,
    width,
    height,
  );
  return applyMaskToAlpha(rgba, mask);
};
