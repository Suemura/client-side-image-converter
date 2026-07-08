import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../../components/Slider";
import { loadLutFromFile, loadPresetLut } from "../../../utils/lutLoader";
import { applyLutToPixel, type LutData } from "../../../utils/lutParser";
import {
  CUSTOM_LUT_ID,
  LUT_PRESETS,
  LUT_STRENGTH_MAX,
  LUT_STRENGTH_MIN,
  type LutSelection,
} from "../../../utils/lutState";
import styles from "./LutPicker.module.css";

interface LutPickerProps {
  /** 現在の LUT 選択（一括 / 画像ごとで解決済み） */
  selection: LutSelection;
  /** 不変契約: 常に新しい選択オブジェクトを渡す（AdjustmentPanel と同方針） */
  onSelectionChange: (selection: LutSelection) => void;
  /** 読み込んだ LUT データをページのレジストリへ登録する */
  registerLut: (id: string, data: LutData) => void;
  /** カスタムアップロード済み LUT の表示名（未アップロードは null） */
  customName: string | null;
  /** カスタム LUT アップロード完了の通知（ファイル名を渡す） */
  onCustomLoaded: (name: string) => void;
}

const THUMB_W = 56;
const THUMB_H = 36;

/**
 * LUT を固定グラデーションへ適用したサムネイル（dataURL）を生成する。
 * プレビュー用途の軽量描画なので CPU（`applyLutToPixel`）で十分。
 */
