"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApplyScopeStore } from "../../../hooks/useApplyScopeStore";
import { useMetadataManager } from "../../../hooks/useMetadataManager";
import { resolveScopedValueForIndex } from "../../../utils/applyScope";
import {
  ASPECT_RATIO_PRESETS,
  type CropArea,
  type CropTransform,
  IDENTITY_TRANSFORM,
} from "../../../utils/cropGeometry";
import type { DetectionCategory } from "../../../utils/detectionCore";
import {
  countByCategory,
  DETECTION_PADDING_RATIO,
  type DetectionCandidate,
  expandDetectionRect,
} from "../../../utils/detectionCore";
import { buildEditJobs } from "../../../utils/editJobs";
import { changeFileExtension } from "../../../utils/fileUtils";
import {
  type CropJob,
  type CropResult,
  cropImages,
} from "../../../utils/imageCropper";
import {
  detectPrivacyRegions,
  isDetectionSupported,
} from "../../../utils/imageDetector";
import { editImages } from "../../../utils/imageEditor";
import { redactImages } from "../../../utils/imageRedactor";
import {
  addRegion,
  DEFAULT_REDACT_STYLE,
  type RedactRegion,
  type RedactStyle,
  removeRegion,
  updateRegionArea,
} from "../../../utils/redactCore";
import type { RemoveBgOutputFormat } from "../../../utils/removeBgCore";
import {
  type RemoveBgBatchHandle,
  runRemoveBgBatch,
} from "../../../utils/removeBgRunner";
import type {
  StudioHistoryLabel,
  StudioToolId,
} from "../../../utils/studioCore";
import type { UpscaleScale } from "../../../utils/upscaleCore";
import {
  runUpscaleBatch,
  type UpscaleBatchHandle,
} from "../../../utils/upscaleRunner";
import { useEditScopeStores } from "../../edit/hooks/useEditScopeStores";
import { useLutRegistry } from "../../edit/hooks/useLutRegistry";
import type { StudioDocuments } from "./useStudioDocuments";

/** 未設定インデックスの既定値（毎レンダーで新しい配列を作らないためのモジュール定数） */
const EMPTY_REGIONS: RedactRegion[] = [];

/** AI ツールの進捗（モデル準備 → 推論の 2 段階。upscale / remove-bg ページと同形） */
export type AiProgressState =
  | { stage: "download"; percent: number }
  | {
      stage: "inference";
      currentFile: number;
      totalFiles: number;
      percent: number;
    };

/** blob の実エンコード形式に合わせて拡張子を揃えた File を作る（名前は現在名を維持する） */
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const fileFromBlob = (baseName: string, blob: Blob): File => {
  const extension = MIME_EXTENSIONS[blob.type];
  const name = extension ? changeFileExtension(baseName, extension) : baseName;
  return new File([blob], name, { type: blob.type || undefined });
};

/** CropResult[]（入力と同順）から成功分の差し替えマップを組み立てる */
const collectCropResultUpdates = (
  results: CropResult[],
  indices: number[],
  files: File[],
): { updates: Map<number, File>; failures: string[] } => {
  const updates = new Map<number, File>();
  const failures: string[] = [];
  results.forEach((result, position) => {
    const index = indices[position];
    if (index === undefined) {
      return;
    }
    if (result.success) {
      updates.set(index, fileFromBlob(files[index].name, result.croppedBlob));
    } else {
      failures.push(files[index].name);
    }
  });
  return { updates, failures };
};

