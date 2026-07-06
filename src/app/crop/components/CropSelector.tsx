import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type CropArea,
  clampCropArea,
  enforceAspectRatio,
  fitAspectRatio,
  type ResizeHandle,
  scaleCropArea,
  toDisplayArea,
} from "../../../utils/cropGeometry";
import styles from "./CropSelector.module.css";

interface CropSelectorProps {
  imageUrl: string;
  onCropAreaChange: (cropArea: CropArea) => void;
  /** 初期トリミング領域（自然座標）。未指定なら画像全体 */
  initialCropArea?: CropArea;
  /** アスペクト比（幅/高さ）。null / undefined は自由 */
  aspectRatio?: number | null;
  currentIndex?: number;
  totalImages?: number;
  onPreviousImage?: () => void;
  onNextImage?: () => void;
}

export const CropSelector: React.FC<CropSelectorProps> = ({
  imageUrl,
  onCropAreaChange,
  initialCropArea,
  aspectRatio = null,
  currentIndex = 0,
  totalImages = 1,
  onPreviousImage,
  onNextImage,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [cropArea, setCropArea] = useState<CropArea>(
    initialCropArea || { x: 0, y: 0, width: 0, height: 0 },
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({
    width: 0,
    height: 0,
  });

  // 最新の表示領域を参照するための ref（アスペクト比変更の副作用で使用）
  const cropAreaRef = useRef(cropArea);
  cropAreaRef.current = cropArea;

  const getScaleFactor = useCallback(() => {
    const img = imageRef.current;
    if (!img || imageNaturalSize.width === 0 || imageNaturalSize.height === 0) {
      return { scaleX: 1, scaleY: 1 };
    }
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;
    if (displayWidth === 0 || displayHeight === 0) {
      return { scaleX: 1, scaleY: 1 };
    }
    return {
      scaleX: imageNaturalSize.width / displayWidth,
      scaleY: imageNaturalSize.height / displayHeight,
    };
  }, [imageNaturalSize]);

  // 表示座標のトリミング領域を自然座標へ変換してコールバックに渡す
  const emitNaturalArea = useCallback(
    (displayArea: CropArea) => {
      const { scaleX, scaleY } = getScaleFactor();
      if (
        !Number.isFinite(scaleX) ||
        !Number.isFinite(scaleY) ||
        scaleX <= 0 ||
        scaleY <= 0
      ) {
        return;
      }
      const natural = scaleCropArea(
        displayArea,
        scaleX,
        scaleY,
        imageNaturalSize.width,
        imageNaturalSize.height,
      );
      if (natural.width <= 0 || natural.height <= 0) {
        return;
      }
      onCropAreaChange(natural);
    },
    [getScaleFactor, imageNaturalSize, onCropAreaChange],
  );

  // 画像読み込み後、初期トリミング領域（自然座標 or 全体）を表示座標へ整えて設定する
  const initializeCropArea = useCallback(() => {
    const img = imageRef.current;
    if (!img) {
      return;
    }
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;
    // 表示サイズが未確定なら少し待って再試行する
    if (displayWidth === 0 || displayHeight === 0) {
      setTimeout(() => initializeCropArea(), 60);
      return;
    }

    const scaleX = img.naturalWidth / displayWidth;
    const scaleY = img.naturalHeight / displayHeight;

    let display: CropArea = initialCropArea
      ? toDisplayArea(initialCropArea, scaleX, scaleY)
      : { x: 0, y: 0, width: displayWidth, height: displayHeight };

    if (aspectRatio) {
      display = fitAspectRatio(display, aspectRatio);
    }
    display = clampCropArea(display, displayWidth, displayHeight);

    setCropArea(display);
    const natural = scaleCropArea(
      display,
      scaleX,
      scaleY,
      img.naturalWidth,
      img.naturalHeight,
    );
    onCropAreaChange(natural);
  }, [initialCropArea, aspectRatio, onCropAreaChange]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img) {
      return;
    }
    setImageNaturalSize({
      width: img.naturalWidth,
      height: img.naturalHeight,
    });
    setImageLoaded(true);
    initializeCropArea();
  }, [initializeCropArea]);

  // アスペクト比プリセット変更時、現在の領域へ比率を当てはめる。
  // 現在の領域は cropAreaRef 経由で参照し、比率変更時のみ再適用したいため emitNaturalArea は依存に含めない。
  // biome-ignore lint/correctness/useExhaustiveDependencies: emitNaturalArea を意図的に除外（比率変更時のみ実行）
  useEffect(() => {
    const img = imageRef.current;
    if (!imageLoaded || !img || !aspectRatio) {
      return;
    }
    const displayWidth = img.offsetWidth;
    const displayHeight = img.offsetHeight;
    const fitted = clampCropArea(
      fitAspectRatio(cropAreaRef.current, aspectRatio),
      displayWidth,
      displayHeight,
    );
    setCropArea(fitted);
    emitNaturalArea(fitted);
  }, [aspectRatio, imageLoaded]);

  const getRelativePosition = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !imageRef.current) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent, handle: ResizeHandle) => {
      event.preventDefault();
      event.stopPropagation();
      const position = getRelativePosition(event);
      setIsDragging(true);
      setActiveHandle(handle);
      setDragStart(position);
    },
    [getRelativePosition],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const position = getRelativePosition(event);
      setIsDragging(true);
      setActiveHandle("move");
      setDragStart(position);
    },
    [getRelativePosition],
  );

  const handleMouseUpLogic = useCallback(() => {
    // 最小サイズをチェック
    if (cropArea.width < 10 || cropArea.height < 10) {
      return;
    }
    emitNaturalArea(cropArea);
  }, [cropArea, emitNaturalArea]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setActiveHandle(null);
        handleMouseUpLogic();
      }
    };

    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!isDragging || !activeHandle || !imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const deltaX = x - dragStart.x;
      const deltaY = y - dragStart.y;

      let newCropArea: CropArea = { ...cropArea };

      switch (activeHandle) {
        case "move":
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.y = cropArea.y + deltaY;
          break;
        case "nw":
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.width = cropArea.width - deltaX;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case "n":
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case "ne":
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.width = cropArea.width + deltaX;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case "e":
          newCropArea.width = cropArea.width + deltaX;
          break;
        case "se":
          newCropArea.width = cropArea.width + deltaX;
          newCropArea.height = cropArea.height + deltaY;
          break;
        case "s":
          newCropArea.height = cropArea.height + deltaY;
          break;
        case "sw":
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.width = cropArea.width - deltaX;
          newCropArea.height = cropArea.height + deltaY;
          break;
        case "w":
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.width = cropArea.width - deltaX;
          break;
      }

      // アスペクト比が指定されていればリサイズ時に比率を強制する
      if (aspectRatio && activeHandle !== "move") {
        newCropArea = enforceAspectRatio(
          newCropArea,
          activeHandle,
          aspectRatio,
        );
      }

      const displayWidth = imageRef.current.offsetWidth;
      const displayHeight = imageRef.current.offsetHeight;
      newCropArea = clampCropArea(newCropArea, displayWidth, displayHeight);
      setCropArea(newCropArea);
      setDragStart({ x, y });
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousemove", handleGlobalMouseMove);

    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [
    isDragging,
    activeHandle,
    dragStart,
    cropArea,
    aspectRatio,
    handleMouseUpLogic,
  ]);

  const showNavigation = totalImages > 1;

  return (
    <div ref={containerRef} className={styles.container}>
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

      <div className={styles.imageContainer}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Crop preview"
          className={styles.image}
          onLoad={handleImageLoad}
          draggable={false}
        />

        {imageLoaded && (
          <div
            className={styles.cropOverlay}
            style={{
              left: cropArea.x,
              top: cropArea.y,
              width: cropArea.width,
              height: cropArea.height,
            }}
            onMouseDown={handleMouseDown}
          >
            {/* 四隅のハンドル */}
            <div
              className={`${styles.resizeHandle} ${styles.nw}`}
              onMouseDown={(e) => handleResizeStart(e, "nw")}
            />
            <div
              className={`${styles.resizeHandle} ${styles.ne}`}
              onMouseDown={(e) => handleResizeStart(e, "ne")}
            />
            <div
              className={`${styles.resizeHandle} ${styles.se}`}
              onMouseDown={(e) => handleResizeStart(e, "se")}
            />
            <div
              className={`${styles.resizeHandle} ${styles.sw}`}
              onMouseDown={(e) => handleResizeStart(e, "sw")}
            />

            {/* 辺のハンドル */}
            <div
              className={`${styles.resizeHandle} ${styles.n}`}
              onMouseDown={(e) => handleResizeStart(e, "n")}
            />
            <div
              className={`${styles.resizeHandle} ${styles.e}`}
              onMouseDown={(e) => handleResizeStart(e, "e")}
            />
            <div
              className={`${styles.resizeHandle} ${styles.s}`}
              onMouseDown={(e) => handleResizeStart(e, "s")}
            />
            <div
              className={`${styles.resizeHandle} ${styles.w}`}
              onMouseDown={(e) => handleResizeStart(e, "w")}
            />
          </div>
        )}

        {isDragging && activeHandle && (
          <div className={styles.instructions}>
            {activeHandle === "move"
              ? t("crop.dragToMove")
              : t("crop.dragToResize")}
          </div>
        )}
      </div>
    </div>
  );
};