const makeThumbnail = (lut: LutData): string => {
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  const image = ctx.createImageData(THUMB_W, THUMB_H);
  for (let y = 0; y < THUMB_H; y++) {
    for (let x = 0; x < THUMB_W; x++) {
      // 幅・高さで色域を広めに走査するベースグラデーション
      const br = x / (THUMB_W - 1);
      const bg = y / (THUMB_H - 1);
      const bb = 1 - x / (THUMB_W - 1);
      const [r, g, b] = applyLutToPixel(br, bg, bb, lut, 1);
      const p = (y * THUMB_W + x) * 4;
      image.data[p] = Math.round(r * 255);
      image.data[p + 1] = Math.round(g * 255);
      image.data[p + 2] = Math.round(b * 255);
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
};

/**
 * LUT フィルタの選択 UI（プリセットサムネイル一覧 + カスタムアップロード + 適用強度）。
 * `selection` + `onSelectionChange` の不変更新契約は `AdjustmentPanel` を踏襲する。
 * プレビューの即時反映はページ側が解決した LUT を `CompareView` へ渡すことで行う。
 */
export const LutPicker: React.FC<LutPickerProps> = ({
  selection,
  onSelectionChange,
  registerLut,
  customName,
  onCustomLoaded,
}) => {
  const { t } = useTranslation();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // プリセットをマウント時にまとめて読み込み、レジストリ登録 + サムネイル生成する
  // （動的 fetch のため初期バンドルには影響しない。個別失敗は握りつぶしてチップは残す）。
  useEffect(() => {
    let cancelled = false;
    for (const preset of LUT_PRESETS) {
      loadPresetLut(preset.file)
        .then((data) => {
          if (cancelled) {
            return;
          }
          registerLut(preset.id, data);
          const thumb = makeThumbnail(data);
          setThumbnails((prev) => ({ ...prev, [preset.id]: thumb }));
        })
        .catch((loadError) => {
          console.warn(`Failed to load preset LUT ${preset.id}:`, loadError);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [registerLut]);

  const handleSelectNone = useCallback(() => {
    setError(null);
    onSelectionChange({ lutId: null, strength: selection.strength });
  }, [onSelectionChange, selection.strength]);

  const handleSelectPreset = useCallback(
    async (id: string, file: string) => {
      setError(null);
      try {
        const data = await loadPresetLut(file);
        registerLut(id, data);
        onSelectionChange({ lutId: id, strength: selection.strength });
      } catch (loadError) {
        console.error("Failed to load preset LUT:", loadError);
        setError(t("edit.lut.invalidFile"));
      }
    },
    [onSelectionChange, registerLut, selection.strength, t],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // 同じファイルを続けて選び直せるよう value をクリアする
      event.target.value = "";
      if (!file) {
        return;
      }
      setError(null);
      try {
        const data = await loadLutFromFile(file);
        registerLut(CUSTOM_LUT_ID, data);
        setThumbnails((prev) => ({
          ...prev,
          [CUSTOM_LUT_ID]: makeThumbnail(data),
        }));
        onCustomLoaded(file.name);
        onSelectionChange({
          lutId: CUSTOM_LUT_ID,
          strength: selection.strength,
        });
      } catch (loadError) {
        console.error("Failed to load custom LUT:", loadError);
        setError(t("edit.lut.invalidFile"));
      }
    },
    [onCustomLoaded, onSelectionChange, registerLut, selection.strength, t],
  );

  const handleStrengthChange = useCallback(
    (value: number) => {
      onSelectionChange({ ...selection, strength: value });
    },
    [onSelectionChange, selection],
  );

  const renderPresetSwatch = (
    id: string,
    file: string,
    label: string,
    thumb: string | undefined,
  ) => {
    const active = selection.lutId === id;
    return (
      <button
        key={id}
        type="button"
        className={`${styles.swatch} ${active ? styles.swatchActive : ""}`}
        onClick={() => handleSelectPreset(id, file)}
        aria-pressed={active}
      >
        <span
          className={styles.thumb}
          style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
        />
        <span className={styles.swatchLabel}>{label}</span>
      </button>
    );
  };

  return (
    <div className={styles.picker}>
      <h4 className={styles.title}>{t("edit.lut.title")}</h4>

      <div className={styles.grid}>
        <button
          type="button"
          className={`${styles.swatch} ${
            selection.lutId === null ? styles.swatchActive : ""
          }`}
          onClick={handleSelectNone}
          aria-pressed={selection.lutId === null}
        >
          <span className={`${styles.thumb} ${styles.thumbNone}`} />
          <span className={styles.swatchLabel}>{t("edit.lut.none")}</span>
        </button>
        {LUT_PRESETS.map((preset) =>
          renderPresetSwatch(
            preset.id,
            preset.file,
            t(`edit.lut.presets.${preset.nameKey}`),
            thumbnails[preset.id],
          ),
        )}
        {customName && (
          <button
            type="button"
            className={`${styles.swatch} ${
              selection.lutId === CUSTOM_LUT_ID ? styles.swatchActive : ""
            }`}
            onClick={() =>
              onSelectionChange({
                lutId: CUSTOM_LUT_ID,
                strength: selection.strength,
              })
            }
            aria-pressed={selection.lutId === CUSTOM_LUT_ID}
            title={customName}
          >
            <span
              className={styles.thumb}
              style={
                thumbnails[CUSTOM_LUT_ID]
                  ? { backgroundImage: `url(${thumbnails[CUSTOM_LUT_ID]})` }
                  : undefined
              }
            />
            <span className={styles.swatchLabel}>{t("edit.lut.custom")}</span>
          </button>
        )}
      </div>

      <div className={styles.uploadRow}>
        <button
          type="button"
          className={styles.uploadButton}
          onClick={handleUploadClick}
        >
          {t("edit.lut.upload")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".cube,.png,image/png"
          className={styles.fileInput}
          onChange={handleFileChange}
        />
      </div>
      <p className={styles.hint}>{t("edit.lut.uploadHint")}</p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {selection.lutId && (
        <div className={styles.strength}>
          <Slider
            label={t("edit.lut.strength")}
            value={selection.strength}
            min={LUT_STRENGTH_MIN}
            max={LUT_STRENGTH_MAX}
            defaultValue={LUT_STRENGTH_MAX}
            resetLabel={t("edit.reset")}
            onChange={handleStrengthChange}
            onReset={() => handleStrengthChange(LUT_STRENGTH_MAX)}
          />
        </div>
      )}
    </div>
  );
};
