import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNotice } from "../../../components/ErrorNotice";
import {
  PRESS_AND_HOLD_MOVE_TOLERANCE_PX,
  usePressAndHold,
} from "../../../hooks/usePressAndHold";
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
  /**
   * 前後比較（分割スライダー）を表示するか（既定 true = 従来挙動）。
   * false のときは編集後のみを表示する（/studio の「編集後 | 前後比較」トグル用）
   */
  showCompare?: boolean;
  /**
   * 長押し中に全面表示する原画（#146）。省略時は source（編集前入力）を流用する。
   * /studio ではツール横断の元画像（EXIF 補正のみ適用）を渡す。
   * null はまだ用意できていない状態（デコード中等）で、長押しは無効になる
   */
  holdSource?: EditableSource | null;
  /** 長押し原画表示を有効にするか（既定 true。/studio のスプリット比較中は false を渡す） */
  pressHoldEnabled?: boolean;
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
  showCompare = true,
  holdSource,
  pressHoldEnabled = true,
}) => {
  const { t } = useTranslation();
  const editedCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const holdCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRendererRef = useRef<AdjustmentRenderer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // 分割ドラッグ / タップ判定用の押下開始位置（pointerId と座標）
  const pressStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  // 分割位置（%）。左が編集前、右が編集後
  const [divider, setDivider] = useState(50);
  // 編集後プレビューの描画失敗通知（次の描画成功でクリアする）
  const [renderError, setRenderError] = useState(false);

  // 長押しで表示する原画。holdSource 未指定（/edit）は source を流用し、
  // 指定時（/studio）はツール横断の元画像を使う（null の間は無効 = 準備中）
  const effectiveHoldSource = holdSource === undefined ? source : holdSource;
  // source と別の原画を持つ場合のみ専用キャンバスへ描画する
  // （同一なら既存の「編集前」オーバーレイを全面化して再利用し、メモリを増やさない）
  const dedicatedHold =
    effectiveHoldSource !== null && effectiveHoldSource !== source;
  const hold = usePressAndHold({
    disabled:
      !pressHoldEnabled || eyedropperActive || effectiveHoldSource === null,
  });
  const holdActive = hold.active;

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

  // 長押し用の原画（source と異なる場合のみ）を専用キャンバスへ先に描画しておき、
  // 長押し時は表示切替だけで済ませる（再デコード・再描画なしの即時切替）
  useEffect(() => {
    const canvas = holdCanvasRef.current;
    if (!canvas || !dedicatedHold || effectiveHoldSource === null) {
      return;
    }
    const sw = effectiveHoldSource.width;
    const sh = effectiveHoldSource.height;
    if (sw <= 0 || sh <= 0) {
      return;
    }
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, sw, sh);
    ctx.drawImage(effectiveHoldSource, 0, 0, sw, sh);
  }, [dedicatedHold, effectiveHoldSource]);

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
      setRenderError(false);
    } catch (error) {
      console.error("Preview render failed:", error);
      setRenderError(true);
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
        // ピックは調整値の書き換え + モード解除を伴うため、ToneCurvePanel の点操作と
        // 同様にプライマリポインタの左ボタンのみ受け付ける（右クリック・多点タッチを無視）
        if (!e.isPrimary || e.button !== 0) {
          return;
        }
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
      // 分割ドラッグと長押し（原画表示）を両立させるため、押下時点では分割位置を
      // 動かさない。しきい値以上動いたらドラッグ開始（長押しは内部でキャンセルされる）、
      // 動かさず素早く離したらタップとして分割位置を移動する（up 側で処理）
      pressStartRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      draggingRef.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      hold.bind.onPointerDown(e);
    },
    [eyedropperActive, onEyedropperPick, width, height, hold.bind],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      hold.bind.onPointerMove(e);
      if (draggingRef.current) {
        updateDivider(e.clientX);
        return;
      }
      const press = pressStartRef.current;
      // 長押し成立中はドラッグを開始しない（原画表示を優先し、離すまで維持）
      if (!press || press.pointerId !== e.pointerId || holdActive) {
        return;
      }
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (Math.hypot(dx, dy) >= PRESS_AND_HOLD_MOVE_TOLERANCE_PX) {
        draggingRef.current = true;
        updateDivider(e.clientX);
      }
    },
    [updateDivider, hold.bind, holdActive],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const press = pressStartRef.current;
      // ドラッグも長押しもせず離した場合はタップ = 分割位置の移動（従来のクリック挙動）
      if (
        press &&
        press.pointerId === e.pointerId &&
        !draggingRef.current &&
        !holdActive
      ) {
        updateDivider(e.clientX);
      }
      pressStartRef.current = null;
      draggingRef.current = false;
      hold.bind.onPointerUp(e);
    },
    [updateDivider, hold.bind, holdActive],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pressStartRef.current = null;
      draggingRef.current = false;
      hold.bind.onPointerCancel(e);
    },
    [hold.bind],
  );

  return (
    <div className={styles.container}>
      <ErrorNotice message={renderError ? t("edit.previewError") : null} />
      <div
        ref={stageRef}
        className={`${styles.stage}${eyedropperActive ? ` ${styles.stageEyedropper}` : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        onContextMenu={hold.bind.onContextMenu}
        data-hold-active={holdActive ? "true" : "false"}
      >
        {/* ベース: 編集後 */}
        <canvas
          ref={editedCanvasRef}
          className={styles.baseCanvas}
          data-testid="edit-preview-canvas"
        />
        {!holdActive && (
          <span className={`${styles.badge} ${styles.badgeAfter}`}>
            {t("edit.after")}
          </span>
        )}

        {/* オーバーレイ: 編集前（分割位置まで表示）。比較オフ時は CSS で非表示にする
            （unmount すると canvas の描画内容が失われ、再表示時に空になるため）。
            長押し中（専用原画なし）は全面表示へ切り替える */}
        <div
          className={styles.overlay}
          style={{
            clipPath:
              holdActive && !dedicatedHold
                ? "inset(0)"
                : `inset(0 ${100 - divider}% 0 0)`,
            display:
              showCompare || (holdActive && !dedicatedHold)
                ? undefined
                : "none",
          }}
        >
          <canvas ref={originalCanvasRef} className={styles.overlayCanvas} />
          <span className={`${styles.badge} ${styles.badgeBefore}`}>
            {t("edit.before")}
          </span>
        </div>

        {/* 長押し用の原画レイヤー（/studio: ツール横断の元画像が source と異なる場合のみ）。
            unmount で描画内容が失われるため表示は CSS で切り替える */}
        {dedicatedHold && (
          <div
            className={styles.holdOverlay}
            style={{ display: holdActive ? undefined : "none" }}
          >
            <canvas ref={holdCanvasRef} className={styles.holdCanvas} />
            <span className={`${styles.badge} ${styles.badgeBefore}`}>
              {t("edit.before")}
            </span>
          </div>
        )}

        {/* 分割ハンドル（長押し中は原画の全面表示を優先して隠す） */}
        <div
          className={styles.divider}
          style={{
            left: `${divider}%`,
            display: showCompare && !holdActive ? undefined : "none",
          }}
        >
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
