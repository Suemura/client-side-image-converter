import type React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./OriginalHoldOverlay.module.css";

interface OriginalHoldOverlayProps {
  /** ツール横断の元画像（EXIF Orientation 補正のみ適用。未準備は null） */
  source: HTMLCanvasElement | null;
  /** 長押し中（表示する間）true */
  active: boolean;
}

/**
 * 長押しで原画（全編集適用前の元画像）を全面表示するオーバーレイ（#146）。
 * /studio の静的プレビュー系ツール（AI拡大・AI背景・情報）で使う。
 * ソースは先に専用キャンバスへ描画して保持し、長押し時は CSS の表示切替のみで
 * 即時に切り替える（再デコードなし）。
 */
export const OriginalHoldOverlay: React.FC<OriginalHoldOverlayProps> = ({
  source,
  active,
}) => {
  const { t } = useTranslation();
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
    <div
      className={styles.layer}
      style={{ display: active ? undefined : "none" }}
      data-testid="studio-hold-original"
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <span className={styles.badge}>{t("edit.before")}</span>
    </div>
  );
};
