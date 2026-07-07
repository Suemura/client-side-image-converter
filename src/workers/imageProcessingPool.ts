/**
 * 画像処理 Worker プール（メインスレッド側）
 *
 * `navigator.hardwareConcurrency` を上限に複数の Worker を起動し、バッチ変換を並列実行する
 * （Issue #32）。各 Worker は `imageProcessing.worker.ts`。OffscreenCanvas / Worker /
 * createImageBitmap 非対応環境では利用しない（呼び出し側が `isOffscreenPipelineSupported`
 * で判定してメインスレッド経路へフォールバックする）。
 *
 * Worker がデコード/エンコードに失敗した場合や Worker がクラッシュした場合は、当該ファイルだけ
 * 注入された `fallbackConvert`（メインスレッドの `convertImage`）で再試行する。これにより
 * createImageBitmap では扱えないが `<img>` なら扱える形式でも取りこぼさない。
 */

import { mapWithConcurrency, resolveConcurrency } from "../utils/concurrency";
import type {
  BatchConversionResult,
  ConversionFailure,
  ConversionOptions,
  ConversionResult,
} from "../utils/conversionCore";
import {
  buildConversionResult,
  buildOptimizeResult,
} from "../utils/conversionResult";
import { isHeicFile, isTiffFile } from "../utils/fileUtils";
import type { DecodeKind, WorkerRequest, WorkerResponse } from "./messages";

/**
 * Worker 応答のウォッチドッグ（ミリ秒）。この時間内に応答（onmessage）も onerror も
 * 返らない場合、デコーダ/エンコーダの無限ループ等で Worker がハングしたとみなし、当該ジョブを
 * reject して Worker を dead 化する。これにより無応答ハングでレーン →
 * `mapWithConcurrency` の `Promise.all` → バッチ全体が永久 pending となり UI が
 * 「変換中」のまま復帰不能になるのを防ぐ（reject 後は当該ファイルがメインスレッドの
 * `convertImage` にフォールバックし、以降そのレーンもフォールバックに切り替わる）。
 *
 * 値は E2E の 1x1 画像処理や実運用の高解像度変換に全く影響しないよう十分大きく取る
 * （誤フォールバックを避けるための安全余裕。正常応答時はタイマーを必ずクリアする）。
 */
const WORKER_RESPONSE_TIMEOUT_MS = 60_000;

/** OffscreenCanvas ベースの Worker パイプラインが利用可能かを判定する */
export const isOffscreenPipelineSupported = (): boolean => {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof OffscreenCanvas.prototype.convertToBlob === "function"
  );
};

/** Worker とその in-flight リクエスト（id → 解決コールバック）を束ねる */
interface WorkerHandle {
  worker: Worker;
  pending: Map<
    number,
    {
      resolve: (response: WorkerResponse) => void;
      reject: (error: unknown) => void;
    }
  >;
  /** onerror でクラッシュ検知済みかどうか。true の Worker は再利用せずメインスレッドへ回す */
  dead: boolean;
}

/** Worker を生成し、id ルーティング付きのハンドルを返す */
const createWorkerHandle = (): WorkerHandle => {
  const worker = new Worker(
    new URL("./imageProcessing.worker.ts", import.meta.url),
    { type: "module" },
  );
  const handle: WorkerHandle = { worker, pending: new Map(), dead: false };

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const callbacks = handle.pending.get(response.id);
    if (callbacks) {
      handle.pending.delete(response.id);
      callbacks.resolve(response);
    }
  };

  // Worker がロード時や実行時にクラッシュした場合、in-flight のジョブを reject して
  // メインスレッドへフォールバックさせる。以後この Worker は再利用しない（dead 化）ことで、
  // 死んだ Worker に postMessage して応答が返らずレーンがハングするのを防ぐ
  // （再生成はしない: Worker のロード自体が失敗するケースで無限再生成に陥らないため）
  worker.onerror = (event) => {
    handle.dead = true;
    const error = new Error(event.message || "Worker error");
    for (const callbacks of handle.pending.values()) {
      callbacks.reject(error);
    }
    handle.pending.clear();
  };

  return handle;
};

