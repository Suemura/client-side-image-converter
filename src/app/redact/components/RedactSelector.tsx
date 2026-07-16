import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type CropArea,
  clampCropArea,
  MIN_CROP_SIZE,
  type ResizeHandle,
  scaleCropArea,
  toDisplayArea,
} from "../../../utils/cropGeometry";
import { renderRedacted } from "../../../utils/imageRedactor";
import type { RedactRegion, RedactStyle } from "../../../utils/redactCore";
import styles from "./RedactSelector.module.css";

interface RedactSelectorProps {
  /** EXIF Orientation 補正済みの無加工ソースキャンバス（自然サイズ） */
  sourceCanvas: HTMLCanvasElement;
  /** 現在の画像のレタッチ領域（自然座標） */
  regions: RedactRegion[];
  /** 隠し方の設定（プレビューへ焼き込んで表示する） */
  redactStyle: RedactStyle;
  /** 新しい領域の確定（自然座標） */
  onAddRegion: (area: CropArea) => void;
  /** 既存領域の移動・リサイズの確定（自然座標） */
  onUpdateRegion: (id: number, area: CropArea) => void;
  /** 領域の削除 */
  onRemoveRegion: (id: number) => void;
  currentIndex?: number;
  totalImages?: number;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
}

/** ドラッグ操作の種類と進行状態（draft は表示座標） */
type DragState =
  | { type: "create"; anchor: { x: number; y: number }; draft: CropArea }
  | {
      type: "move" | "resize";
      regionId: number;
      handle: ResizeHandle;
      last: { x: number; y: number };
      draft: CropArea;
    };

