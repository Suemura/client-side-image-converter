import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../../components/Slider";
import { useLutThumbnails } from "../../../hooks/useLutThumbnails";
import { loadLutFromFile, loadPresetLut } from "../../../utils/lutLoader";
import type { LutData } from "../../../utils/lutParser";
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
  /** サムネイルのベースにする現在画像（EXIF 補正済み。null は固定グラデーション） */
  previewSource: HTMLCanvasElement | null;
}

/**
 * LUT フィルタの選択 UI（プリセットサムネイル一覧 + カスタムアップロード + 適用強度）。
 * `selection` + `onSelectionChange` の不変更新契約は `AdjustmentPanel` を踏襲する。
 * プレビューの即時反映はページ側が解決した LUT を `CompareView` へ渡すことで行う。
 * サムネイルは現在画像の縮小版へ各 LUT を単体適用して生成する（`useLutThumbnails`）。
 */
export const LutPicker: React.FC<LutPickerProps> = ({
  selection,
  onSelectionChange,
  registerLut,
  customName,
  onCustomLoaded,
  previewSource,
}) => {
  const { t } = useTranslation();
  // サムネイル生成用に読み込み済み LUT データを保持する（ページ側レジストリとは別に、
  // 本コンポーネントが表示に必要な分だけを持つ）
  const [loadedLuts, setLoadedLuts] = useState<Record<string, LutData>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { thumbnails, noneThumb } = useLutThumbnails(previewSource, loadedLuts);

  // プリセットをマウント時にまとめて読み込み、レジストリ登録 + サムネイル用に保持する
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
          setLoadedLuts((prev) => ({ ...prev, [preset.id]: data }));
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
        setLoadedLuts((prev) => ({ ...prev, [CUSTOM_LUT_ID]: data }));
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
          <span
            className={`${styles.thumb} ${noneThumb ? "" : styles.thumbNone}`}
            style={
              noneThumb ? { backgroundImage: `url(${noneThumb})` } : undefined
            }
          />
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
