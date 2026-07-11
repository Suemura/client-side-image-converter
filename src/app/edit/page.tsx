"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { HandoffNotice } from "../../components/HandoffNotice";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import { useHandoffReceiver } from "../../hooks/useHandoffReceiver";
import {
  type AdjustmentState,
  DEFAULT_ADJUSTMENTS,
  type EditState,
  isDefaultAdjustments,
  resolveAdjustmentForIndex,
} from "../../utils/adjustments";
import { SUPPORTED_IMAGE_FORMATS } from "../../utils/constants";
import {
  averageRgb,
  clampSampleWindow,
  computeAutoLevels,
  computeAutoWhiteBalance,
  computeWhiteBalanceForNeutralPoint,
  WB_SAMPLE_RADIUS,
} from "../../utils/autoAdjust";
import {
  computeHistogram,
  type HistogramData,
  resolveHistogramSampleSize,
} from "../../utils/histogram";
import type {
  ConversionFailure,
  ConversionResult,
} from "../../utils/imageConverter";
import { renderOrientedImage } from "../../utils/imageCropper";
import {
  type EditJob,
  type EditOutputFormat,
  editImages,
} from "../../utils/imageEditor";
import type { LutData } from "../../utils/lutParser";
import {
  DEFAULT_LUT_SELECTION,
  isDefaultLutSelection,
  type LutSelection,
  type LutSelectionState,
  resolveLutForIndex,
} from "../../utils/lutState";
import {
  buildToneCurveTable,
  DEFAULT_TONE_CURVE,
  isDefaultToneCurve,
  resolveToneCurveForIndex,
  type ToneCurveEditState,
  type ToneCurveState,
} from "../../utils/toneCurve";
import type { LutApplication } from "../../utils/webglImageRenderer";
import { ConversionErrors } from "../convert/components/ConversionErrors";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { ProgressBar } from "../convert/components/ProgressBar";
import { AdjustmentPanel } from "./components/AdjustmentPanel";
import { CompareView } from "./components/CompareView";
import { EditToolbar } from "./components/EditToolbar";
import { HistogramPanel } from "./components/HistogramPanel";
import { LutPicker } from "./components/LutPicker";
import { ToneCurvePanel } from "./components/ToneCurvePanel";
import styles from "./edit.module.css";

/**
 * 編集前ソース（EXIF 補正済みキャンバス）から輝度ヒストグラムを縮小サンプリングで算出する。
 * トーンカーブ背景用（x 軸＝カーブ入力値に対する分布）で、画像切替時に 1 回だけ実行される。
 * CompareView の編集後サンプリングと同じく point sampling（smoothing 無効）で決定的に縮小する。
 */
const computeSourceHistogram = (
  canvas: HTMLCanvasElement,
): HistogramData | null => {
  const { width, height } = resolveHistogramSampleSize(
    canvas.width,
    canvas.height,
  );
  if (width <= 0 || height <= 0) {
    return null;
  }
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, width, height);
  return computeHistogram(ctx.getImageData(0, 0, width, height).data);
};

