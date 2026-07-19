/**
 * ONNX Runtime Web のセッション生成の共通処理。
 *
 * onnxruntime-web を動的 import し、ランタイム WASM（分割配置）と ONNX モデルを
 * modelLoader.ts（Cache Storage キャッシュ・進捗通知）経由で取得した上で、
 * WebGPU EP を優先し、使えない環境では WASM EP へ自動フォールバックして
 * InferenceSession を生成する。超解像（imageUpscaler.ts）と背景除去
 * （imageBackgroundRemover.ts）で共有する基盤。
 */

import {
  fetchAssetWithCache,
  fetchOrtWasmBinary,
  ORT_ASSETS_BASE_PATH,
} from "./modelLoader";

/** 実際に選択された実行プロバイダ（UI の注記表示に使う） */
export type OnnxBackend = "webgpu" | "wasm";

/** ダウンロード進捗の対象（ort ランタイム / ONNX モデル） */
export type OnnxAssetStage = "runtime" | "model";

/** アセットダウンロードの進捗コールバック */
export type OnnxDownloadCallback = (
  stage: OnnxAssetStage,
  loadedBytes: number,
  totalBytes: number | null,
) => void;

/** createOnnxSession の返り値（ort 名前空間はテンソル生成のため呼び出し側でも使う） */
export interface OnnxSessionHandle {
  ort: typeof import("onnxruntime-web");
  session: Awaited<
    ReturnType<typeof import("onnxruntime-web")["InferenceSession"]["create"]>
  >;
  backend: OnnxBackend;
}

/** createOnnxSession のオプション */
export interface CreateOnnxSessionOptions {
  /**
   * WebGPU セッション生成後に、この形状（NCHW）のゼロテンソルで検証推論を行う。
   * WebGPU EP はセッション生成に成功しても未対応オペレータで実行時に失敗する
   * ことがある（例: u2netp の MaxPool ceil_mode は「using ceil() in shape
   * computation is not yet supported for MaxPool」で失敗する）ため、
   * 検証推論が失敗した場合は WASM EP のセッションへ作り直してフォールバックする。
   */
  warmupInputShape?: readonly number[];
}

/** ゼロテンソルの検証推論を 1 回実行する（失敗は呼び出し側で捕捉する） */
const warmupSession = async (
  ort: OnnxSessionHandle["ort"],
  session: OnnxSessionHandle["session"],
  inputShape: readonly number[],
): Promise<void> => {
  const size = inputShape.reduce((product, dim) => product * dim, 1);
  const input = new ort.Tensor("float32", new Float32Array(size), [
    ...inputShape,
  ]);
  const results = await session.run({ [session.inputNames[0]]: input });
  for (const name of Object.keys(results)) {
    results[name].dispose?.();
  }
  input.dispose?.();
};

/**
 * 指定 URL の ONNX モデルで推論セッションを生成する。
 * ort ランタイム（分割 WASM）→ ONNX モデルの順にロードし、
 * WebGPU EP でのセッション生成を試みて失敗時は WASM EP へフォールバックする。
 */
export const createOnnxSession = async (
  modelUrl: string,
  onDownloadProgress?: OnnxDownloadCallback,
  options: CreateOnnxSessionOptions = {},
): Promise<OnnxSessionHandle> => {
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

  const model = await fetchAssetWithCache(modelUrl, (loaded, total) =>
    onDownloadProgress?.("model", loaded, total),
  );

  // WebGPU 優先・WASM フォールバック。navigator.gpu が無い環境は最初から WASM にする
  let session: OnnxSessionHandle["session"];
  let backend: OnnxBackend;
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
      if (options.warmupInputShape) {
        // 未対応オペレータはセッション生成でなく初回実行で失敗するため、
        // ゼロテンソルの検証推論で実行可能性まで確認する
        await warmupSession(ort, session, options.warmupInputShape);
      }
    } catch (error) {
      console.warn(
        "WebGPU セッションの生成または検証推論に失敗、WASM へフォールバック:",
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

  return { ort, session, backend };
};
