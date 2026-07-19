import type React from "react";
import { useEffect, useRef } from "react";
import styles from "./PreviewCanvas.module.css";

interface PreviewCanvasProps {
  /** EXIF 補正済みのソースキャンバス（未読込は null） */
  source: HTMLCanvasElement | null;
  /** アクセシビリティ用の説明 */
  label: string;
}

/** ソースキャンバスをそのまま表示する静的プレビュー（透過はそのまま保持する） */
export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  source,
  label,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || source.width <= 0 || source.height <= 0) {
      return;
    }
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
  }, [source]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      role="img"
      aria-label={label}
      data-testid="studio-preview-canvas"
    />
  );
};
