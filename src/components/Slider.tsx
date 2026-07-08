import type React from "react";
import styles from "./Slider.module.css";

interface SliderProps {
  /** 表示ラベル */
  label: string;
  /** 現在値 */
  value: number;
  min: number;
  max: number;
  /** 無調整とみなす既定値（リセットボタンの活性判定に使う） */
  defaultValue: number;
  onChange: (value: number) => void;
  onReset: () => void;
  /** リセットボタンの aria-label / title（i18n 文言を親から渡す） */
  resetLabel: string;
  step?: number;
}

/**
 * ラベル・現在値・個別リセット付きのレンジスライダー（CSS Modules）。
 * 画像編集の各調整項目で再利用する汎用コンポーネント。
 */
export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  onReset,
  resetLabel,
  step = 1,
}) => {
  const isDefault = value === defaultValue;
  return (
    <div className={styles.slider}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
        <button
          type="button"
          className={styles.reset}
          onClick={onReset}
          disabled={isDefault}
          aria-label={resetLabel}
          title={resetLabel}
        >
          ⟲
        </button>
      </div>
      <input
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
};
