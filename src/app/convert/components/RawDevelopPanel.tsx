import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/Button";
import { RadioButtonGroup } from "../../../components/RadioButtonGroup";
import { Slider } from "../../../components/Slider";
import { decodeRawToImageData } from "../../../utils/rawDecoder";
import {
  DEFAULT_RAW_DEVELOP_PARAMS,
  EXPOSURE_EV_MAX,
  EXPOSURE_EV_MIN,
  isDefaultRawDevelopParams,
  KELVIN_DEFAULT,
  KELVIN_MAX,
  KELVIN_MIN,
  type RawDevelopParams,
  type RawHighlightMode,
  type RawWbMode,
} from "../../../utils/rawDevelopment";
import styles from "./RawDevelopPanel.module.css";

/** プレビュー再現像のデバウンス時間（スライダードラッグ中の現像積み上げ防止） */
const PREVIEW_DEBOUNCE_MS = 300;

interface RawDevelopPanelProps {
  /** プレビュー対象の RAW ファイル（選択中の先頭 1 件） */
  file: File;
  params: RawDevelopParams;
  onParamsChange: (params: RawDevelopParams) => void;
}

/**
 * RAW 現像パラメータ調整パネル（Issue #132）
 *
 * RAW ファイル投入時（convert モード）のみ表示され、露出補正 / ホワイトバランス /
 * ハイライト復元を調整できる。プレビューは先頭の RAW ファイルを half-size で
 * 再現像して表示する（latest-wins: 現像中の再要求は最新パラメータ 1 件だけ保留）。
 */