/** レタッチツールの AI 自動検出（顔・ナンバープレート）の状態と操作 */
export interface RetouchDetect {
  /** この環境で検出を実行できるか（false のときはボタン無効 + 理由表示） */
  supported: boolean;
  /** 検出の実行中か（モデル準備 + 推論） */
  running: boolean;
  /** モデル・ランタイムのダウンロード進捗（0..100。ダウンロード中以外は null） */
  downloadPercent: number | null;
  /** 直近の実行が失敗したか（モデル取得失敗等。ボタン無効 + 理由表示） */
  failed: boolean;
  /** 現在画像の検出候補（未実行・無効化時は null。矩形は自然座標） */
  candidates: DetectionCandidate[] | null;
  /** カテゴリ別の検出件数（candidates が null のときは全て 0） */
  counts: Record<DetectionCategory, number>;
  /** カテゴリ別の選択状態（チェックリスト） */
  selection: Record<DetectionCategory, boolean>;
  toggleCategory: (category: DetectionCategory, checked: boolean) => void;
  /** 選択中カテゴリの検出候補の合計件数（追加ボタンの件数表示） */
  selectedCount: number;
  /** 検出を実行する（source は EXIF 補正済みの自然サイズキャンバス） */
  run: (source: HTMLCanvasElement) => Promise<void>;
  /** 選択中カテゴリの候補をパディング付きでレタッチ領域へ追加する */
  addSelectedToRegions: () => void;
}

/** useStudioTools の返却値 */
export interface StudioTools {
  tool: StudioToolId;
  setTool: (tool: StudioToolId) => void;

  /** 適用中のツール（進捗表示・多重実行防止） */
  applyingTool: StudioToolId | null;
  /** AI ツールの進捗（適用中以外は null） */
  aiProgress: AiProgressState | null;
  /** バッチ全体の失敗通知（次の適用開始でクリア） */
  applyError: boolean;
  /** 個別ファイルの失敗一覧（次の適用開始でクリア） */
  applyFailures: string[];
  cancelAi: () => void;

  crop: {
    aspectRatioId: string;
    setAspectRatioId: (id: string) => void;
    aspectRatio: number | null;
    currentArea: CropArea | null;
    setCurrentArea: (area: CropArea) => void;
    currentTransform: CropTransform;
    setCurrentTransform: (
      transform: CropTransform,
      resetArea?: boolean,
    ) => void;
    preserveExif: boolean;
    setPreserveExif: (value: boolean) => void;
    reset: () => void;
    canApply: boolean;
    apply: () => Promise<void>;
  };

  adjust: {
    scopeStores: ReturnType<typeof useEditScopeStores>;
    lutRegistry: ReturnType<typeof useLutRegistry>;
    canApply: boolean;
    reset: () => void;
    apply: () => Promise<void>;
  };

  retouch: {
    style: RedactStyle;
    setStyle: (style: RedactStyle) => void;
    currentRegions: RedactRegion[];
    addRegion: (area: CropArea) => void;
    updateRegion: (id: number, area: CropArea) => void;
    removeRegion: (id: number) => void;
    clearRegions: () => void;
    totalRegionCount: number;
    preserveExif: boolean;
    setPreserveExif: (value: boolean) => void;
    canApply: boolean;
    apply: () => Promise<void>;
    detect: RetouchDetect;
  };

  upscale: {
    scale: UpscaleScale;
    setScale: (scale: UpscaleScale) => void;
    preserveExif: boolean;
    setPreserveExif: (value: boolean) => void;
    apply: () => Promise<void>;
  };

  removebg: {
    outputFormat: RemoveBgOutputFormat;
    setOutputFormat: (format: RemoveBgOutputFormat) => void;
    preserveExif: boolean;
    setPreserveExif: (value: boolean) => void;
    apply: () => Promise<void>;
  };

  info: {
    manager: ReturnType<typeof useMetadataManager>;
    remove: () => Promise<void>;
  };

  /** 書き出し用: 現在の未確定調整から EditJob を組み立てる */
  buildCurrentEditJobs: () => ReturnType<typeof buildEditJobs>;

  /** フィルムストリップの「全画像に同じ編集を適用」トグル（切り抜き・調整で共有） */
  applyToAll: boolean;
  setApplyToAllMode: (next: boolean) => void;
}

/** 変換が恒等（回転・反転なし）か */
const isIdentityTransform = (transform: CropTransform): boolean =>
  transform.rotation === IDENTITY_TRANSFORM.rotation &&
  transform.flipHorizontal === IDENTITY_TRANSFORM.flipHorizontal &&
  transform.flipVertical === IDENTITY_TRANSFORM.flipVertical;