/** 1 件のリクエストを Worker に投げ、対応する応答を待つ */
const runOnWorker = (
  handle: WorkerHandle,
  request: WorkerRequest,
): Promise<WorkerResponse> => {
  return new Promise((resolve, reject) => {
    // 無応答ウォッチドッグ。タイムアウト時は当該ジョブを reject し、Worker を dead 化して
    // terminate する（暴走中のデコーダ/エンコーダを確実に停止する）。pending.delete が false の
    // 場合は既に応答/クラッシュ処理済みなので何もしない（遅延応答との競合を防ぐ）。
    const timer = setTimeout(() => {
      if (handle.pending.delete(request.id)) {
        handle.dead = true;
        handle.worker.terminate();
        reject(new Error("Worker response timeout"));
      }
    }, WORKER_RESPONSE_TIMEOUT_MS);

    // resolve/reject 実行時に必ずタイマーをクリアし、正常応答後の誤タイムアウトを防ぐ
    handle.pending.set(request.id, {
      resolve: (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    handle.worker.postMessage(request, [request.buffer]);
  });
};

/** File から Worker に渡すデコード種別を判定する（isHeicFile/isTiffFile は File を要する） */
const detectDecodeKind = (file: File): DecodeKind => {
  if (isHeicFile(file)) {
    return "heic";
  }
  if (isTiffFile(file)) {
    return "tiff";
  }
  return "standard";
};

/**
 * Worker プールで複数ファイルを並列変換する。
 *
 * @param files - 変換対象
 * @param options - 変換オプション
 * @param onProgress - 進捗コールバック（完了ごとに (完了数, 総数)）
 * @param fallbackConvert - Worker 失敗時にメインスレッドで再試行する変換関数（`convertImage`）
 */
export const convertFilesWithWorkerPool = async (
  files: File[],
  options: ConversionOptions,
  onProgress: ((current: number, total: number) => void) | undefined,
  fallbackConvert: (
    file: File,
    options: ConversionOptions,
  ) => Promise<ConversionResult>,
): Promise<BatchConversionResult> => {
  const concurrency = resolveConcurrency(
    typeof navigator !== "undefined"
      ? navigator.hardwareConcurrency
      : undefined,
    files.length,
  );

  if (concurrency <= 0) {
    return { results: [], failures: [] };
  }

  // 同時実行数ぶんの Worker を起動し、アイドルスタックで貸し出す
  // （mapWithConcurrency の同時実行数と一致するため acquire は常に成功する）
  const handles = Array.from({ length: concurrency }, () =>
    createWorkerHandle(),
  );
  const idle = [...handles];

  try {
    const settled = await mapWithConcurrency(
      files,
      concurrency,
      async (file, index): Promise<ConversionResult> => {
        const handle = idle.pop();
        if (!handle) {
          // 同時実行数 = Worker 数のため理論上到達しないが、安全側でフォールバック
          return fallbackConvert(file, options);
        }
        try {
          // クラッシュ検知済み（dead）の Worker は再利用せずメインスレッドで処理する。
          // handle は finally でスタックに戻るため、以降このレーンは常にフォールバックする
          // （死んだ Worker に postMessage して応答が返らずハングするのを防ぐ）
          if (handle.dead) {
            return await fallbackConvert(file, options);
          }

          const buffer = await file.arrayBuffer();
          const request: WorkerRequest = {
            id: index,
            buffer,
            fileType: file.type,
            decodeKind: detectDecodeKind(file),
            options,
          };

          let response: WorkerResponse;
          try {
            response = await runOnWorker(handle, request);
          } catch {
            // Worker クラッシュ: メインスレッドで再試行する
            return await fallbackConvert(file, options);
          }

          if (response.ok) {
            const blob = new Blob([response.buffer], { type: response.mime });
            // 最適化モードは同一フォーマット維持のため元ファイル名を保つ結果を組み立てる
            return options.mode === "optimize"
              ? buildOptimizeResult(file, blob)
              : buildConversionResult(
                  file,
                  blob,
                  options.format,
                  response.targetSizeAchieved,
                );
          }
          // Worker がデコード/エンコードに失敗: メインスレッドで再試行する
          // （失敗ログは fallback 側で出力される。ここでは握りつぶさず再試行に委ねる）
          return await fallbackConvert(file, options);
        } finally {
          idle.push(handle);
        }
      },
      onProgress,
    );

    // 入力順を保った settled 結果を results / failures に振り分ける
    const results: ConversionResult[] = [];
    const failures: ConversionFailure[] = [];
    settled.forEach((entry, index) => {
      if (entry.ok) {
        results.push(entry.value);
      } else {
        console.error(
          `ファイル ${files[index].name} の変換に失敗:`,
          entry.error,
        );
        failures.push({ fileName: files[index].name });
      }
    });

    return { results, failures };
  } finally {
    // バッチ完了時に Worker を破棄する（WASM メモリの解放・リーク防止）
    for (const { worker } of handles) {
      worker.terminate();
    }
  }
};
