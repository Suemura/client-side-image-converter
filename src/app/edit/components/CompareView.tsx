import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AdjustmentState,
  clampAdjustments,
  normalizeAdjustments,
} from "../../../utils/adjustments";
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
  /** 複数画像ナビ */
  currentIndex: number;
  totalImages: number;
  onPreviousImage: () => void;
  onNextImage: () => void;
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
  currentIndex,
  totalImages,
  onPreviousImage,
  onNextImage,
}) => {
  const { t } = useTranslation();
  const editedCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRendererRef = useRef<AdjustmentRenderer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  // 分割位置（%）。左が編集前、右が編集後
  const [divider, setDivider] = useState(50);

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
      );
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(out, 0, 0);
    } catch (error) {
      console.error("Preview render failed:", error);
    }
  }, [source, adjustments, lut, width, height]);

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
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateDivider(e.clientX);
    },
    [updateDivider],
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
        className={styles.stage}
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

      <p className={styles.hint}>{t("edit.compareHint")}</p>
    </div>
  );
};