export default function EditPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  // EXIF 補正済みのプレビューソース。WB スポイトが getImageData で近傍を読むため
  // EditableSource ではなく 2D キャンバスに絞って保持する（renderOrientedImage の実返却型）
  const [previewSource, setPreviewSource] = useState<HTMLCanvasElement | null>(
    null,
  );
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [editResults, setEditResults] = useState<ConversionResult[]>([]);
  const [editFailures, setEditFailures] = useState<ConversionFailure[]>([]);

  // 調整・LUT 適用後のプレビューから算出したヒストグラム（CompareView からフレームを受け取る）
  const [histogram, setHistogram] = useState<HistogramData | null>(null);

  // トーンカーブ背景用の編集前（カーブ適用前）ヒストグラム。編集後の histogram を流用すると
  // カーブのドラッグで背景の分布自体が動くフィードバックループになるため分離する
  // （HistogramPanel = 適用後のモニタ / カーブ背景 = 入力側の安定した参照、と役割を分ける）
  const [sourceHistogram, setSourceHistogram] = useState<HistogramData | null>(
    null,
  );

  // WB スポイトモード（モード中はプレビューのクリックで中性点を指定する）
  const [wbEyedropperActive, setWbEyedropperActive] = useState(false);

  // CompareView へ渡すコールバックは安定参照にし、無関係な再レンダーで
  // 編集後描画（GPU 再描画・再サンプリング）を誘発しない
  const handleEditedFrame = useCallback((frame: ImageData) => {
    setHistogram(computeHistogram(frame.data));
  }, []);

  // 出力設定
  const [preserveExif, setPreserveExif] = useState(false);
  const [outputFormat, setOutputFormat] =
    useState<EditOutputFormat>("original");

  // 調整（一括 / 画像ごとの dual-store。crop の apply-scope パターンを踏襲）
  const [applyToAll, setApplyToAll] = useState(true);
  const [sharedAdjustments, setSharedAdjustments] =
    useState<AdjustmentState>(DEFAULT_ADJUSTMENTS);
  const [perImageAdjustments, setPerImageAdjustments] = useState<
    Record<number, AdjustmentState>
  >({});

  // LUT 選択（調整と同じ applyToAll トグルを共有する dual-store）
  const [sharedLut, setSharedLut] = useState<LutSelection>(
    DEFAULT_LUT_SELECTION,
  );
  const [perImageLut, setPerImageLut] = useState<Record<number, LutSelection>>(
    {},
  );

  // トーンカーブ（調整・LUT と同じ applyToAll トグルを共有する dual-store）
  const [sharedToneCurve, setSharedToneCurve] =
    useState<ToneCurveState>(DEFAULT_TONE_CURVE);
  const [perImageToneCurve, setPerImageToneCurve] = useState<
    Record<number, ToneCurveState>
  >({});
  // 選択された LUT データの実体を保持するレジストリ（lutId → LutData）。
  // 状態には軽量な選択（lutId + strength）だけを持ち、重いデータ本体は ref で参照する。
  const lutRegistryRef = useRef<Map<string, LutData>>(new Map());
  const [customLutName, setCustomLutName] = useState<string | null>(null);
  // レジストリ更新（プリセット読み込み・カスタム上書き）を currentLut の再解決へ伝えるバージョン。
  // ref は再レンダーを起こさないため、登録時にこのカウンタを進めて useMemo を無効化する。
  const [lutRegistryVersion, setLutRegistryVersion] = useState(0);

  // 現在表示中の画像へ適用する調整（一括 / 画像ごとで解決）
  const currentAdjustments = applyToAll
    ? sharedAdjustments
    : (perImageAdjustments[currentPreviewIndex] ?? DEFAULT_ADJUSTMENTS);

  // 現在表示中の画像へ適用する LUT 選択（一括 / 画像ごとで解決）
  const currentLutSelection = applyToAll
    ? sharedLut
    : (perImageLut[currentPreviewIndex] ?? DEFAULT_LUT_SELECTION);

  // 現在表示中の画像へ適用するトーンカーブ（一括 / 画像ごとで解決）
  const currentToneCurve = applyToAll
    ? sharedToneCurve
    : (perImageToneCurve[currentPreviewIndex] ?? DEFAULT_TONE_CURVE);

  // プレビューへ渡す焼成済みテーブル。恒等は null（GPU/CPU ともサンプリングをスキップ）。
  // カーブ state が変わったときだけ再焼成し、無関係な再レンダーでの GPU 再アップロードを防ぐ
  // （currentLut のメモ化と同方針）。
  const currentCurveTable = useMemo(
    () =>
      isDefaultToneCurve(currentToneCurve)
        ? null
        : buildToneCurveTable(currentToneCurve),
    [currentToneCurve],
  );

  // 選択を LUT データ + 強度へ解決する（レジストリ未登録時は null）
  const resolveLutApplication = useCallback(
    (selection: LutSelection): LutApplication | null => {
      if (!selection.lutId) {
        return null;
      }
      const data = lutRegistryRef.current.get(selection.lutId);
      if (!data) {
        return null;
      }
      return { data, strength: selection.strength / 100 };
    },
    [],
  );

  // currentLut は毎レンダーで新オブジェクトになると CompareView の編集後描画（CPU パスは全画素ループ）を
  // 無関係な再レンダー（進捗更新など）でも再発火させるため、選択・レジストリ版が変わったときだけ再解決する。
  // lutRegistryVersion は ref レジストリ（コールバック本体からは読まれない）の更新を反映するための意図的な依存。
  // biome-ignore lint/correctness/useExhaustiveDependencies: lutRegistryVersion は ref レジストリ更新の再解決トリガ
  const currentLut = useMemo(
    () => resolveLutApplication(currentLutSelection),
    [resolveLutApplication, currentLutSelection, lutRegistryVersion],
  );

  // 調整を一括 / 画像ごとの適切なストアへ書き込む（crop の setCurrentArea 相当）
  const setCurrentAdjustments = useCallback(
    (next: AdjustmentState) => {
      if (applyToAll) {
        setSharedAdjustments(next);
      } else {
        setPerImageAdjustments((prev) => ({
          ...prev,
          [currentPreviewIndex]: next,
        }));
      }
    },
    [applyToAll, currentPreviewIndex],
  );

  // LUT 選択を一括 / 画像ごとの適切なストアへ書き込む
  const setCurrentLutSelection = useCallback(
    (next: LutSelection) => {
      if (applyToAll) {
        setSharedLut(next);
      } else {
        setPerImageLut((prev) => ({
          ...prev,
          [currentPreviewIndex]: next,
        }));
      }
    },
    [applyToAll, currentPreviewIndex],
  );

  // トーンカーブを一括 / 画像ごとの適切なストアへ書き込む
  const setCurrentToneCurve = useCallback(
    (next: ToneCurveState) => {
      if (applyToAll) {
        setSharedToneCurve(next);
      } else {
        setPerImageToneCurve((prev) => ({
          ...prev,
          [currentPreviewIndex]: next,
        }));
      }
    },
    [applyToAll, currentPreviewIndex],
  );

  // 読み込んだ LUT データをレジストリへ登録する（LutPicker から呼ばれる）。
  // カスタム LUT の再アップロードは同一スロット（CUSTOM_LUT_ID）を上書きするため、
  // データが実際に変わった場合のみバージョンを進めてプレビューの再解決を促す。
  const registerLut = useCallback((id: string, data: LutData) => {
    const prev = lutRegistryRef.current.get(id);
    lutRegistryRef.current.set(id, data);
    if (prev !== data) {
      setLutRegistryVersion((v) => v + 1);
    }
  }, []);

  // 画像切替に合わせて EXIF 補正済みのプレビューソース（キャンバス）を生成する
  useEffect(() => {
    if (files.length === 0) {
      setPreviewSource(null);
      return;
    }
    const file = files[currentPreviewIndex];
    if (!file) {
      return;
    }
    // 新しい画像の読み込み開始時点で編集前ヒストグラムを破棄する。
    // currentPreviewIndex は同期的に切り替わる一方 sourceHistogram はデコード完了後に
    // しか更新されないため、破棄しないとデコード中に前の画像の統計で自動補正が押せて
    // しまう（stale 統計の適用）。null の間は autoDisabled が自動補正ボタンを無効化する。
    setSourceHistogram(null);
    // 画像切替・ファイル変更時は WB スポイトモードも解除する（前の画像を狙った
    // クリックが新しい画像のソースをサンプルする誤適用を防ぐ）
    setWbEyedropperActive(false);
    let cancelled = false;
    renderOrientedImage(file)
      .then((canvas) => {
        if (cancelled) {
          return;
        }
        setPreviewSource(canvas);
        setPreviewSize({ width: canvas.width, height: canvas.height });
        setSourceHistogram(computeSourceHistogram(canvas));
      })
      .catch((error) => {
        console.error("Preview generation failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [files, currentPreviewIndex]);

  // 自動補正（ワンショット）: 編集前ヒストグラムの統計から該当スライダー値を算出して
  // 上書きする。書き込みは setCurrentAdjustments 経由のため一括 / 画像ごとの挙動は
  // 手動スライダー操作と同一。編集前統計基準なので同じ画像で再押下しても値は変わらない（冪等）。
  const handleAutoLevels = useCallback(() => {
    if (!sourceHistogram) return;
    const result = computeAutoLevels(sourceHistogram);
    if (!result) return;
    setCurrentAdjustments({ ...currentAdjustments, ...result });
  }, [sourceHistogram, currentAdjustments, setCurrentAdjustments]);

  const handleAutoWhiteBalance = useCallback(() => {
    if (!sourceHistogram) return;
    const result = computeAutoWhiteBalance(sourceHistogram);
    if (!result) return;
    setCurrentAdjustments({ ...currentAdjustments, ...result });
  }, [sourceHistogram, currentAdjustments, setCurrentAdjustments]);

  const handleToggleEyedropper = useCallback(() => {
    setWbEyedropperActive((active) => !active);
  }, []);

  // WB スポイト: クリック点（ソース自然座標）の編集前ソース近傍（5×5）平均から
  // temperature / tint を逆算してセットする。編集後キャンバスから読むと補正結果が
  // 次のサンプル値へ混入するフィードバックになるため、必ず編集前ソースを読む
  // （同じ点の再クリックで値が変わらない = 冪等。自動補正と同じ編集前統計基準）。
  // 適用後はワンショットとして自動解除する。透明画素（サンプル無効）はモード維持。
  const handleEyedropperPick = useCallback(
    (x: number, y: number) => {
      if (!previewSource) return;
      const sampleWindow = clampSampleWindow(
        x,
        y,
        WB_SAMPLE_RADIUS,
        previewSource.width,
        previewSource.height,
      );
      if (!sampleWindow) return;
      const ctx = previewSource.getContext("2d");
      if (!ctx) return;
      const rgb = averageRgb(
        ctx.getImageData(
          sampleWindow.x,
          sampleWindow.y,
          sampleWindow.width,
          sampleWindow.height,
        ).data,
      );
      if (!rgb) return;
      setCurrentAdjustments({
        ...currentAdjustments,
        ...computeWhiteBalanceForNeutralPoint(rgb),
      });
      setWbEyedropperActive(false);
    },
    [previewSource, currentAdjustments, setCurrentAdjustments],
  );

  // Esc キーでスポイトモードを解除する（モード中のみ購読）
  useEffect(() => {
    if (!wbEyedropperActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWbEyedropperActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [wbEyedropperActive]);

  const resetAdjustments = useCallback(() => {
    setSharedAdjustments(DEFAULT_ADJUSTMENTS);
    setPerImageAdjustments({});
    setSharedLut(DEFAULT_LUT_SELECTION);
    setPerImageLut({});
    setSharedToneCurve(DEFAULT_TONE_CURVE);
    setPerImageToneCurve({});
  }, []);

  // 結果の object URL（buildEditResult の createObjectURL 由来）を解放する。
  // ConversionResults 側では revoke されないため、結果を破棄・置換する前にページ側で解放する。
  const revokeResultUrls = useCallback((results: ConversionResult[]) => {
    for (const result of results) {
      URL.revokeObjectURL(result.url);
    }
  }, []);

  const handleFilesSelected = useCallback(
    (selectedFiles: File[]) => {
      const imageFiles = selectedFiles.filter((file) =>
        file.type.startsWith("image/"),
      );
      // FileUploadArea は既存ファイルを保持して末尾に追加する（追記のみ・既存の
      // インデックスは不変）ため、編集中の調整値（共有 / 画像ごと）とプレビュー位置は
      // 維持する。フルリセットは「リストをクリア」（handleClearFiles）で行う。
      // 旧結果は追加後のファイルセットと不整合になるため解放して閉じる。
      revokeResultUrls(editResults);
      setFiles(imageFiles);
      setEditResults([]);
      setEditFailures([]);
    },
    [revokeResultUrls, editResults],
  );

  // 他ツールからのハンドオフ（処理結果の引き継ぎ）を mount 時に取り込む
  // （受理形式は FileUploadArea の既定と同じ UPLOAD_FORMATS）
  const { notice: handoffNotice, clearNotice: clearHandoffNotice } =
    useHandoffReceiver(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
      handleFilesSelected,
    );

  const handleClearFiles = useCallback(() => {
    revokeResultUrls(editResults);
    setFiles([]);
    setCurrentPreviewIndex(0);
    setEditResults([]);
    setEditFailures([]);
    setPreviewSource(null);
    setHistogram(null);
    setSourceHistogram(null);
    setWbEyedropperActive(false);
    resetAdjustments();
    setCustomLutName(null);
    clearHandoffNotice();
  }, [resetAdjustments, revokeResultUrls, editResults, clearHandoffNotice]);

  const handlePreviousImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i > 0 ? i - 1 : files.length - 1));
  }, [files.length]);

  const handleNextImage = useCallback(() => {
    if (files.length === 0) return;
    setCurrentPreviewIndex((i) => (i < files.length - 1 ? i + 1 : 0));
  }, [files.length]);

  // 一括 / 画像ごとの切替時、表示が飛ばないよう現在値を移行先へ引き継ぐ（crop の handleApplyModeChange 踏襲）。
  // 調整・LUT 選択・トーンカーブは同じ applyToAll を共有するためすべて移行する。
  const handleApplyModeChange = useCallback(
    (nextApplyToAll: boolean) => {
      if (nextApplyToAll === applyToAll) return;
      if (nextApplyToAll) {
        setSharedAdjustments(currentAdjustments);
        setSharedLut(currentLutSelection);
        setSharedToneCurve(currentToneCurve);
      } else {
        setPerImageAdjustments((prev) => ({
          ...prev,
          [currentPreviewIndex]: currentAdjustments,
        }));
        setPerImageLut((prev) => ({
          ...prev,
          [currentPreviewIndex]: currentLutSelection,
        }));
        setPerImageToneCurve((prev) => ({
          ...prev,
          [currentPreviewIndex]: currentToneCurve,
        }));
      }
      setApplyToAll(nextApplyToAll);
    },
    [
      applyToAll,
      currentAdjustments,
      currentLutSelection,
      currentToneCurve,
      currentPreviewIndex,
    ],
  );

  const handleStartEditing = useCallback(async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(files.length);
    // 再編集時は旧結果の object URL を解放してから置き換える（リーク防止）
    revokeResultUrls(editResults);
    setEditResults([]);
    setEditFailures([]);

    try {
      const state: EditState = {
        applyToAll,
        sharedAdjustments,
        perImageAdjustments,
      };
      const lutState: LutSelectionState = {
        applyToAll,
        sharedLut,
        perImageLut,
      };
      const curveState: ToneCurveEditState = {
        applyToAll,
        sharedToneCurve,
        perImageToneCurve,
      };
      // 同じ ToneCurveState（一括モードでは全画像で共有）のテーブルを重複焼成しない
      const curveTableCache = new Map<ToneCurveState, Float32Array | null>();
      const curveTableFor = (index: number): Float32Array | null => {
        const resolved = resolveToneCurveForIndex(index, curveState);
        let table = curveTableCache.get(resolved);
        if (table === undefined) {
          table = isDefaultToneCurve(resolved)
            ? null
            : buildToneCurveTable(resolved);
          curveTableCache.set(resolved, table);
        }
        return table;
      };
      const jobs: EditJob[] = files.map((_, index) => ({
        adjustments: resolveAdjustmentForIndex(index, state),
        lut: resolveLutApplication(resolveLutForIndex(index, lutState)),
        curve: curveTableFor(index),
      }));

      const { results, failures } = await editImages(
        files,
        jobs,
        (completed, total) => {
          setProgressCurrent(completed);
          setProgressTotal(total);
        },
        { preserveExif, outputFormat },
      );

      setEditResults(results);
      setEditFailures(failures);
    } catch (error) {
      console.error("Edit error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [
    files,
    applyToAll,
    sharedAdjustments,
    perImageAdjustments,
    sharedLut,
    perImageLut,
    sharedToneCurve,
    perImageToneCurve,
    resolveLutApplication,
    preserveExif,
    outputFormat,
    revokeResultUrls,
    editResults,
  ]);

  const handleClearResults = useCallback(() => {
    revokeResultUrls(editResults);
    setEditResults([]);
    setEditFailures([]);
  }, [revokeResultUrls, editResults]);

  const hasFiles = files.length > 0;
  const hasResults = editResults.length > 0;
  // 一括モードは共有値、画像ごとモードはいずれかの画像に調整 / LUT / カーブがあれば全体リセットを有効化
  const hasAdjustments = applyToAll
    ? !isDefaultAdjustments(sharedAdjustments) ||
      !isDefaultLutSelection(sharedLut) ||
      !isDefaultToneCurve(sharedToneCurve)
    : Object.values(perImageAdjustments).some(
        (adjustments) => !isDefaultAdjustments(adjustments),
      ) ||
      Object.values(perImageLut).some(
        (selection) => !isDefaultLutSelection(selection),
      ) ||
      Object.values(perImageToneCurve).some(
        (toneCurve) => !isDefaultToneCurve(toneCurve),
      );

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>{t("edit.title")}</h1>
          <p className={styles.pageSubtitle}>{t("edit.subtitle")}</p>

          <div className={styles.workspace}>
            {/* 左カラム: ファイル選択・ファイルリスト */}
            <div className={styles.column}>
              <HandoffNotice
                notice={handoffNotice}
                onDismiss={clearHandoffNotice}
              />
              <ImageUploadSection
                files={files}
                onFilesSelected={handleFilesSelected}
                onClearFiles={handleClearFiles}
              />
            </div>

            {/* 中央カラム: プレビュー・ツールバー・実行 */}
            <div className={styles.columnCenter}>
              <h3 className={styles.centerTitle}>{t("edit.previewTitle")}</h3>

              {!hasFiles ? (
                <div className={styles.placeholder}>
                  {t("edit.selectImageFirst")}
                </div>
              ) : (
                <>
                  <CompareView
                    source={previewSource}
                    width={previewSize.width}
                    height={previewSize.height}
                    adjustments={currentAdjustments}
                    lut={currentLut}
                    curve={currentCurveTable}
                    currentIndex={currentPreviewIndex}
                    totalImages={files.length}
                    onPreviousImage={handlePreviousImage}
                    onNextImage={handleNextImage}
                    onEditedFrame={handleEditedFrame}
                    eyedropperActive={wbEyedropperActive}
                    onEyedropperPick={handleEyedropperPick}
                  />

                  <EditToolbar
                    applyToAll={applyToAll}
                    onApplyModeChange={handleApplyModeChange}
                    showApplyMode={files.length > 1}
                    outputFormat={outputFormat}
                    onOutputFormatChange={setOutputFormat}
                    preserveExif={preserveExif}
                    onPreserveExifChange={setPreserveExif}
                    onResetAll={resetAdjustments}
                    hasAdjustments={hasAdjustments}
                  />

                  <div className={styles.actionButton}>
                    {isProcessing ? (
                      <div className={styles.processingText}>
                        {t("edit.editingInProgress")}
                      </div>
                    ) : hasResults ? (
                      <div className={styles.buttonGroup}>
                        <Button
                          variant="primary"
                          onClick={handleStartEditing}
                          disabled={isProcessing}
                        >
                          {t("edit.reEdit")}
                        </Button>
                        <Button variant="secondary" onClick={handleClearFiles}>
                          {t("edit.selectNewImage")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={handleStartEditing}
                        disabled={isProcessing}
                      >
                        {t("edit.apply")}
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 右カラム: ヒストグラム + 調整スライダー + LUT フィルタ */}
            <div className={styles.column}>
              {hasFiles && <HistogramPanel histogram={histogram} />}
              <h4 className={styles.columnTitle}>{t("edit.adjustments")}</h4>
              {hasFiles ? (
                <>
                  <AdjustmentPanel
                    adjustments={currentAdjustments}
                    onAdjustmentsChange={setCurrentAdjustments}
                    onAutoLevels={handleAutoLevels}
                    onAutoWhiteBalance={handleAutoWhiteBalance}
                    onToggleEyedropper={handleToggleEyedropper}
                    eyedropperActive={wbEyedropperActive}
                    autoDisabled={!sourceHistogram}
                  />
                  <ToneCurvePanel
                    curve={currentToneCurve}
                    onCurveChange={setCurrentToneCurve}
                    histogram={sourceHistogram}
                  />
                  <LutPicker
                    selection={currentLutSelection}
                    onSelectionChange={setCurrentLutSelection}
                    registerLut={registerLut}
                    customName={customLutName}
                    onCustomLoaded={setCustomLutName}
                  />
                </>
              ) : (
                <div className={styles.placeholder}>
                  {t("edit.selectImageFirst")}
                </div>
              )}
            </div>
          </div>

          {/* 結果セクション（進捗・失敗通知・処理済みファイル） */}
          <div className={styles.resultsSection}>
            {isProcessing && (
              <ProgressBar
                current={progressCurrent}
                total={progressTotal}
                isVisible={true}
              />
            )}
            <ConversionErrors
              failures={editFailures}
              titleKey="edit.editFailures"
            />
            {hasResults && (
              <ConversionResults
                results={editResults}
                originalFiles={files}
                onClear={handleClearResults}
                handoffOrigin="edit"
              />
            )}
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
