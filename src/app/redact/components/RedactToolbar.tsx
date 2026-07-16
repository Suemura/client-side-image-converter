import type React from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../../components/Slider";
import {
  BLUR_RADIUS_MAX,
  BLUR_RADIUS_MIN,
  DEFAULT_REDACT_STYLE,
  MOSAIC_BLOCK_SIZE_MAX,
  MOSAIC_BLOCK_SIZE_MIN,
  type RedactMode,
  type RedactStyle,
} from "../../../utils/redactCore";
import styles from "./RedactToolbar.module.css";

interface RedactToolbarProps {
  /** 現在の隠し方の設定 */
  redactStyle: RedactStyle;
  onStyleChange: (style: RedactStyle) => void;
  /** 現在の画像で指定中の領域数 */
  regionCount: number;
  /** 現在の画像の領域をすべて削除する */
  onClearRegions: () => void;
}

/** 隠し方の選択肢（表示順） */
const REDACT_MODES: { mode: RedactMode; labelKey: string }[] = [
  { mode: "mosaic", labelKey: "redact.modeMosaic" },
  { mode: "blur", labelKey: "redact.modeBlur" },
  { mode: "fill", labelKey: "redact.modeFill" },
];

/**
 * 隠し方（モザイク / ぼかし / 塗りつぶし）の切り替えと、モードに応じた
 * パラメータ（粗さ / 強さ / 色）の指定を行うツールバー（CropToolbar の構成を踏襲）。
 */
export const RedactToolbar: React.FC<RedactToolbarProps> = ({
  redactStyle,
  onStyleChange,
  regionCount,
  onClearRegions,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.toolbar}>
      {/* 隠し方の選択 */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>{t("redact.mode")}</span>
        <div className={styles.buttonRow}>
          {REDACT_MODES.map(({ mode, labelKey }) => (
            <button
              key={mode}
              type="button"
              className={`${styles.chip} ${
                redactStyle.mode === mode ? styles.chipActive : ""
              }`}
              onClick={() => onStyleChange({ ...redactStyle, mode })}
              aria-pressed={redactStyle.mode === mode}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* モードに応じたパラメータ */}
      <div className={styles.group}>
        {redactStyle.mode === "mosaic" && (
          <>
            <div className={styles.sliderWrapper}>
              <Slider
                label={t("redact.mosaicSize")}
                value={redactStyle.mosaicBlockSize}
                min={MOSAIC_BLOCK_SIZE_MIN}
                max={MOSAIC_BLOCK_SIZE_MAX}
                defaultValue={DEFAULT_REDACT_STYLE.mosaicBlockSize}
                onChange={(value) =>
                  onStyleChange({ ...redactStyle, mosaicBlockSize: value })
                }
                onReset={() =>
                  onStyleChange({
                    ...redactStyle,
                    mosaicBlockSize: DEFAULT_REDACT_STYLE.mosaicBlockSize,
                  })
                }
                resetLabel={t("redact.reset")}
              />
            </div>
            <p className={styles.help}>{t("redact.strengthHelp")}</p>
          </>
        )}

        {redactStyle.mode === "blur" && (
          <>
            <div className={styles.sliderWrapper}>
              <Slider
                label={t("redact.blurStrength")}
                value={redactStyle.blurRadius}
                min={BLUR_RADIUS_MIN}
                max={BLUR_RADIUS_MAX}
                defaultValue={DEFAULT_REDACT_STYLE.blurRadius}
                onChange={(value) =>
                  onStyleChange({ ...redactStyle, blurRadius: value })
                }
                onReset={() =>
                  onStyleChange({
                    ...redactStyle,
                    blurRadius: DEFAULT_REDACT_STYLE.blurRadius,
                  })
                }
                resetLabel={t("redact.reset")}
              />
            </div>
            <p className={styles.help}>{t("redact.strengthHelp")}</p>
          </>
        )}

        {redactStyle.mode === "fill" && (
          <label className={styles.colorLabel}>
            <span className={styles.groupLabel}>{t("redact.fillColor")}</span>
            <input
              type="color"
              className={styles.colorInput}
              value={redactStyle.fillColor}
              onChange={(e) =>
                onStyleChange({ ...redactStyle, fillColor: e.target.value })
              }
              aria-label={t("redact.fillColor")}
            />
          </label>
        )}
      </div>

      {/* 領域の管理 */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>
          {t("redact.regionCount", { count: regionCount })}
        </span>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.chip}
            onClick={onClearRegions}
            disabled={regionCount === 0}
          >
            {t("redact.clearRegions")}
          </button>
        </div>
      </div>
    </div>
  );
};
