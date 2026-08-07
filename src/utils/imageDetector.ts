/**
 * 顔・ナンバープレート自動検出（/studio レタッチツール）のオーケストレーション。
 *
 * onnxruntime-web（動的 import・自己ホスト）で UltraFace（顔）と LPD-YuNet
 * （ナンバープレート）を実行する。WebGPU EP を優先し、使えない環境では WASM EP へ
 * 自動フォールバックする（セッション生成は onnxSession.ts の共通基盤に委譲）。
 * 前後処理のピクセル演算・復号・NMS は detectionCore.ts の純粋関数に委譲する。
 *
 * モデル・ランタイムのロードは modelLoader.ts（Cache Storage キャッシュ・進捗通知）
 * に委譲する。すべて自己オリジンから取得し、画像・モデルとも外部送信しない。
 * モデルは軽量（合計約 5.7MB・入力 640×480 / 320×240）のため、upscale / remove-bg
 * と異なり Worker を立てず呼び出し元スレッドで単発推論する。
 */

import {
  DETECTION_NMS_IOU,
  type DetectionCandidate,
  decodeFaceOutputs,
  decodePlateOutputs,
  FACE_INPUT_HEIGHT,
  FACE_INPUT_WIDTH,
  generatePlatePriors,
  type NormalizedBox,
  nonMaxSuppression,
  normalizedBoxToRect,
  PLATE_INPUT_HEIGHT,
  PLATE_INPUT_WIDTH,
  rgbaToFaceTensor,
  rgbaToPlateTensor,
} from "./detectionCore";
import {
  FACE_DETECTION_MODEL_URL,
  PLATE_DETECTION_MODEL_URL,
} from "./modelLoader";
import {
  createOnnxSession,
  type OnnxBackend,
  type OnnxDownloadCallback,
  type OnnxSessionHandle,
} from "./onnxSession";
import { resizeRgbaBilinear } from "./removeBgCore";

/** アセットダウンロードの進捗コールバック（stage は "runtime" | "model"） */
export type DetectionDownloadCallback = OnnxDownloadCallback;

/** 検出結果（backend は UI の注記表示に使う） */
export interface DetectionResult {
  candidates: DetectionCandidate[];
  backend: OnnxBackend;
}

/** この環境で検出を実行できるか（WASM フォールバックの前提が揃っているか） */
export const isDetectionSupported = (): boolean =>
  typeof WebAssembly !== "undefined" && typeof fetch !== "undefined";

/** 2 モデル分のセッション。1 度生成したらページ内で再利用する */
interface DetectionEngines {
  face: OnnxSessionHandle;
  plate: OnnxSessionHandle;
}

let enginesPromise: Promise<DetectionEngines> | null = null;

/**
 * 検出エンジン（2 モデルのセッション）を生成する。生成は 1 回だけ行い、
 * 以降の呼び出しはキャッシュ済みセッションを返す。失敗時はキャッシュを
 * 破棄し、次回呼び出しで再試行できるようにする。
 */
const getDetectionEngines = (
  onDownloadProgress?: DetectionDownloadCallback,
): Promise<DetectionEngines> => {
  if (!enginesPromise) {
    enginesPromise = (async () => {
      // 逐次ロードで進捗を単純化する（ランタイム WASM は 1 つ目で注入済みになる）
      const face = await createOnnxSession(
        FACE_DETECTION_MODEL_URL,
        onDownloadProgress,
        { warmupInputShape: [1, 3, FACE_INPUT_HEIGHT, FACE_INPUT_WIDTH] },
      );
      const plate = await createOnnxSession(
        PLATE_DETECTION_MODEL_URL,
        onDownloadProgress,
        { warmupInputShape: [1, 3, PLATE_INPUT_HEIGHT, PLATE_INPUT_WIDTH] },
      );
      return { face, plate };
    })();
    enginesPromise.catch(() => {
      enginesPromise = null;
    });
  }
  return enginesPromise;
};

/** 1 モデル分の推論を実行し、正規化ボックス（NMS 済み）を返す */
const runModel = async (
  handle: OnnxSessionHandle,
  tensor: Float32Array,
  shape: readonly number[],
  decode: (outputs: Record<string, Float32Array>) => NormalizedBox[],
): Promise<NormalizedBox[]> => {
  const { ort, session } = handle;
  const input = new ort.Tensor("float32", tensor, [...shape]);
  const results = await session.run({ [session.inputNames[0]]: input });
  const outputs: Record<string, Float32Array> = {};
  for (const name of Object.keys(results)) {
    outputs[name] = results[name].data as Float32Array;
  }
  for (const name of Object.keys(results)) {
    results[name].dispose?.();
  }
  input.dispose?.();
  return nonMaxSuppression(decode(outputs), DETECTION_NMS_IOU);
};

/**
 * RGBA バッファから顔・ナンバープレートを検出する。
 * 各モデルの入力解像度へ縮小（アスペクト比は保持せず引き伸ばす。各モデルの
 * 標準前処理と同じ）→ 推論 → 復号 + NMS → 自然座標の矩形へ変換して返す。
 * 返す矩形はパディングなしの生の検出矩形（レタッチ領域化は呼び出し側で行う）。
 */
export const detectPrivacyRegions = async (
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  onDownloadProgress?: DetectionDownloadCallback,
): Promise<DetectionResult> => {
  const engines = await getDetectionEngines(onDownloadProgress);

  // 顔検出（UltraFace: RGB, (v-127)/128）
  const faceRgba = resizeRgbaBilinear(
    rgba,
    width,
    height,
    FACE_INPUT_WIDTH,
    FACE_INPUT_HEIGHT,
  );
  const faceBoxes = await runModel(
    engines.face,
    rgbaToFaceTensor(faceRgba, FACE_INPUT_WIDTH, FACE_INPUT_HEIGHT),
    [1, 3, FACE_INPUT_HEIGHT, FACE_INPUT_WIDTH],
    (outputs) => decodeFaceOutputs(outputs.scores, outputs.boxes),
  );

  // ナンバープレート検出（LPD-YuNet: BGR, 生 0..255）
  const plateRgba = resizeRgbaBilinear(
    rgba,
    width,
    height,
    PLATE_INPUT_WIDTH,
    PLATE_INPUT_HEIGHT,
  );
  const plateBoxes = await runModel(
    engines.plate,
    rgbaToPlateTensor(plateRgba, PLATE_INPUT_WIDTH, PLATE_INPUT_HEIGHT),
    [1, 3, PLATE_INPUT_HEIGHT, PLATE_INPUT_WIDTH],
    (outputs) =>
      decodePlateOutputs(
        outputs.loc,
        outputs.conf,
        outputs.iou,
        generatePlatePriors(),
      ),
  );

  const candidates: DetectionCandidate[] = [];
  for (const box of faceBoxes) {
    const rect = normalizedBoxToRect(box, width, height);
    if (rect) {
      candidates.push({ category: "face", rect, score: box.score });
    }
  }
  for (const box of plateBoxes) {
    const rect = normalizedBoxToRect(box, width, height);
    if (rect) {
      candidates.push({ category: "plate", rect, score: box.score });
    }
  }

  return { candidates, backend: engines.face.backend };
};
