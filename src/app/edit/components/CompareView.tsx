import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AdjustmentState,
  clampAdjustments,
  normalizeAdjustments,
} from "../../../utils/adjustments";
import { displayPointToSourcePixel } from "../../../utils/autoAdjust";
import { resolveHistogramSampleSize } from "../../../utils/histogram";
import {
  type AdjustmentRenderer,
  applyAdjustmentsToCanvas,
  createAdjustmentRenderer,
  type EditableSource,
  type LutApplication,
} from "../../../utils/webglImageRenderer";
import styles from "./CompareView.module.css";

interface CompareViewProps {
  /** EXIF 補正済みのソース（自然座標のキャンバス等） */
  source: EditableSource | null;
  /** ソースの自然寸法 */
  width: number;
  height: number;
  /** 現在表示中の画像へ適用する調整 */
  adjustments: AdjustmentState;
  /** 現在表示中の画像へ適用する LUT（未選択は null） */
  lut: LutApplication | null;
  /** 現在表示中の画像へ適用するトーンカーブの焼成テーブル（恒等は null でスキップ） */
  curve: Float32Array | null;
  /** 複数画像ナビ */
  currentIndex: number;
  totalImages: number;
  onPreviousImage: () => void;
  onNextImage: () => void;
  /**
   * 編集後プレビューの描画完了ごとに、縮小サンプリングした ImageData を渡すコールバック
   * （ヒストグラム算出用）。連続する再描画は rAF で 1 フレーム 1 回に間引かれる。
   */
  onEditedFrame?: (frame: ImageData) => void;
  /** WB スポイトモード中か（true の間は分割ドラッグの代わりにクリック点を拾う） */
  eyedropperActive?: boolean;
  /** スポイトのクリック点（ソース自然座標の画素位置）を親へ渡すコールバック */
  onEyedropperPick?: (x: number, y: number) => void;
}

/**
 * 編集前 / 編集後を分割スライダーで比較表示するプレビュー。
 *
 * 出力（`imageEditor.renderEdited`）と同じ `applyAdjustmentsToCanvas` で編集後を描画するため、
 * プレビューと出力は同一結果になる（WYSIWYG）。WebGL2 レンダラは 1 個だけ保持して調整変更のたびに
 * 再描画し、非対応環境では CPU フォールバック（`applyAdjustmentsToCanvas` の renderer=null 経路）で動作する。
 */
