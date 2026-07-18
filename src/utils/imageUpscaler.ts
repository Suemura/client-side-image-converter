/**
 * AI 超解像（/upscale）の推論エンジンとオーケストレーション。
 *
 * onnxruntime-web（動的 import・自己ホスト）で realesr-general-x4v3 を実行する。
 * WebGPU EP を優先し、使えない環境では WASM EP へ自動フォールバックする。
 * タイル演算そのものは upscaleCore.ts の純粋関数に委譲する（redactCore /
 * imageRedactor と同じ分離方針）。Canvas 非依存の部分（createUpscaleEngine /
 * upscaleRgba）は Web Worker（upscale.worker.ts）からも利用される。
 *
 * モデル・ランタイムのロードは modelLoader.ts（Cache Storage キャッシュ・進捗通知）
 * に委譲する。すべて自己オリジンから取得し、画像・モデルとも外部送信しない。
 */

import type { UpscaleAssetStage } from "../workers/upscaleMessages";
import {
  fetchAssetWithCache,
  fetchOrtWasmBinary,
  ORT_ASSETS_BASE_PATH,
  UPSCALE_MODEL_URL,
} from "./modelLoader";
import {
  accumulateTile,
  computeFeatherWeights,
  computeTileGrid,
  createBlendAccumulator,
  DEFAULT_TILE_OVERLAP,
  downscaleRgbaByHalf,
  extractTileTensor,
  finalizeToRgba,
  hasTransparency,
  MODEL_SCALE,
  resizeAlphaBilinear,
  type UpscaleScale,
} from "./upscaleCore";

/** キャンセルによる中断を通常エラーと区別するための専用エラー */
export class UpscaleCancelledError extends Error {
  constructor() {
    super("Upscale cancelled");
    this.name = "UpscaleCancelledError";
  }
}

/** アセットダウンロードの進捗コールバック */
export type UpscaleDownloadCallback = (
  stage: UpscaleAssetStage,
  loadedBytes: number,
  totalBytes: number | null,
) => void;

/** 推論エンジン。run は NCHW（1×3×h×w、0..1）を受け取り MODEL_SCALE 倍の同形式を返す */
export interface UpscaleEngine {
  run: (
    tensor: Float32Array,
    width: number,
    height: number,
  ) => Promise<Float32Array>;
  /** 実際に選択された実行プロバイダ（UI の注記表示に使う） */
  backend: "webgpu" | "wasm";
}

/**
 * 推論エンジンを生成する。
 * ort ランタイム（分割 WASM）→ ONNX モデルの順にロードし、
 * WebGPU EP でのセッション生成を試みて失敗時は WASM EP へフォールバックする。
 */
export const createUpscaleEngine = async (
  onDownloadProgress?: UpscaleDownloadCallback,
): Promise<UpscaleEngine> => {
  const ort = await import("onnxruntime-web");

  // ランタイムアセットは自己ホスト（scripts/copy-ort-assets.ts が public/ort/ へ配置）。
  // WASM 本体は Cloudflare Pages の 25MiB 上限のため分割配置されており、
  // 結合したバイナリを wasmBinary として直接注入する（.mjs ローダーは wasmPaths から取得）
  ort.env.wasm.wasmPaths = ORT_ASSETS_BASE_PATH;
  // COOP/COEP（crossOriginIsolated）を導入していないため SharedArrayBuffer は使えない。
  // シングルスレッドで動かす（主経路の WebGPU には影響しない）
  ort.env.wasm.numThreads = 1;
  if (!ort.env.wasm.wasmBinary) {
    const binary = await fetchOrtWasmBinary((loaded, total) =>
      onDownloadProgress?.("runtime", loaded, total),
    );
    ort.env.wasm.wasmBinary = binary.buffer as ArrayBuffer;
  }

  const model = await fetchAssetWithCache(UPSCALE_MODEL_URL, (loaded, total) =>
    onDownloadProgress?.("model", loaded, total),
  );

  // WebGPU 優先・WASM フォールバック。navigator.gpu が無い環境は最初から WASM にする
  let session: Awaited<ReturnType<typeof ort.InferenceSession.create>>;
  let backend: UpscaleEngine["backend"];
  const hasWebGpu =
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    navigator.gpu !== undefined;
  if (hasWebGpu) {
    try {
      session = await ort.InferenceSession.create(model, {
        executionProviders: ["webgpu"],
      });
      backend = "webgpu";
    } catch (error) {
      console.warn(
        "WebGPU セッションの生成に失敗、WASM へフォールバック:",
        error,
      );
      session = await ort.InferenceSession.create(model, {
        executionProviders: ["wasm"],
      });
      backend = "wasm";
    }
  } else {
    session = await ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
    });
    backend = "wasm";
  }

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  return {
    backend,
    run: async (
      tensor: Float32Array,
      width: number,
      height: number,
    ): Promise<Float32Array> => {
      const input = new ort.Tensor("float32", tensor, [1, 3, height, width]);
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

/** upscaleRgba の進捗・キャンセル制御 */
export interface UpscaleRunCallbacks {
  onTileProgress?: (completedTiles: number, totalTiles: number) => void;
  /** タイル境界ごとに呼ばれ、true を返すと UpscaleCancelledError で中断する */
  shouldCancel?: () => boolean;
}

/**
 * RGBA バッファを指定倍率でアップスケールする（Canvas 非依存・Worker 兼用）。
 * タイル分割 → 逐次推論 → フェザー合成 → （2x は 1/2 縮小）→ アルファ再合成。
 * タイル間でイベントループへ譲る（macrotask yield）ため、Worker では
 * cancel メッセージの受信、メインスレッドでは UI 更新の機会が保たれる。
 */
export const upscaleRgba = async (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  scale: UpscaleScale,
  engine: UpscaleEngine,
  callbacks: UpscaleRunCallbacks = {},
): Promise<{
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}> => {
  const tiles = computeTileGrid(width, height);
  const acc = createBlendAccumulator(width * MODEL_SCALE, height * MODEL_SCALE);

  for (let i = 0; i < tiles.length; i++) {
    if (callbacks.shouldCancel?.()) {
      throw new UpscaleCancelledError();
    }
    const tile = tiles[i];
    const output = await engine.run(
      extractTileTensor(rgba, width, tile),
      tile.width,
      tile.height,
    );
    accumulateTile(
      acc,
      output,
      tile,
      MODEL_SCALE,
      computeFeatherWeights(
        tile.x,
        tile.width,
        width,
        DEFAULT_TILE_OVERLAP,
        MODEL_SCALE,
      ),
      computeFeatherWeights(
        tile.y,
        tile.height,
        height,
        DEFAULT_TILE_OVERLAP,
        MODEL_SCALE,
      ),
    );
    callbacks.onTileProgress?.(i + 1, tiles.length);
    // macrotask へ譲り、cancel メッセージ受信・UI 更新の機会を作る
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  let result = {
    data: finalizeToRgba(acc, null),
    width: width * MODEL_SCALE,
    height: height * MODEL_SCALE,
  };
  if (scale === 2) {
    result = downscaleRgbaByHalf(result.data, result.width, result.height);
  }

  // モデルは RGB のみ扱うため、透過画像のアルファは別途バイリニア拡大して合成する
  if (hasTransparency(rgba)) {
    const alpha = resizeAlphaBilinear(
      rgba,
      width,
      height,
      result.width,
      result.height,
    );
    for (let i = 0; i < alpha.length; i++) {
      result.data[i * 4 + 3] = alpha[i];
    }
  }
  return result;
};
