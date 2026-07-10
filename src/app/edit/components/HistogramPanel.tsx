import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildHistogramPath,
  type HistogramData,
  histogramMaxCount,
} from "../../../utils/histogram";
import styles from "./HistogramPanel.module.css";

/** SVG の viewBox 寸法（描画は CSS で伸縮するため論理座標）。幅はビン数に合わせる */
const CHART_WIDTH = 256;
const CHART_HEIGHT = 100;

type HistogramMode = "rgb" | "luminance";

interface HistogramPanelProps {
  /** 表示するヒストグラム（プレビュー未生成時は null で非表示） */
  histogram: HistogramData | null;
}

/**
 * 調整・LUT 適用後のプレビューから算出したヒストグラムを表示するパネル。
 * RGB（3 チャンネル重畳）/ 輝度の表示切替チップ付き（黒/白レベル調整の指標）。
 * ビン計算は page 側（`computeHistogram`）で行い、本コンポーネントは表示に徹する。
 */
export const HistogramPanel: React.FC<HistogramPanelProps> = ({
  histogram,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<HistogramMode>("rgb");

  // パス文字列の生成はビン列が変わったときだけ行う（スライダー操作中の再計算を最小化）
  const paths = useMemo(() => {
    if (!histogram) {
      return null;
    }
    const size = { width: CHART_WIDTH, height: CHART_HEIGHT };
    // RGB は 3 チャンネル共通のスケールで重ねる（チャンネル間の量比較を保つ）
    const rgbMax = histogramMaxCount(histogram.r, histogram.g, histogram.b);
    return {
      r: buildHistogramPath(histogram.r, { ...size, maxCount: rgbMax }),
      g: buildHistogramPath(histogram.g, { ...size, maxCount: rgbMax }),
      b: buildHistogramPath(histogram.b, { ...size, maxCount: rgbMax }),
      luminance: buildHistogramPath(histogram.luminance, {
        ...size,
        maxCount: histogramMaxCount(histogram.luminance),
      }),
    };
  }, [histogram]);

  if (!paths) {
    return null;
  }

  return (
    <div className={styles.panel} data-testid="histogram-panel">
      <div className={styles.header}>
        <span className={styles.title}>{t("edit.histogram.title")}</span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={`${styles.chip} ${mode === "rgb" ? styles.chipActive : ""}`}
            onClick={() => setMode("rgb")}
            aria-pressed={mode === "rgb"}
            data-testid="histogram-mode-rgb"
          >
            {t("edit.histogram.rgb")}
          </button>
          <button
            type="button"
            className={`${styles.chip} ${mode === "luminance" ? styles.chipActive : ""}`}
            onClick={() => setMode("luminance")}
            aria-pressed={mode === "luminance"}
            data-testid="histogram-mode-luminance"
          >
            {t("edit.histogram.luminance")}
          </button>
        </div>
      </div>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("edit.histogram.title")}
      >
        {mode === "rgb" ? (
          <>
            <path
              d={paths.r}
              className={styles.pathR}
              data-testid="histogram-path-r"
            />
            <path
              d={paths.g}
              className={styles.pathG}
              data-testid="histogram-path-g"
            />
            <path
              d={paths.b}
              className={styles.pathB}
              data-testid="histogram-path-b"
            />
          </>
        ) : (
          <path
            d={paths.luminance}
            className={styles.pathLuminance}
            data-testid="histogram-path-luminance"
          />
        )}
      </svg>
    </div>
  );
};