export const RawDevelopPanel: React.FC<RawDevelopPanelProps> = ({
  file,
  params,
  onParamsChange,
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ファイル内容のキャッシュ（パラメータ変更のたびに File を読み直さない）。
  // decodeRawToImageData 呼び出し側で postMessage transfer により detach されるため、
  // 渡す直前に slice(0) で複製してキャッシュ自体は使い回す
  const bufferRef = useRef<{ file: File; buffer: ArrayBuffer } | null>(null);
  // latest-wins 制御: 現像中フラグと、現像中に届いた最新パラメータの保留枠
  const busyRef = useRef(false);
  const pendingRef = useRef<RawDevelopParams | null>(null);
  const mountedRef = useRef(true);
  const [isRendering, setIsRendering] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const renderPreview = useCallback(
    async (requested: RawDevelopParams, targetFile: File) => {
      if (busyRef.current) {
        // 現像中: 最新のパラメータだけを保留し、完了後に 1 回だけ再現像する
        pendingRef.current = requested;
        return;
      }
      busyRef.current = true;
      setIsRendering(true);
      try {
        let current: RawDevelopParams | null = requested;
        while (current) {
          pendingRef.current = null;
          if (bufferRef.current?.file !== targetFile) {
            bufferRef.current = {
              file: targetFile,
              buffer: await targetFile.arrayBuffer(),
            };
          }
          // half-size 現像で軽量化する（demosaic 省略・面積 1/4。Issue #132）
          const { data, width, height } = await decodeRawToImageData(
            bufferRef.current.buffer.slice(0),
            current,
            { halfSize: true },
          );
          if (!mountedRef.current) {
            return;
          }
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx) {
            canvas.width = width;
            canvas.height = height;
            ctx.putImageData(new ImageData(data, width, height), 0, 0);
          }
          setPreviewFailed(false);
          current = pendingRef.current;
        }
      } catch (error) {
        console.error("RAW プレビューの現像に失敗:", error);
        if (mountedRef.current) {
          setPreviewFailed(true);
        }
      } finally {
        busyRef.current = false;
        if (mountedRef.current) {
          setIsRendering(false);
        }
      }
    },
    [],
  );

  // パラメータ・ファイル変更時にデバウンスしてプレビューを再現像する
  useEffect(() => {
    const timer = setTimeout(() => {
      void renderPreview(params, file);
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [params, file, renderPreview]);

  const wbOptions: { label: string; value: RawWbMode }[] = [
    { label: t("convert.rawDevelop.wbCamera"), value: "camera" },
    { label: t("convert.rawDevelop.wbAuto"), value: "auto" },
    { label: t("convert.rawDevelop.wbManual"), value: "manual" },
  ];

  const highlightOptions: { label: string; value: string }[] = [
    { label: t("convert.rawDevelop.highlightClip"), value: "0" },
    { label: t("convert.rawDevelop.highlightBlend"), value: "2" },
    { label: t("convert.rawDevelop.highlightRebuild"), value: "5" },
  ];

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{t("convert.rawDevelop.title")}</h2>
      <div className={styles.helpText}>
        {t("convert.rawDevelop.description")}
      </div>

      <h3 className={styles.sectionTitle}>
        {t("convert.rawDevelop.exposure")}
      </h3>
      <div className={styles.sliderGroup}>
        <Slider
          label={t("convert.rawDevelop.exposureLabel")}
          value={params.exposureEV}
          min={EXPOSURE_EV_MIN}
          max={EXPOSURE_EV_MAX}
          step={0.1}
          defaultValue={DEFAULT_RAW_DEVELOP_PARAMS.exposureEV}
          onChange={(value) => onParamsChange({ ...params, exposureEV: value })}
          onReset={() =>
            onParamsChange({
              ...params,
              exposureEV: DEFAULT_RAW_DEVELOP_PARAMS.exposureEV,
            })
          }
          resetLabel={t("convert.rawDevelop.resetItem")}
        />
      </div>
      <div className={styles.helpText}>
        {t("convert.rawDevelop.exposureHelp")}
      </div>

      <h3 className={styles.sectionTitle}>
        {t("convert.rawDevelop.whiteBalance")}
      </h3>
      <RadioButtonGroup
        name="rawWbMode"
        options={wbOptions}
        selectedValue={params.wbMode}
        onChange={(value) =>
          onParamsChange({ ...params, wbMode: value as RawWbMode })
        }
      />
      {params.wbMode === "manual" && (
        <>
          <div className={styles.sliderGroup}>
            <Slider
              label={t("convert.rawDevelop.colorTemperature")}
              value={params.kelvin}
              min={KELVIN_MIN}
              max={KELVIN_MAX}
              step={100}
              defaultValue={KELVIN_DEFAULT}
              onChange={(value) => onParamsChange({ ...params, kelvin: value })}
              onReset={() =>
                onParamsChange({ ...params, kelvin: KELVIN_DEFAULT })
              }
              resetLabel={t("convert.rawDevelop.resetItem")}
            />
          </div>
          <div className={styles.helpText}>
            {t("convert.rawDevelop.colorTemperatureHelp")}
          </div>
        </>
      )}

      <h3 className={styles.sectionTitle}>
        {t("convert.rawDevelop.highlight")}
      </h3>
      <RadioButtonGroup
        name="rawHighlightMode"
        options={highlightOptions}
        selectedValue={String(params.highlightMode)}
        onChange={(value) =>
          onParamsChange({
            ...params,
            highlightMode: Number(value) as RawHighlightMode,
          })
        }
      />

      <h3 className={styles.sectionTitle}>{t("convert.rawDevelop.preview")}</h3>
      <div className={styles.previewContainer}>
        <canvas
          ref={canvasRef}
          className={styles.previewCanvas}
          data-testid="raw-develop-preview"
        />
        {isRendering && (
          <div className={styles.previewOverlay}>
            {t("convert.rawDevelop.previewLoading")}
          </div>
        )}
      </div>
      <div className={styles.helpText}>
        {previewFailed
          ? t("convert.rawDevelop.previewError")
          : t("convert.rawDevelop.previewNote")}
      </div>

      <div className={styles.buttonContainer}>
        <Button
          variant="secondary"
          size="medium"
          onClick={() => onParamsChange(DEFAULT_RAW_DEVELOP_PARAMS)}
          disabled={isDefaultRawDevelopParams(params)}
        >
          {t("convert.rawDevelop.reset")}
        </Button>
      </div>
    </div>
  );
};
