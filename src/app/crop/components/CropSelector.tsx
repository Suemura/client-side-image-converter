import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CropArea } from "../../../utils/imageCropper";
import styles from "./CropSelector.module.css";

interface CropSelectorProps {
  imageUrl: string;
  onCropAreaChange: (cropArea: CropArea) => void;
  initialCropArea?: CropArea;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

export const CropSelector: React.FC<CropSelectorProps> = ({
  imageUrl,
  onCropAreaChange,
  initialCropArea,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [cropArea, setCropArea] = useState<CropArea>(
    initialCropArea || { x: 0, y: 0, width: 0, height: 0 }
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageNaturalSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
      setImageLoaded(true);

      // 画像読み込み後に画像全体を初期クロップ領域として設定
      if (!initialCropArea) {
        // 画像の表示サイズが確定するまで少し待つ
        setTimeout(() => {
          if (imageRef.current && imageRef.current.offsetWidth > 0 && imageRef.current.offsetHeight > 0) {
            const displayWidth = imageRef.current.offsetWidth;
            const displayHeight = imageRef.current.offsetHeight;

            const defaultCropArea = {
              x: 0,
              y: 0,
              width: displayWidth,
              height: displayHeight
            };

            setCropArea(defaultCropArea);

            // 実際の画像座標に変換してコールバックを呼び出し
            const actualCropArea: CropArea = {
              x: 0,
              y: 0,
              width: imageRef.current.naturalWidth,
              height: imageRef.current.naturalHeight,
            };

            // デバッグ情報をログ出力
            onCropAreaChange(actualCropArea);
          } else {
            console.warn('Image display size not ready, retrying...');
            // もう一度試す
            setTimeout(() => {
              if (imageRef.current && imageRef.current.offsetWidth > 0 && imageRef.current.offsetHeight > 0) {
                const displayWidth = imageRef.current.offsetWidth;
                const displayHeight = imageRef.current.offsetHeight;

                const defaultCropArea = {
                  x: 0,
                  y: 0,
                  width: displayWidth,
                  height: displayHeight
                };

                setCropArea(defaultCropArea);

                const actualCropArea: CropArea = {
                  x: 0,
                  y: 0,
                  width: imageRef.current.naturalWidth,
                  height: imageRef.current.naturalHeight,
                };

                onCropAreaChange(actualCropArea);
              }
            }, 50);
          }
        }, 100);
      }
    }
  }, [initialCropArea, onCropAreaChange]);