/** 8 方向リサイズハンドルの一覧（CSS クラス名と対応） */
const RESIZE_HANDLES: Exclude<ResizeHandle, "move">[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** 2 点から正規化した矩形を作り、表示境界内へ収める */
const normalizeRect = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  boundsWidth: number,
  boundsHeight: number,
): CropArea => {
  const clampX = (v: number) => Math.max(0, Math.min(v, boundsWidth));
  const clampY = (v: number) => Math.max(0, Math.min(v, boundsHeight));
  const x1 = clampX(Math.min(a.x, b.x));
  const y1 = clampY(Math.min(a.y, b.y));
  const x2 = clampX(Math.max(a.x, b.x));
  const y2 = clampY(Math.max(a.y, b.y));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

/** ハンドルに応じてドラッグ差分を矩形へ適用する（CropSelector と同じ操作系） */
const applyHandleDelta = (
  area: CropArea,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
): CropArea => {
  const next: CropArea = { ...area };
  switch (handle) {
    case "move":
      next.x += deltaX;
      next.y += deltaY;
      break;
    case "nw":
      next.x += deltaX;
      next.y += deltaY;
      next.width -= deltaX;
      next.height -= deltaY;
      break;
    case "n":
      next.y += deltaY;
      next.height -= deltaY;
      break;
    case "ne":
      next.y += deltaY;
      next.width += deltaX;
      next.height -= deltaY;
      break;
    case "e":
      next.width += deltaX;
      break;
    case "se":
      next.width += deltaX;
      next.height += deltaY;
      break;
    case "s":
      next.height += deltaY;
      break;
    case "sw":
      next.x += deltaX;
      next.width -= deltaX;
      next.height += deltaY;
      break;
    case "w":
      next.x += deltaX;
      next.width -= deltaX;
      break;
  }
  return next;
};

/**
 * レタッチ領域の複数矩形セレクター。
 * プレビューキャンバスにはレタッチを焼き込んだ結果を表示し（出力と同一経路 = WYSIWYG）、
 * 空き領域のドラッグで新規矩形を作成、矩形のドラッグで移動、8 方向ハンドルでリサイズ、
 * × ボタンで個別削除できる。座標変換は cropGeometry の純粋関数を共用する。
 */
export const RedactSelector: React.FC<RedactSelectorProps> = ({
  sourceCanvas,
  regions,
  redactStyle,
  onAddRegion,
  onUpdateRegion,
  onRemoveRegion,
  currentIndex = 0,
  totalImages = 1,
  onPreviousImage,
  onNextImage,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);

  // 表示サイズを状態へ反映する（同値なら参照を保って再レンダーを避ける）
  const measureDisplaySize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    setDisplaySize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  // プレビュー描画: ソースを描いてからレタッチを焼き込む（出力と同じ renderRedacted を通す）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(sourceCanvas, 0, 0);
    renderRedacted(canvas, regions, redactStyle);
    measureDisplaySize();
  }, [sourceCanvas, regions, redactStyle, measureDisplaySize]);

  // レスポンシブ縮小で表示倍率が変わったときに追従する
  useEffect(() => {
    window.addEventListener("resize", measureDisplaySize);
    return () => window.removeEventListener("resize", measureDisplaySize);
  }, [measureDisplaySize]);

  // 表示座標 → 自然座標の倍率（表示サイズ未確定時は null）
  const scale =
    displaySize.width > 0 && displaySize.height > 0
      ? {
          scaleX: sourceCanvas.width / displaySize.width,
          scaleY: sourceCanvas.height / displaySize.height,
        }
      : null;

  const getRelativePosition = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { x: 0, y: 0 };
      }
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    },
    [],
  );

  // 空き領域のドラッグ開始 = 新規矩形の作成
  const handleCreateStart = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const anchor = getRelativePosition(event);
      setDrag({
        type: "create",
        anchor,
        draft: { x: anchor.x, y: anchor.y, width: 0, height: 0 },
      });
    },
    [getRelativePosition],
  );

  // 既存矩形のドラッグ開始 = 移動
  const handleRegionMouseDown = useCallback(
    (event: React.MouseEvent, region: RedactRegion) => {
      if (event.button !== 0 || !scale) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDrag({
        type: "move",
        regionId: region.id,
        handle: "move",
        last: getRelativePosition(event),
        draft: toDisplayArea(region.area, scale.scaleX, scale.scaleY),
      });
    },
    [getRelativePosition, scale],
  );

  // ハンドルのドラッグ開始 = リサイズ
  const handleResizeStart = useCallback(
    (event: React.MouseEvent, region: RedactRegion, handle: ResizeHandle) => {
      if (event.button !== 0 || !scale) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDrag({
        type: "resize",
        regionId: region.id,
        handle,
        last: getRelativePosition(event),
        draft: toDisplayArea(region.area, scale.scaleX, scale.scaleY),
      });
    },
    [getRelativePosition, scale],
  );

  // ドラッグ中の移動・確定（document 全体で追跡する。CropSelector と同じ構成）
  useEffect(() => {
    if (!drag) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const pos = getRelativePosition(event);
      setDrag((current) => {
        if (!current) {
          return current;
        }
        if (current.type === "create") {
          return {
            ...current,
            draft: normalizeRect(
              current.anchor,
              pos,
              displaySize.width,
              displaySize.height,
            ),
          };
        }
        const moved = applyHandleDelta(
          current.draft,
          current.handle,
          pos.x - current.last.x,
          pos.y - current.last.y,
        );
        return {
          ...current,
          last: pos,
          draft: clampCropArea(moved, displaySize.width, displaySize.height),
        };
      });
    };

    const handleMouseUp = () => {
      setDrag((current) => {
        if (!current || !scale) {
          return null;
        }
        const { draft } = current;
        // 小さすぎる矩形は誤操作とみなして確定しない
        if (draft.width >= MIN_CROP_SIZE && draft.height >= MIN_CROP_SIZE) {
          const natural = scaleCropArea(
            draft,
            scale.scaleX,
            scale.scaleY,
            sourceCanvas.width,
            sourceCanvas.height,
          );
          if (natural.width > 0 && natural.height > 0) {
            if (current.type === "create") {
              onAddRegion(natural);
            } else {
              onUpdateRegion(current.regionId, natural);
            }
          }
        }
        return null;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    drag,
    displaySize,
    scale,
    sourceCanvas,
    getRelativePosition,
    onAddRegion,
    onUpdateRegion,
  ]);

  const showNavigation = totalImages > 1;

  return (
    <div className={styles.container}>
      {/* 画像切り替えナビゲーション */}
      {showNavigation && (
        <div className={styles.navigationHeader}>
          <button
            type="button"
            className={styles.navButton}
            onClick={onPreviousImage}
            disabled={!onPreviousImage}
            aria-label={t("crop.previousImage")}
          >
            ←
          </button>
          <span className={styles.imageCounter}>
            {currentIndex + 1} / {totalImages}
          </span>
          <button
            type="button"
            className={styles.navButton}
            onClick={onNextImage}
            disabled={!onNextImage}
            aria-label={t("crop.nextImage")}
          >
            →
          </button>
        </div>
      )}

      <div className={styles.imageContainer} onMouseDown={handleCreateStart}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          data-testid="redact-preview-canvas"
        />

        {/* 確定済みの領域（ドラッグ中の領域はドラフト側で描く） */}
        {scale &&
          regions.map((region, index) => {
            if (drag && drag.type !== "create" && drag.regionId === region.id) {
              return null;
            }
            const display = toDisplayArea(
              region.area,
              scale.scaleX,
              scale.scaleY,
            );
            return (
              <div
                key={region.id}
                className={styles.regionOverlay}
                style={{
                  left: display.x,
                  top: display.y,
                  width: display.width,
                  height: display.height,
                }}
                onMouseDown={(e) => handleRegionMouseDown(e, region)}
                data-testid="redact-region"
                role="presentation"
              >
                {RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle}
                    className={`${styles.resizeHandle} ${styles[handle]}`}
                    onMouseDown={(e) => handleResizeStart(e, region, handle)}
                  />
                ))}
                <button
                  type="button"
                  className={styles.deleteButton}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRegion(region.id);
                  }}
                  aria-label={t("redact.removeRegion", { index: index + 1 })}
                  title={t("redact.removeRegion", { index: index + 1 })}
                >
                  ×
                </button>
              </div>
            );
          })}

        {/* ドラッグ中のドラフト矩形 */}
        {drag && drag.draft.width > 0 && drag.draft.height > 0 && (
          <div
            className={`${styles.regionOverlay} ${styles.regionDraft}`}
            style={{
              left: drag.draft.x,
              top: drag.draft.y,
              width: drag.draft.width,
              height: drag.draft.height,
            }}
          />
        )}

        {/* 操作説明チップ（移動 / リサイズ中のみ） */}
        {drag && drag.type !== "create" && (
          <div className={styles.instructions}>
            {drag.handle === "move"
              ? t("crop.dragToMove")
              : t("crop.dragToResize")}
          </div>
        )}
      </div>
    </div>
  );
};