/**
 * ワークスペースの 6 ツールの状態と「適用 → currentFile 差し替え」を束ねるフック。
 * 破壊的適用は既存のバッチ関数を対象インデックスのみで実行し、
 * 成功結果で documents の currentFile を差し替えて履歴へ積む。
 */
export function useStudioTools(docs: StudioDocuments): StudioTools {
  const { files, selectedIndex, replaceFiles } = docs;
  const [tool, setTool] = useState<StudioToolId>("crop");

  const [applyingTool, setApplyingTool] = useState<StudioToolId | null>(null);
  const [aiProgress, setAiProgress] = useState<AiProgressState | null>(null);
  const [applyError, setApplyError] = useState(false);
  const [applyFailures, setApplyFailures] = useState<string[]>([]);

  // ---- 適用範囲（全画像一括 / 画像ごと）。切り抜き・調整の dual-store が共有する ----
  const [applyToAll, setApplyToAll] = useState(true);

  // ---- 切り抜き ----
  const [aspectRatioId, setAspectRatioId] = useState("free");
  const [cropPreserveExif, setCropPreserveExif] = useState(true);
  const areaStore = useApplyScopeStore<CropArea | null>(
    applyToAll,
    selectedIndex,
    null,
  );
  const transformStore = useApplyScopeStore<CropTransform>(
    applyToAll,
    selectedIndex,
    IDENTITY_TRANSFORM,
  );
  const aspectRatio = useMemo(
    () =>
      ASPECT_RATIO_PRESETS.find((preset) => preset.id === aspectRatioId)
        ?.ratio ?? null,
    [aspectRatioId],
  );

  // ---- 調整（edit の 3 系統 dual-store + LUT レジストリを再利用） ----
  const scopeStores = useEditScopeStores(applyToAll, selectedIndex);
  const lutRegistry = useLutRegistry(scopeStores.lut.current);

  // ---- レタッチ ----
  const [redactStyle, setRedactStyle] =
    useState<RedactStyle>(DEFAULT_REDACT_STYLE);
  const [retouchPreserveExif, setRetouchPreserveExif] = useState(true);
  const [perImageRegions, setPerImageRegions] = useState<
    Record<number, RedactRegion[]>
  >({});
  const nextRegionIdRef = useRef(1);

  // ---- AI ----
  const [upscaleScale, setUpscaleScale] = useState<UpscaleScale>(2);
  const [upscalePreserveExif, setUpscalePreserveExif] = useState(true);
  const [removeBgFormat, setRemoveBgFormat] =
    useState<RemoveBgOutputFormat>("png");
  const [removeBgPreserveExif, setRemoveBgPreserveExif] = useState(false);
  const upscaleHandleRef = useRef<UpscaleBatchHandle | null>(null);
  const removeBgHandleRef = useRef<RemoveBgBatchHandle | null>(null);

  // ---- 情報 / メタデータ ----
  const metadataManager = useMetadataManager();
  const { analyzeFiles } = metadataManager;

  // 情報ツール表示中はファイルセットの変化に追随して再解析する
  useEffect(() => {
    if (tool === "info" && files.length > 0) {
      void analyzeFiles(files);
    }
  }, [tool, files, analyzeFiles]);

  // アンマウント時に実行中の AI バッチを止める（Worker の後始末）
  useEffect(() => {
    return () => {
      upscaleHandleRef.current?.cancel();
      removeBgHandleRef.current?.cancel();
    };
  }, []);

  /** 適用開始の共通前処理（前回のエラー通知をクリアする） */
  const beginApply = useCallback(() => {
    setApplyError(false);
    setApplyFailures([]);
  }, []);

  /** 適用の共通後処理（成功分の差し替え + 履歴ラベル + 失敗通知） */
  const commitUpdates = useCallback(
    (
      updates: Map<number, File>,
      failures: string[],
      label: StudioHistoryLabel,
    ) => {
      replaceFiles(updates, label);
      setApplyFailures(failures);
    },
    [replaceFiles],
  );

  // ---- 切り抜きの適用 ----
  const setCurrentTransform = useCallback(
    (transform: CropTransform, resetArea = false) => {
      transformStore.setCurrent(transform);
      if (resetArea) {
        // 向きが変わり寸法が入れ替わるためトリミング領域はリセットする
        areaStore.setCurrent(null);
      }
    },
    [transformStore.setCurrent, areaStore.setCurrent],
  );

  const resetCrop = useCallback(() => {
    areaStore.reset();
    transformStore.reset();
    setAspectRatioId("free");
  }, [areaStore.reset, transformStore.reset]);

  const cropCanApply = files.some((_, index) => {
    const area = resolveScopedValueForIndex(index, areaStore.state, null);
    const transform = resolveScopedValueForIndex(
      index,
      transformStore.state,
      IDENTITY_TRANSFORM,
    );
    return area !== null || !isIdentityTransform(transform);
  });

  const applyCrop = useCallback(async () => {
    if (applyingTool !== null || files.length === 0) return;
    // 領域も変換もない画像は再エンコードしない（無駄な世代劣化を避ける）
    const indices: number[] = [];
    const jobs: CropJob[] = [];
    files.forEach((_, index) => {
      const area = resolveScopedValueForIndex(index, areaStore.state, null);
      const transform = resolveScopedValueForIndex(
        index,
        transformStore.state,
        IDENTITY_TRANSFORM,
      );
      if (area !== null || !isIdentityTransform(transform)) {
        indices.push(index);
        jobs.push({ area, transform });
      }
    });
    if (indices.length === 0) return;

    beginApply();
    setApplyingTool("crop");
    try {
      const results = await cropImages(
        indices.map((index) => files[index]),
        jobs,
        undefined,
        cropPreserveExif,
      );
      const { updates, failures } = collectCropResultUpdates(
        results,
        indices,
        files,
      );
      commitUpdates(
        updates,
        failures,
        aspectRatioId === "free"
          ? { key: "crop" }
          : { key: "cropRatio", params: { ratio: aspectRatioId } },
      );
      // 適用後は寸法が変わるため領域・変換をリセットする
      resetCrop();
    } catch (error) {
      console.error("Crop apply error:", error);
      setApplyError(true);
    } finally {
      setApplyingTool(null);
    }
  }, [
    applyingTool,
    files,
    areaStore.state,
    transformStore.state,
    aspectRatioId,
    cropPreserveExif,
    beginApply,
    commitUpdates,
    resetCrop,
  ]);

  // ---- 調整の確定（焼き込み） ----
  const buildCurrentEditJobs = useCallback(
    () =>
      buildEditJobs(
        files.length,
        scopeStores.adjustments.state,
        scopeStores.lut.state,
        lutRegistry.resolveLutApplication,
        scopeStores.toneCurve.state,
      ),
    [
      files.length,
      scopeStores.adjustments.state,
      scopeStores.lut.state,
      lutRegistry.resolveLutApplication,
      scopeStores.toneCurve.state,
    ],
  );

  const applyAdjust = useCallback(async () => {
    if (applyingTool !== null || files.length === 0) return;
    const jobs = buildCurrentEditJobs();
    // 無調整の画像は再エンコードしない
    const indices = files
      .map((_, index) => index)
      .filter((index) => {
        const job = jobs[index];
        return (
          job.lut != null ||
          job.curve != null ||
          Object.values(job.adjustments).some((value) => value !== 0)
        );
      });
    if (indices.length === 0) return;

    beginApply();
    setApplyingTool("adjust");
    try {
      const subsetFiles = indices.map((index) => files[index]);
      const { results, failures } = await editImages(
        subsetFiles,
        indices.map((index) => jobs[index]),
        undefined,
        // 焼き込みは元形式維持・EXIF 保持（削除は情報ツール / 書き出しで行う）
        { outputFormat: "original", preserveExif: true },
      );
      // results は成功分のみ・入力順を保持するため、カーソル + ファイル名照合で突き合わせる。
      // 同名ファイルは投入時に addUniqueFilesWithLimit（名前+サイズ）で重複除外されるが、
      // 同名別サイズは共存しうるため名前一致だけでは完全な一意性は保証できない。
      // ここでは「名前が一致しない場合は取りこぼす」安全側に倒している（誤った画像への誤適用を避ける）。
      const updates = new Map<number, File>();
      let cursor = 0;
      for (const [position, index] of indices.entries()) {
        const result = results[cursor];
        if (result && result.originalFilename === subsetFiles[position].name) {
          updates.set(index, fileFromBlob(files[index].name, result.blob));
          // buildEditResult が生成する object URL はワークスペースでは使わないため即解放する
          URL.revokeObjectURL(result.url);
          cursor += 1;
        }
      }
      // 調整項目数（非ゼロの調整 + LUT + トーンカーブ）を履歴ラベルに残す
      const firstJob = jobs[indices[0]];
      const adjustedCount =
        Object.values(firstJob.adjustments).filter((value) => value !== 0)
          .length +
        (firstJob.lut ? 1 : 0) +
        (firstJob.curve ? 1 : 0);
      commitUpdates(
        updates,
        failures.map((failure) => failure.fileName),
        { key: "adjust", params: { count: adjustedCount } },
      );
      // 焼き込み済みの調整は初期値へ戻す（二重適用を防ぐ）
      scopeStores.resetAll();
      lutRegistry.setCustomLutName(null);
    } catch (error) {
      console.error("Adjust apply error:", error);
      setApplyError(true);
    } finally {
      setApplyingTool(null);
    }
  }, [
    applyingTool,
    files,
    buildCurrentEditJobs,
    beginApply,
    commitUpdates,
    scopeStores.resetAll,
    lutRegistry.setCustomLutName,
  ]);

  // ---- レタッチ ----
  const currentRegions = perImageRegions[selectedIndex] ?? EMPTY_REGIONS;

  const handleAddRegion = useCallback(
    (area: CropArea) => {
      const region: RedactRegion = { id: nextRegionIdRef.current, area };
      nextRegionIdRef.current += 1;
      setPerImageRegions((prev) => ({
        ...prev,
        [selectedIndex]: addRegion(
          prev[selectedIndex] ?? EMPTY_REGIONS,
          region,
        ),
      }));
    },
    [selectedIndex],
  );

  const handleUpdateRegion = useCallback(
    (id: number, area: CropArea) => {
      setPerImageRegions((prev) => ({
        ...prev,
        [selectedIndex]: updateRegionArea(
          prev[selectedIndex] ?? EMPTY_REGIONS,
          id,
          area,
        ),
      }));
    },
    [selectedIndex],
  );

  const handleRemoveRegion = useCallback(
    (id: number) => {
      setPerImageRegions((prev) => ({
        ...prev,
        [selectedIndex]: removeRegion(prev[selectedIndex] ?? EMPTY_REGIONS, id),
      }));
    },
    [selectedIndex],
  );

  const clearRegions = useCallback(() => {
    setPerImageRegions((prev) => ({ ...prev, [selectedIndex]: EMPTY_REGIONS }));
  }, [selectedIndex]);

  // ---- レタッチ自動検出（顔・ナンバープレート） ----
  // 候補は「現在表示中の画像」に対する一時状態。画像の切替・差し替えで無効化する
  const [detectionState, setDetectionState] = useState<{
    candidates: DetectionCandidate[];
    imageWidth: number;
    imageHeight: number;
  } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectionDownloadPercent, setDetectionDownloadPercent] = useState<
    number | null
  >(null);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [detectionSelection, setDetectionSelection] = useState<
    Record<DetectionCategory, boolean>
  >({ face: true, plate: true });
  const detectionSupported = useMemo(() => isDetectionSupported(), []);
  // 実行中の検出が「どの画像表示に対するものか」を識別する世代トークン。
  // 画像切替・差し替えでインクリメントし、完了時に世代が一致しない結果は破棄する
  // （await 中の Promise 自体はキャンセルできないため、結果適用側でガードする）
  const detectionRunIdRef = useRef(0);

  // 画像の切替・差し替えで検出候補と失敗表示をリセットする
  // biome-ignore lint/correctness/useExhaustiveDependencies: files / selectedIndex の変化をリセットのトリガーに使う
  useEffect(() => {
    detectionRunIdRef.current += 1;
    setDetectionState(null);
    setDetectionFailed(false);
  }, [selectedIndex, files]);

  const runDetection = useCallback(
    async (source: HTMLCanvasElement) => {
      if (detecting || !detectionSupported) return;
      const runId = detectionRunIdRef.current;
      setDetecting(true);
      setDetectionFailed(false);
      setDetectionState(null);
      try {
        const ctx = source.getContext("2d");
        if (!ctx) {
          throw new Error("2D コンテキストを取得できませんでした");
        }
        const imageData = ctx.getImageData(0, 0, source.width, source.height);
        const result = await detectPrivacyRegions(
          imageData.data,
          source.width,
          source.height,
          (_stage, loadedBytes, totalBytes) => {
            setDetectionDownloadPercent(
              totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : 0,
            );
          },
        );
        // 実行中に画像が切り替わっていた場合、この結果は別画像基準の座標のため破棄する
        if (detectionRunIdRef.current !== runId) return;
        setDetectionState({
          candidates: result.candidates,
          imageWidth: source.width,
          imageHeight: source.height,
        });
        setDetectionSelection({ face: true, plate: true });
      } catch (error) {
        console.error("Auto-detection error:", error);
        if (detectionRunIdRef.current === runId) {
          setDetectionFailed(true);
        }
      } finally {
        setDetecting(false);
        setDetectionDownloadPercent(null);
      }
    },
    [detecting, detectionSupported],
  );

  const toggleDetectionCategory = useCallback(
    (category: DetectionCategory, checked: boolean) => {
      setDetectionSelection((prev) => ({ ...prev, [category]: checked }));
    },
    [],
  );

  const detectionCounts = useMemo(
    () => countByCategory(detectionState?.candidates ?? []),
    [detectionState],
  );

  const detectionSelectedCount =
    (detectionSelection.face ? detectionCounts.face : 0) +
    (detectionSelection.plate ? detectionCounts.plate : 0);

  /** 選択中カテゴリの候補をパディング付きの通常レタッチ領域へ変換する */
  const addDetectedRegions = useCallback(() => {
    if (!detectionState) return;
    const selected = detectionState.candidates.filter(
      (candidate) => detectionSelection[candidate.category],
    );
    if (selected.length === 0) return;
    const regions: RedactRegion[] = selected.map((candidate) => {
      const region: RedactRegion = {
        id: nextRegionIdRef.current,
        area: expandDetectionRect(
          candidate.rect,
          detectionState.imageWidth,
          detectionState.imageHeight,
          DETECTION_PADDING_RATIO,
        ),
      };
      nextRegionIdRef.current += 1;
      return region;
    });
    setPerImageRegions((prev) => ({
      ...prev,
      [selectedIndex]: [...(prev[selectedIndex] ?? EMPTY_REGIONS), ...regions],
    }));
    // 追加済みの候補は破線表示から通常領域へ移行するためクリアする
    setDetectionState(null);
  }, [detectionState, detectionSelection, selectedIndex]);

  const totalRegionCount = useMemo(
    () =>
      files.reduce(
        (sum, _, index) => sum + (perImageRegions[index]?.length ?? 0),
        0,
      ),
    [files, perImageRegions],
  );

  const applyRetouch = useCallback(async () => {
    if (applyingTool !== null || totalRegionCount === 0) return;
    // 領域のある画像だけ処理する（未指定画像は再エンコードしない）
    const indices = files
      .map((_, index) => index)
      .filter((index) => (perImageRegions[index]?.length ?? 0) > 0);

    beginApply();
    setApplyingTool("retouch");
    try {
      const subsetRegions: Record<number, RedactRegion[]> = {};
      indices.forEach((index, position) => {
        subsetRegions[position] = perImageRegions[index] ?? EMPTY_REGIONS;
      });
      const results = await redactImages(
        indices.map((index) => files[index]),
        { perImageRegions: subsetRegions },
        redactStyle,
        undefined,
        retouchPreserveExif,
      );
      const { updates, failures } = collectCropResultUpdates(
        results,
        indices,
        files,
      );
      const retouchLabelKey =
        redactStyle.mode === "mosaic"
          ? ("retouchMosaic" as const)
          : redactStyle.mode === "blur"
            ? ("retouchBlur" as const)
            : ("retouchFill" as const);
      commitUpdates(updates, failures, {
        key: retouchLabelKey,
        params: { count: totalRegionCount },
      });
      // 焼き込み済みの領域はクリアする
      setPerImageRegions({});
      nextRegionIdRef.current = 1;
    } catch (error) {
      console.error("Retouch apply error:", error);
      setApplyError(true);
    } finally {
      setApplyingTool(null);
    }
  }, [
    applyingTool,
    files,
    perImageRegions,
    totalRegionCount,
    redactStyle,
    retouchPreserveExif,
    beginApply,
    commitUpdates,
  ]);

  // ---- AI 拡大 ----
  const applyUpscale = useCallback(async () => {
    if (applyingTool !== null || files.length === 0) return;
    beginApply();
    setApplyingTool("upscale");
    setAiProgress({ stage: "download", percent: 0 });

    const handle = runUpscaleBatch(
      files,
      { scale: upscaleScale, preserveExif: upscalePreserveExif },
      {
        onDownloadProgress: (_stage, loadedBytes, totalBytes) => {
          setAiProgress({
            stage: "download",
            percent: totalBytes
              ? Math.round((loadedBytes / totalBytes) * 100)
              : 0,
          });
        },
        onFileProgress: (fileIndex, totalFiles, tileFraction) => {
          setAiProgress({
            stage: "inference",
            currentFile: fileIndex + 1,
            totalFiles,
            percent: Math.round(
              ((fileIndex + tileFraction) / totalFiles) * 100,
            ),
          });
        },
      },
    );
    upscaleHandleRef.current = handle;

    try {
      const { results } = await handle.promise;
      const indices = files.map((_, index) => index);
      const { updates, failures } = collectCropResultUpdates(
        // キャンセル時は完了済みぶんだけ結果が入る（先頭からの部分列）
        results,
        indices,
        files,
      );
      commitUpdates(updates, failures, {
        key: "upscale",
        params: { scale: upscaleScale },
      });
    } catch (error) {
      console.error("Upscale apply error:", error);
      setApplyError(true);
    } finally {
      upscaleHandleRef.current = null;
      setApplyingTool(null);
      setAiProgress(null);
    }
  }, [
    applyingTool,
    files,
    upscaleScale,
    upscalePreserveExif,
    beginApply,
    commitUpdates,
  ]);

  // ---- AI 背景除去 ----
  const applyRemoveBg = useCallback(async () => {
    if (applyingTool !== null || files.length === 0) return;
    beginApply();
    setApplyingTool("removebg");
    setAiProgress({ stage: "download", percent: 0 });

    const handle = runRemoveBgBatch(
      files,
      { outputFormat: removeBgFormat, preserveExif: removeBgPreserveExif },
      {
        onDownloadProgress: (_stage, loadedBytes, totalBytes) => {
          setAiProgress({
            stage: "download",
            percent: totalBytes
              ? Math.round((loadedBytes / totalBytes) * 100)
              : 0,
          });
        },
        onFileProgress: (fileIndex, totalFiles) => {
          setAiProgress({
            stage: "inference",
            currentFile: Math.min(fileIndex + 1, totalFiles),
            totalFiles,
            percent: Math.round((fileIndex / totalFiles) * 100),
          });
        },
      },
    );
    removeBgHandleRef.current = handle;

    try {
      const { results } = await handle.promise;
      const indices = files.map((_, index) => index);
      const { updates, failures } = collectCropResultUpdates(
        results,
        indices,
        files,
      );
      commitUpdates(updates, failures, { key: "removebg" });
    } catch (error) {
      console.error("Remove background apply error:", error);
      setApplyError(true);
    } finally {
      removeBgHandleRef.current = null;
      setApplyingTool(null);
      setAiProgress(null);
    }
  }, [
    applyingTool,
    files,
    removeBgFormat,
    removeBgPreserveExif,
    beginApply,
    commitUpdates,
  ]);

  const cancelAi = useCallback(() => {
    upscaleHandleRef.current?.cancel();
    removeBgHandleRef.current?.cancel();
  }, []);

  // ---- 情報 / メタデータの削除 ----
  const applyMetadataRemoval = useCallback(async () => {
    if (applyingTool !== null || files.length === 0) return;
    beginApply();
    setApplyingTool("info");
    try {
      // removeSelectedMetadata は解析済みの全ファイルを入力順で返す
      const cleaned = await metadataManager.removeSelectedMetadata();
      if (cleaned.length === files.length) {
        const updates = new Map<number, File>();
        cleaned.forEach((file, index) => {
          updates.set(index, fileFromBlob(files[index].name, file));
        });
        commitUpdates(updates, [], { key: "metadata" });
        // 差し替え後のファイルで再解析する（tool === "info" の effect が files 変化で発火）
      } else if (metadataManager.removeError) {
        setApplyError(true);
      }
    } catch (error) {
      console.error("Metadata removal error:", error);
      setApplyError(true);
    } finally {
      setApplyingTool(null);
    }
  }, [applyingTool, files, metadataManager, beginApply, commitUpdates]);

  // ---- 適用範囲の切替（切り抜き・調整の全ストアの現在値を移行してから切り替える） ----
  const setApplyToAllMode = useCallback(
    (next: boolean) => {
      if (next === applyToAll) return;
      areaStore.migrate(next);
      transformStore.migrate(next);
      scopeStores.migrateAll(next);
      setApplyToAll(next);
    },
    [
      applyToAll,
      areaStore.migrate,
      transformStore.migrate,
      scopeStores.migrateAll,
    ],
  );

  return {
    tool,
    setTool,
    applyingTool,
    aiProgress,
    applyError,
    applyFailures,
    cancelAi,
    crop: {
      aspectRatioId,
      setAspectRatioId,
      aspectRatio,
      currentArea: areaStore.current,
      setCurrentArea: areaStore.setCurrent,
      currentTransform: transformStore.current,
      setCurrentTransform,
      preserveExif: cropPreserveExif,
      setPreserveExif: setCropPreserveExif,
      reset: resetCrop,
      canApply: cropCanApply,
      apply: applyCrop,
    },
    adjust: {
      scopeStores,
      lutRegistry,
      canApply: scopeStores.hasAdjustments,
      reset: () => {
        scopeStores.resetAll();
        lutRegistry.setCustomLutName(null);
      },
      apply: applyAdjust,
    },
    retouch: {
      style: redactStyle,
      setStyle: setRedactStyle,
      currentRegions,
      addRegion: handleAddRegion,
      updateRegion: handleUpdateRegion,
      removeRegion: handleRemoveRegion,
      clearRegions,
      totalRegionCount,
      preserveExif: retouchPreserveExif,
      setPreserveExif: setRetouchPreserveExif,
      canApply: totalRegionCount > 0,
      apply: applyRetouch,
      detect: {
        supported: detectionSupported,
        running: detecting,
        downloadPercent: detectionDownloadPercent,
        failed: detectionFailed,
        candidates: detectionState?.candidates ?? null,
        counts: detectionCounts,
        selection: detectionSelection,
        toggleCategory: toggleDetectionCategory,
        selectedCount: detectionSelectedCount,
        run: runDetection,
        addSelectedToRegions: addDetectedRegions,
      },
    },
    upscale: {
      scale: upscaleScale,
      setScale: setUpscaleScale,
      preserveExif: upscalePreserveExif,
      setPreserveExif: setUpscalePreserveExif,
      apply: applyUpscale,
    },
    removebg: {
      outputFormat: removeBgFormat,
      setOutputFormat: setRemoveBgFormat,
      preserveExif: removeBgPreserveExif,
      setPreserveExif: setRemoveBgPreserveExif,
      apply: applyRemoveBg,
    },
    info: {
      manager: metadataManager,
      remove: applyMetadataRemoval,
    },
    buildCurrentEditJobs,
    applyToAll,
    setApplyToAllMode,
  };
}