export const CompareView: React.FC<CompareViewProps> = ({
  source,
  width,
  height,
  adjustments,
  lut,
  curve,
  currentIndex,
  totalImages,
  onPreviousImage,
  onNextImage,
  onEditedFrame,
  eyedropperActive = false,
  onEyedropperPick,
}) => {
  const { t } = useTranslation();
  const editedCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRendererRef = useRef<AdjustmentRenderer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // 分割位置（%）。左が編集前、右が編集後
  const [divider, setDivider] = useState(50);

  // onEditedFrame は ref 経由で最新を参照し、コールバックの identity 変化が
  // 編集後描画 effect（GPU 再描画）を誘発しないようにする
  const onEditedFrameRef = useRef(onEditedFrame);
  useEffect(() => {
    onEditedFrameRef.current = onEditedFrame;
  }, [onEditedFrame]);
  // サンプリング用の小キャンバスは使い回す（getImageData 前提の設定で生成）
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleRafRef = useRef(0);

  // 編集後キャンバスを縮小サンプリングして ImageData をコールバックへ渡す。
  // スライダー操作による連続再描画を rAF で 1 フレーム 1 回に間引く（coalesce）。
  const scheduleEditedFrameSample = useCallback((canvas: HTMLCanvasElement) => {
    cancelAnimationFrame(sampleRafRef.current);
    sampleRafRef.current = requestAnimationFrame(() => {
      const callback = onEditedFrameRef.current;
      if (!callback) {
        return;
      }
      const { width: sw, height: sh } = resolveHistogramSampleSize(
        canvas.width,
        canvas.height,
      );
      if (sw <= 0 || sh <= 0) {
        return;
      }
      let sample = sampleCanvasRef.current;
      if (!sample) {
        sample = document.createElement("canvas");
        sampleCanvasRef.current = sample;
      }
      sample.width = sw;
      sample.height = sh;
      const sctx = sample.getContext("2d", { willReadFrequently: true });
      if (!sctx) {
        return;
      }
      // point sampling（nearest-neighbor の等間隔サブサンプリング）で縮小する。
      // 既定の smoothing（バイリニア平均）は分布を中間調へ収縮させ、黒/白クリッピングの
      // 裾や孤立ハイライトを鈍らせるため無効化する（ブラウザ非依存で決定的）。
      // 寸法代入でコンテキスト状態がリセットされるため drawImage の直前で毎回設定する
      sctx.imageSmoothingEnabled = false;
      sctx.drawImage(canvas, 0, 0, sw, sh);
      callback(sctx.getImageData(0, 0, sw, sh));
    });
  }, []);

  // アンマウント時に未実行のサンプリングを破棄する
  useEffect(() => () => cancelAnimationFrame(sampleRafRef.current), []);

  // WebGL レンダラは 1 個だけ生成して再利用し、アンマウントで破棄する（先に生成しておく）。
  // createAdjustmentRenderer は WebGL2 非対応時に null を返すため、事前の可用性チェックは不要
  // （null のとき applyAdjustmentsToCanvas が CPU フォールバックへ切り替わる）。
  useEffect(() => {
    glRendererRef.current = createAdjustmentRenderer();
    return () => {
      glRendererRef.current?.dispose();
      glRendererRef.current = null;
    };
  }, []);

  // 編集前（無調整）を描画する
  useEffect(() => {
    const canvas = originalCanvasRef.current;
    if (!canvas || !source || width <= 0 || height <= 0) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
  }, [source, width, height]);

  // 編集後（調整適用）を描画する。出力経路と同一の applyAdjustmentsToCanvas を使う
  useEffect(() => {
    const canvas = editedCanvasRef.current;
    if (!canvas || !source || width <= 0 || height <= 0) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    try {
      const normalized = normalizeAdjustments(clampAdjustments(adjustments));
      const out = applyAdjustmentsToCanvas(
        source,
        width,
        height,
        normalized,
        glRendererRef.current,
        lut,
        curve,
      );
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(out, 0, 0);
      scheduleEditedFrameSample(canvas);
    } catch (error) {
      console.error("Preview render failed:", error);
    }
  }, [
    source,
    adjustments,
    lut,
    curve,
    width,
    height,
    scheduleEditedFrameSample,
  ]);

  const updateDivider = useCallback((clientX: number) => {
    const el = stageRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setDivider(Math.max(0, Math.min(100, pct)));
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // スポイトモード中は分割ドラッグを開始せず、クリック点をソース自然座標へ写像して
      // 親へ渡す。座標の基準は編集後キャンバスの矩形（stage の border の影響を受けない）。
      // Before/After の両キャンバスは同寸で完全重畳しているため、分割位置に関わらず
      // どちら側をクリックしても同じソース画素に写像される。
      if (eyedropperActive) {
        const canvas = editedCanvasRef.current;
        if (!canvas || !onEyedropperPick) {
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const point = displayPointToSourcePixel(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height,
          width,
          height,
        );
        if (point) {
          onEyedropperPick(point.x, point.y);
        }
        return;
      }
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateDivider(e.clientX);
    },
    [updateDivider, eyedropperActive, onEyedropperPick, width, height],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) {
        updateDivider(e.clientX);
      }
    },
    [updateDivider],
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div className={styles.container}>
      <div
        ref={stageRef}
        className={`${styles.stage}${eyedropperActive ? ` ${styles.stageEyedropper}` : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
      >
        {/* ベース: 編集後 */}
        <canvas
          ref={editedCanvasRef}
          className={styles.baseCanvas}
          data-testid="edit-preview-canvas"
        />
        <span className={`${styles.badge} ${styles.badgeAfter}`}>
          {t("edit.after")}
        </span>

        {/* オーバーレイ: 編集前（分割位置まで表示） */}
        <div
          className={styles.overlay}
          style={{ clipPath: `inset(0 ${100 - divider}% 0 0)` }}
        >
          <canvas ref={originalCanvasRef} className={styles.overlayCanvas} />
          <span className={`${styles.badge} ${styles.badgeBefore}`}>
            {t("edit.before")}
          </span>
        </div>

        {/* 分割ハンドル */}
        <div className={styles.divider} style={{ left: `${divider}%` }}>
          <span className={styles.dividerHandle}>⇔</span>
        </div>
      </div>

      {totalImages > 1 && (
        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navButton}
            onClick={onPreviousImage}
            aria-label={t("crop.previousImage")}
          >
            ‹
          </button>
          <span className={styles.navLabel}>
            {currentIndex + 1} / {totalImages}
          </span>
          <button
            type="button"
            className={styles.navButton}
            onClick={onNextImage}
            aria-label={t("crop.nextImage")}
          >
            ›
          </button>
        </div>
      )}

      <p className={styles.hint}>
        {eyedropperActive
          ? t("edit.auto.eyedropperHint")
          : t("edit.compareHint")}
      </p>
    </div>
  );
};