  const getRelativePosition = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || !imageRef.current) return { x: 0, y: 0 };

    const rect = imageRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return { x, y };
  }, []);

  const getScaleFactor = useCallback(() => {
    if (!imageRef.current || imageNaturalSize.width === 0 || imageNaturalSize.height === 0) {
      console.warn('Cannot calculate scale factor: missing image data');
      return { scaleX: 1, scaleY: 1 };
    }

    const displayWidth = imageRef.current.offsetWidth;
    const displayHeight = imageRef.current.offsetHeight;

    if (displayWidth === 0 || displayHeight === 0) {
      console.warn('Display size is 0');
      return { scaleX: 1, scaleY: 1 };
    }

    const scaleX = imageNaturalSize.width / displayWidth;
    const scaleY = imageNaturalSize.height / displayHeight;

    return { scaleX, scaleY };
  }, [imageNaturalSize]);

  const constrainCropArea = useCallback((newCropArea: CropArea) => {
    if (!imageRef.current) return newCropArea;

    const imageWidth = imageRef.current.offsetWidth;
    const imageHeight = imageRef.current.offsetHeight;

    // より厳密な制約処理
    let constrainedArea = {
      x: Math.max(0, newCropArea.x),
      y: Math.max(0, newCropArea.y),
      width: Math.max(10, newCropArea.width),
      height: Math.max(10, newCropArea.height),
    };

    // 右端と下端の制約
    if (constrainedArea.x + constrainedArea.width > imageWidth) {
      if (constrainedArea.x >= imageWidth - 10) {
        constrainedArea.x = imageWidth - 10;
        constrainedArea.width = 10;
      } else {
        constrainedArea.width = imageWidth - constrainedArea.x;
      }
    }

    if (constrainedArea.y + constrainedArea.height > imageHeight) {
      if (constrainedArea.y >= imageHeight - 10) {
        constrainedArea.y = imageHeight - 10;
        constrainedArea.height = 10;
      } else {
        constrainedArea.height = imageHeight - constrainedArea.y;
      }
    }

    return constrainedArea;
  }, []);

  const handleResizeStart = useCallback((event: React.MouseEvent, handle: ResizeHandle) => {
    event.preventDefault();
    event.stopPropagation();

    const position = getRelativePosition(event);
    setIsDragging(true);
    setActiveHandle(handle);
    setDragStart(position);
  }, [getRelativePosition]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const position = getRelativePosition(event);
    setIsDragging(true);
    setActiveHandle('move');
    setDragStart(position);
  }, [getRelativePosition]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isDragging || !activeHandle) return;

      const position = getRelativePosition(event);
      const deltaX = position.x - dragStart.x;
      const deltaY = position.y - dragStart.y;

      let newCropArea = { ...cropArea };

      switch (activeHandle) {
        case 'move':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.y = cropArea.y + deltaY;
          break;
        case 'nw':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.width = cropArea.width - deltaX;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case 'n':
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case 'ne':
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.width = cropArea.width + deltaX;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case 'e':
          newCropArea.width = cropArea.width + deltaX;
          break;
        case 'se':
          newCropArea.width = cropArea.width + deltaX;
          newCropArea.height = cropArea.height + deltaY;
          break;
        case 's':
          newCropArea.height = cropArea.height + deltaY;
          break;
        case 'sw':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.width = cropArea.width - deltaX;
          newCropArea.height = cropArea.height + deltaY;
          break;
        case 'w':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.width = cropArea.width - deltaX;
          break;
      }

      newCropArea = constrainCropArea(newCropArea);
      setCropArea(newCropArea);
      setDragStart(position);
    },
    [isDragging, activeHandle, dragStart, cropArea, getRelativePosition, constrainCropArea]
  );

  const handleMouseUpLogic = useCallback(() => {
    // 最小サイズをチェック
    if (cropArea.width < 10 || cropArea.height < 10) {
      console.warn('Crop area too small, skipping');
      return;
    }

    // 実際の画像座標に変換してコールバックを呼び出し
    const { scaleX, scaleY } = getScaleFactor();

    // スケールファクターが有効かチェック
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
      console.error('Invalid scale factors:', { scaleX, scaleY });
      return;
    }

    const actualCropArea: CropArea = {
      x: Math.round(cropArea.x * scaleX),
      y: Math.round(cropArea.y * scaleY),
      width: Math.round(cropArea.width * scaleX),
      height: Math.round(cropArea.height * scaleY),
    };

    // 変換後の値が有効かチェック
    if (actualCropArea.width <= 0 || actualCropArea.height <= 0 ||
        actualCropArea.x < 0 || actualCropArea.y < 0 ||
        !Number.isFinite(actualCropArea.x) || !Number.isFinite(actualCropArea.y) ||
        !Number.isFinite(actualCropArea.width) || !Number.isFinite(actualCropArea.height)) {
      console.error('Invalid actual crop area:', actualCropArea);
      return;
    }

    // 画像境界内に収まっているかチェック
    if (actualCropArea.x + actualCropArea.width > imageNaturalSize.width ||
        actualCropArea.y + actualCropArea.height > imageNaturalSize.height) {
      console.warn('Actual crop area extends beyond image, adjusting...');
      actualCropArea.width = Math.min(actualCropArea.width, imageNaturalSize.width - actualCropArea.x);
      actualCropArea.height = Math.min(actualCropArea.height, imageNaturalSize.height - actualCropArea.y);
    }

    onCropAreaChange(actualCropArea);
  }, [cropArea, getScaleFactor, onCropAreaChange, imageNaturalSize]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setActiveHandle(null);
      handleMouseUpLogic();
    }
  }, [isDragging, handleMouseUpLogic]);

  useEffect(() => {    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setActiveHandle(null);

        // handleMouseUpと同じ処理を呼び出し
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

      let newCropArea = { ...cropArea };

      switch (activeHandle) {
        case 'move':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.y = cropArea.y + deltaY;
          break;
        case 'nw':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.width = cropArea.width - deltaX;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case 'n':
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case 'ne':
          newCropArea.y = cropArea.y + deltaY;
          newCropArea.width = cropArea.width + deltaX;
          newCropArea.height = cropArea.height - deltaY;
          break;
        case 'e':
          newCropArea.width = cropArea.width + deltaX;
          break;
        case 'se':
          newCropArea.width = cropArea.width + deltaX;
          newCropArea.height = cropArea.height + deltaY;
          break;
        case 's':
          newCropArea.height = cropArea.height + deltaY;
          break;
        case 'sw':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.width = cropArea.width - deltaX;
          newCropArea.height = cropArea.height + deltaY;
          break;
        case 'w':
          newCropArea.x = cropArea.x + deltaX;
          newCropArea.width = cropArea.width - deltaX;
          break;
      }

      newCropArea = constrainCropArea(newCropArea);
      setCropArea(newCropArea);
      setDragStart({ x, y });
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousemove", handleGlobalMouseMove);

    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [isDragging, activeHandle, dragStart, cropArea, constrainCropArea, handleMouseUpLogic]);

  return (
    <div ref={containerRef} className={styles.container}>
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
              onMouseDown={(e) => handleResizeStart(e, 'nw')}
            />
            <div
              className={`${styles.resizeHandle} ${styles.ne}`}
              onMouseDown={(e) => handleResizeStart(e, 'ne')}
            />
            <div
              className={`${styles.resizeHandle} ${styles.se}`}
              onMouseDown={(e) => handleResizeStart(e, 'se')}
            />
            <div
              className={`${styles.resizeHandle} ${styles.sw}`}
              onMouseDown={(e) => handleResizeStart(e, 'sw')}
            />

            {/* 辺のハンドル */}
            <div
              className={`${styles.resizeHandle} ${styles.n}`}
              onMouseDown={(e) => handleResizeStart(e, 'n')}
            />
            <div
              className={`${styles.resizeHandle} ${styles.e}`}
              onMouseDown={(e) => handleResizeStart(e, 'e')}
            />
            <div
              className={`${styles.resizeHandle} ${styles.s}`}
              onMouseDown={(e) => handleResizeStart(e, 's')}
            />
            <div
              className={`${styles.resizeHandle} ${styles.w}`}
              onMouseDown={(e) => handleResizeStart(e, 'w')}
            />
          </div>
        )}

        {isDragging && activeHandle && (
          <div className={styles.instructions}>
            {activeHandle === 'move' ? 'ドラッグして移動' : 'ドラッグしてリサイズ'}
          </div>
        )}
      </div>
    </div>
  );
};
