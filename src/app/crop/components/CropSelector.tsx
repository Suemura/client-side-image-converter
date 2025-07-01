import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CropArea } from "../../../utils/imageCropper";
import styles from "./CropSelector.module.css";

interface CropSelectorProps {
  imageUrl: string;
  onCropAreaChange: (cropArea: CropArea) => void;
  initialCropArea?: CropArea;
}

export const CropSelector: React.FC<CropSelectorProps> = ({
  imageUrl,
  onCropAreaChange,
  initialCropArea,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropArea, setCropArea] = useState<CropArea>(
    initialCropArea || { x: 100, y: 100, width: 300, height: 300 }
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

      // 画像読み込み後に適切な初期クロップ領域を設定
      if (!initialCropArea) {
        const displayWidth = imageRef.current.offsetWidth;
        const displayHeight = imageRef.current.offsetHeight;
        const centerX = displayWidth / 4;
        const centerY = displayHeight / 4;
        const defaultSize = Math.min(displayWidth, displayHeight) / 2;

        const defaultCropArea = {
          x: centerX,
          y: centerY,
          width: defaultSize,
          height: defaultSize
        };

        setCropArea(defaultCropArea);

        // 実際の画像座標に変換してコールバックを呼び出し
        setTimeout(() => {
          const scaleX = imageRef.current!.naturalWidth / displayWidth;
          const scaleY = imageRef.current!.naturalHeight / displayHeight;
          const actualCropArea: CropArea = {
            x: Math.round(defaultCropArea.x * scaleX),
            y: Math.round(defaultCropArea.y * scaleY),
            width: Math.round(defaultCropArea.width * scaleX),
            height: Math.round(defaultCropArea.height * scaleY),
          };
          onCropAreaChange(actualCropArea);
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
    if (!imageRef.current) return { scaleX: 1, scaleY: 1 };

    const scaleX = imageNaturalSize.width / imageRef.current.offsetWidth;
    const scaleY = imageNaturalSize.height / imageRef.current.offsetHeight;

    return { scaleX, scaleY };
  }, [imageNaturalSize]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const position = getRelativePosition(event);
    setIsDragging(true);
    setDragStart(position);
    setCropArea({ ...position, width: 0, height: 0 });
  }, [getRelativePosition]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isDragging) return;

      const position = getRelativePosition(event);
      const width = Math.abs(position.x - dragStart.x);
      const height = Math.abs(position.y - dragStart.y);
      const x = Math.min(position.x, dragStart.x);
      const y = Math.min(position.y, dragStart.y);

      setCropArea({ x, y, width, height });
    },
    [isDragging, dragStart, getRelativePosition]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);

      // 最小サイズをチェック
      if (cropArea.width < 10 || cropArea.height < 10) {
        return;
      }

      // 実際の画像座標に変換してコールバックを呼び出し
      const { scaleX, scaleY } = getScaleFactor();
      const actualCropArea: CropArea = {
        x: Math.round(cropArea.x * scaleX),
        y: Math.round(cropArea.y * scaleY),
        width: Math.round(cropArea.width * scaleX),
        height: Math.round(cropArea.height * scaleY),
      };

      onCropAreaChange(actualCropArea);
    }
  }, [isDragging, cropArea, getScaleFactor, onCropAreaChange]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging]);

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.imageContainer}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Crop preview"
          className={styles.image}
          onLoad={handleImageLoad}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
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
          />
        )}

        {isDragging && (
          <div className={styles.instructions}>
            ドラッグしてクロップ領域を選択
          </div>
        )}
      </div>
    </div>
  );
};
