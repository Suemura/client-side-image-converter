import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildHistogramPath,
  type HistogramData,
  histogramMaxCount,
} from "../../../utils/histogram";
import {
  addCurvePoint,
  buildCurveLut,
  type CurveChannel,
  DEFAULT_TONE_CURVE,
  isDefaultCurvePoints,
  moveCurvePoint,
  removeCurvePoint,
  type ToneCurveState,
} from "../../../utils/toneCurve";
import styles from "./ToneCurvePanel.module.css";

/** SVG の viewBox 寸法（論理座標。表示は CSS で伸縮する） */
const STAGE_SIZE = 256;

/** SVG パス座標の桁数を抑える（histogram.ts の formatCoord と同方針） */
const round2 = (value: number): number => Math.round(value * 100) / 100;

interface ToneCurvePanelProps {
  /** 現在表示中の画像へ適用するトーンカーブ */
  curve: ToneCurveState;
  /** 不変更新契約: 新しい state オブジェクトを渡す（AdjustmentPanel と同方針） */
  onCurveChange: (next: ToneCurveState) => void;
  /** プロット背景に重ねる輝度ヒストグラム（null は背景なし） */
  histogram: HistogramData | null;
}

/**
 * トーンカーブの SVG エディタパネル（RGB マスター / 輝度のチャンネル切替付き）。
 * プロット領域のクリックで制御点を追加してそのままドラッグでき、ダブルクリックで削除する。
 * カーブの数式・点操作は `toneCurve.ts` の純粋関数に委譲し、本コンポーネントは
 * 座標変換（表示 ⇔ 正規化）とイベント処理に徹する。
 */
export const ToneCurvePanel: React.FC<ToneCurvePanelProps> = ({
  curve,
  onCurveChange,
  histogram,
}) => {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<CurveChannel>("rgb");
  const stageRef = useRef<SVGSVGElement>(null);
  // ドラッグ中の制御点インデックス（moveCurvePoint が隣接クランプで並びを保つため安定）
  const draggingIndexRef = useRef<number | null>(null);

  const points = curve[channel];

  // 表示座標（クライアント px）→ 正規化座標 [0,1]²（y は上が 1）
  const toNormalized = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return { x: 0, y: 0 };
      }
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    [],
  );

  const updateChannel = useCallback(
    (nextPoints: (typeof curve)[CurveChannel]) => {
      // 点操作の純粋関数は拒否時に同じ配列参照を返す契約（変更なしなら再レンダーしない）
      if (nextPoints === points) {
        return;
      }
      onCurveChange({ ...curve, [channel]: nextPoints });
    },
    [curve, channel, points, onCurveChange],
  );

  // 空き領域のクリック（pointerdown）で点を追加し、そのままドラッグで配置できるようにする。
  // 既存の点の上では追加せずドラッグを開始する。
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const indexAttr = (e.target as SVGElement).getAttribute(
        "data-point-index",
      );
      if (indexAttr !== null) {
        draggingIndexRef.current = Number(indexAttr);
        return;
      }
      const { x, y } = toNormalized(e);
      const next = addCurvePoint(points, x, y);
      if (next === points) {
        // 近接・上限で追加拒否
        return;
      }
      // addCurvePoint は既存の点オブジェクトを再利用する契約のため、新規点は参照比較で特定できる
      draggingIndexRef.current = next.findIndex((p) => !points.includes(p));
      updateChannel(next);
    },
    [points, toNormalized, updateChannel],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (draggingIndexRef.current === null) {
        return;
      }
      const { x, y } = toNormalized(e);
      updateChannel(moveCurvePoint(points, draggingIndexRef.current, x, y));
    },
    [points, toNormalized, updateChannel],
  );

  const stopDragging = useCallback(() => {
    draggingIndexRef.current = null;
  }, []);

  // 背景の輝度ヒストグラム（黒/白レベルの分布を見ながらカーブを引ける）
  const histogramPath = useMemo(() => {
    if (!histogram) {
      return null;
    }
    return buildHistogramPath(histogram.luminance, {
      width: STAGE_SIZE,
      height: STAGE_SIZE,
      maxCount: histogramMaxCount(histogram.luminance),
    });
  }, [histogram]);

  // カーブ本体のパス（256 サンプル。y は SVG 座標系へ反転）
  const curvePath = useMemo(() => {
    const lut = buildCurveLut(points);
    const parts: string[] = [];
    for (let i = 0; i < lut.length; i++) {
      const x = round2((i / (lut.length - 1)) * STAGE_SIZE);
      const y = round2((1 - lut[i]) * STAGE_SIZE);
      parts.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
    }
    return parts.join(" ");
  }, [points]);

  const channelChips: { key: CurveChannel; label: string }[] = [
    { key: "rgb", label: t("edit.toneCurve.rgb") },
    { key: "luminance", label: t("edit.toneCurve.luminance") },
  ];

  return (
    <div className={styles.panel} data-testid="tone-curve-panel">
      <div className={styles.header}>
        <span className={styles.title}>{t("edit.toneCurve.title")}</span>
        <div className={styles.buttonRow}>
          {channelChips.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${styles.chip} ${channel === key ? styles.chipActive : ""}`}
              onClick={() => setChannel(key)}
              aria-pressed={channel === key}
              data-testid={`tone-curve-mode-${key}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={stageRef}
        className={styles.stage}
        viewBox={`0 0 ${STAGE_SIZE} ${STAGE_SIZE}`}
        preserveAspectRatio="none"
        aria-label={t("edit.toneCurve.title")}
        data-testid="tone-curve-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <title>{t("edit.toneCurve.title")}</title>
        {histogramPath && (
          <path d={histogramPath} className={styles.histogram} />
        )}
        {/* 1/4 グリッドと対角の恒等基準線 */}
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f} className={styles.grid}>
            <line
              x1={f * STAGE_SIZE}
              y1={0}
              x2={f * STAGE_SIZE}
              y2={STAGE_SIZE}
            />
            <line
              x1={0}
              y1={f * STAGE_SIZE}
              x2={STAGE_SIZE}
              y2={f * STAGE_SIZE}
            />
          </g>
        ))}
        <line
          className={styles.diagonal}
          x1={0}
          y1={STAGE_SIZE}
          x2={STAGE_SIZE}
          y2={0}
        />
        <path
          d={curvePath}
          className={styles.curve}
          data-testid="tone-curve-path"
        />
        {points.map((p, index) => (
          <circle
            key={index}
            className={styles.point}
            cx={p.x * STAGE_SIZE}
            cy={(1 - p.y) * STAGE_SIZE}
            r={6}
            data-point-index={index}
            data-testid={`tone-curve-point-${index}`}
            onDoubleClick={() => updateChannel(removeCurvePoint(points, index))}
          />
        ))}
      </svg>

      <div className={styles.footer}>
        <p className={styles.hint}>{t("edit.toneCurve.hint")}</p>
        <button
          type="button"
          className={styles.reset}
          onClick={() => updateChannel(DEFAULT_TONE_CURVE[channel])}
          disabled={isDefaultCurvePoints(points)}
          data-testid="tone-curve-reset"
        >
          {t("edit.toneCurve.reset")}
        </button>
      </div>
    </div>
  );
};
