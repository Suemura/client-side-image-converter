import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNotice } from "../../../components/ErrorNotice";
import { usePressAndHold } from "../../../hooks/usePressAndHold";
import { createOrientedPreviewUrl } from "../../../utils/imageCropper";
import type { StudioToolId } from "../../../utils/studioCore";
import { resolveOutputSize } from "../../../utils/upscaleCore";
import { CropSelector } from "../../crop/components/CropSelector";
import { CompareView } from "../../edit/components/CompareView";
import { RedactSelector } from "../../redact/components/RedactSelector";
import type { AiProgressState, StudioTools } from "../hooks/useStudioTools";
import styles from "./CanvasStage.module.css";
import { OriginalHoldOverlay } from "./OriginalHoldOverlay";
import { PreviewCanvas } from "./PreviewCanvas";

/** ズーム倍率の刻み（fit 表示に対する倍率） */
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

interface CanvasStageProps {
  tool: StudioToolId;
  tools: StudioTools;
  files: File[];
  selectedIndex: number;
  onPreviousImage: () => void;
  onNextImage: () => void;
  /** EXIF 補正済みのプレビューソース（調整・レタッチ・AI・情報で共有） */
  previewSource: HTMLCanvasElement | null;
  /** 長押し原画表示用: ツール横断の元画像（EXIF 補正のみ適用。未準備は null） */
  originalSource: HTMLCanvasElement | null;
  previewSize: { width: number; height: number };
  previewError: boolean;
  /** 調整プレビューの前後比較モード */
  compare: boolean;
  /** 調整プレビューの描画フレーム通知（ヒストグラム用。現状未使用なら省略可） */
  onEditedFrame?: (frame: ImageData) => void;
  /** WB スポイト */
  eyedropperActive: boolean;
  onEyedropperPick: (x: number, y: number) => void;
  /** AI ツールの進捗（キャンバスオーバーレイに表示する） */
  aiProgress: AiProgressState | null;
  /** 情報ツール: 現在画像に GPS メタデータがあるか（ピン表示） */
  hasGps: boolean;
  /** スマホでは前後送り矢印とフローティング比較トグルを表示する */
  isMobile: boolean;
  onCompareChange: (compare: boolean) => void;
}

/**
 * 中央キャンバス。選択中ツールに応じてプレビュー / セレクター / オーバーレイを切り替える。
 * - 調整: CompareView（前後比較スプリット。出力と同一描画経路 = WYSIWYG）
 * - 切り抜き: CropSelector（回転 / 反転焼き込み済みプレビュー上で領域指定）
 * - レタッチ: RedactSelector（指定領域のプレビュー焼き込み表示）
 * - AI拡大: 静的プレビュー + 解像度ラベル + 進捗
 * - AI背景: 市松模様背景の静的プレビュー
 * - 情報: 静的プレビュー + GPS ピン
 */
export const CanvasStage: React.FC<CanvasStageProps> = ({
  tool,
  tools,
  files,
  selectedIndex,
  onPreviousImage,
  onNextImage,
  previewSource,
  originalSource,
  previewSize,
  previewError,
  compare,
  onEditedFrame,
  eyedropperActive,
  onEyedropperPick,
  aiProgress,
  hasGps,
  isMobile,
  onCompareChange,
}) => {
  const { t } = useTranslation();
  const [zoomIndex, setZoomIndex] = useState(2); // 1x（fit）
  const zoom = ZOOM_LEVELS[zoomIndex];

  // 切り抜きツール用: 回転 / 反転を焼き込んだプレビュー URL（crop ページと同方式）
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string>("");
  const [cropPreviewError, setCropPreviewError] = useState(false);
  const { rotation, flipHorizontal, flipVertical } =
    tools.crop.currentTransform;

  useEffect(() => {
    if (tool !== "crop" || files.length === 0) {
      return;
    }
    const file = files[selectedIndex];
    if (!file) {
      return;
    }
    let cancelled = false;
    createOrientedPreviewUrl(file, { rotation, flipHorizontal, flipVertical })
      .then((generated) => {
        if (cancelled) {
          URL.revokeObjectURL(generated);
          return;
        }
        setCropPreviewUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return generated;
        });
        setCropPreviewError(false);
      })
      .catch((error) => {
        console.error("Crop preview generation failed:", error);
        if (!cancelled) {
          setCropPreviewError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tool, files, selectedIndex, rotation, flipHorizontal, flipVertical]);

  // アンマウント時にプレビュー URL を解放する
  useEffect(() => {
    return () => {
      setCropPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return "";
      });
    };
  }, []);

  const zoomIn = useCallback(() => {
    setZoomIndex((prev) => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);
  const zoomOut = useCallback(() => {
    setZoomIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // ステージ実寸を測り、プレビューの「フィット表示幅 × ズーム倍率」を実 px で決める。
  // 子コンポーネント（CompareView / CropSelector / RedactSelector / PreviewCanvas）は
  // それぞれ固有のサイズ上限（max-width / max-height）を持ち % 幅では追従しないため、
  // CSS 変数 --studio-preview-width の実 px を配布して img / canvas を直接追従させる
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const update = (): void => {
      setStageSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // ズームエリアの padding（左右合計）ぶんを除いたフィット幅。
  // 高さ方向は画像アスペクト比（未読込は 0 = 幅フィットのみ）で内接させる
  const STAGE_PADDING = 48;
  const fitWidth = (() => {
    const availableWidth = Math.max(stageSize.width - STAGE_PADDING, 64);
    const availableHeight = Math.max(stageSize.height - STAGE_PADDING, 64);
    if (previewSize.width <= 0 || previewSize.height <= 0) {
      return availableWidth;
    }
    const aspect = previewSize.width / previewSize.height;
    return Math.min(availableWidth, availableHeight * aspect);
  })();
  const previewWidth = Math.max(64, Math.round(fitWidth * zoom));

  const upscaledSize =
    previewSize.width > 0
      ? resolveOutputSize(
          previewSize.width,
          previewSize.height,
          tools.upscale.scale,
        )
      : null;

  const currentFile = files[selectedIndex] ?? null;
  const showError = previewError || (tool === "crop" && cropPreviewError);

  // レタッチの AI 自動検出候補（選択中カテゴリのみ破線 + ラベルで表示する）
  const { detect } = tools.retouch;
  const detectionOverlays = (detect.candidates ?? [])
    .filter((candidate) => detect.selection[candidate.category])
    .map((candidate, index) => ({
      key: `${candidate.category}-${index}`,
      label: t(`studio.retouch.detect.label.${candidate.category}`),
      area: candidate.rect,
    }));

  // 長押しで原画（ツール横断の元画像）を表示する（#146）。
  // 静的プレビュー系ツール（AI拡大・AI背景・情報）のみ対象。切り抜き / レタッチは
  // キャンバス上のドラッグ操作（領域指定・ハンドル）と競合するため対象外、
  // AI 処理の実行中も無効。調整ツールは CompareView 側で処理する
  const staticHoldEnabled =
    (tool === "upscale" || tool === "removebg" || tool === "info") &&
    previewSource !== null &&
    originalSource !== null &&
    aiProgress === null;
  const staticHold = usePressAndHold({ disabled: !staticHoldEnabled });

  return (
    <div className={styles.stage} data-testid="studio-canvas-stage">
      <div className={styles.scroll} ref={scrollRef}>
        <div
          className={styles.zoomArea}
          style={
            {
              "--studio-preview-width": `${previewWidth}px`,
            } as React.CSSProperties
          }
          data-tool={tool}
        >
          <ErrorNotice
            message={showError ? t("studio.canvas.previewError") : null}
          />

          {tool === "adjust" && (
            <CompareView
              source={previewSource}
              width={previewSize.width}
              height={previewSize.height}
              adjustments={tools.adjust.scopeStores.adjustments.current}
              lut={tools.adjust.lutRegistry.currentLut}
              curve={tools.adjust.scopeStores.currentCurveTable}
              currentIndex={selectedIndex}
              totalImages={files.length}
              onPreviousImage={onPreviousImage}
              onNextImage={onNextImage}
              onEditedFrame={onEditedFrame}
              eyedropperActive={eyedropperActive}
              onEyedropperPick={onEyedropperPick}
              showCompare={compare}
              holdSource={originalSource}
              pressHoldEnabled={!compare}
            />
          )}

          {tool === "crop" && cropPreviewUrl && (
            <CropSelector
              key={cropPreviewUrl}
              imageUrl={cropPreviewUrl}
              onCropAreaChange={tools.crop.setCurrentArea}
              initialCropArea={tools.crop.currentArea || undefined}
              aspectRatio={tools.crop.aspectRatio}
              currentIndex={selectedIndex}
              totalImages={files.length}
              onPreviousImage={onPreviousImage}
              onNextImage={onNextImage}
            />
          )}

          {tool === "retouch" && previewSource && (
            <RedactSelector
              key={`${selectedIndex}:${currentFile?.name ?? ""}`}
              sourceCanvas={previewSource}
              regions={tools.retouch.currentRegions}
              detections={detectionOverlays}
              redactStyle={tools.retouch.style}
              onAddRegion={tools.retouch.addRegion}
              onUpdateRegion={tools.retouch.updateRegion}
              onRemoveRegion={tools.retouch.removeRegion}
              currentIndex={selectedIndex}
              totalImages={files.length}
              onPreviousImage={onPreviousImage}
              onNextImage={onNextImage}
            />
          )}

          {tool === "upscale" && (
            <div className={styles.staticWrap} {...staticHold.bind}>
              <PreviewCanvas
                source={previewSource}
                label={currentFile?.name ?? ""}
              />
              <OriginalHoldOverlay
                source={originalSource}
                active={staticHold.active}
              />
              {upscaledSize && (
                <span className={styles.cornerLabel}>
                  {t("studio.upscale.outputSize", {
                    srcWidth: previewSize.width,
                    srcHeight: previewSize.height,
                    width: upscaledSize.width,
                    height: upscaledSize.height,
                  })}
                </span>
              )}
              {aiProgress && (
                <>
                  <span className={styles.progressLabel}>
                    {aiProgress.stage === "download"
                      ? t("upscale.preparingModel", {
                          percent: aiProgress.percent,
                        })
                      : t("studio.upscale.processing", {
                          percent: aiProgress.percent,
                        })}
                  </span>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${aiProgress.percent}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {tool === "removebg" && (
            <div
              className={`${styles.staticWrap} ${styles.checkerboard}`}
              {...staticHold.bind}
            >
              <PreviewCanvas
                source={previewSource}
                label={currentFile?.name ?? ""}
              />
              <OriginalHoldOverlay
                source={originalSource}
                active={staticHold.active}
              />
              {aiProgress && (
                <>
                  <span className={styles.progressLabel}>
                    {aiProgress.stage === "download"
                      ? t("removeBg.preparingModel", {
                          percent: aiProgress.percent,
                        })
                      : t("removeBg.removingProgress", {
                          current: aiProgress.currentFile,
                          total: aiProgress.totalFiles,
                        })}
                  </span>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${aiProgress.percent}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {tool === "info" && (
            <div className={styles.staticWrap} {...staticHold.bind}>
              <PreviewCanvas
                source={previewSource}
                label={currentFile?.name ?? ""}
              />
              <OriginalHoldOverlay
                source={originalSource}
                active={staticHold.active}
              />
              {hasGps && (
                <span className={styles.gpsPin} title="GPS">
                  <svg
                    viewBox="0 0 24 24"
                    width="34"
                    height="34"
                    fill="var(--accent)"
                    stroke="#fff"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" />
                    <circle cx="12" cy="9" r="2.5" fill="#fff" />
                  </svg>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* スマホ: フローティング前後比較トグル（調整ツールのみ） */}
      {isMobile && tool === "adjust" && (
        <div className={styles.floatingSegment}>
          <button
            type="button"
            className={`${styles.floatingButton}${!compare ? ` ${styles.floatingActive}` : ""}`}
            onClick={() => onCompareChange(false)}
          >
            {t("studio.topbar.editedOnly")}
          </button>
          <button
            type="button"
            className={`${styles.floatingButton}${compare ? ` ${styles.floatingActive}` : ""}`}
            onClick={() => onCompareChange(true)}
          >
            {t("studio.topbar.compare")}
          </button>
        </div>
      )}

      {/* スマホ: 前後送り矢印 */}
      {isMobile && files.length > 1 && (
        <>
          <button
            type="button"
            className={`${styles.navArrow} ${styles.navPrev}`}
            onClick={onPreviousImage}
            aria-label={t("crop.previousImage")}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.navArrow} ${styles.navNext}`}
            onClick={onNextImage}
            aria-label={t("crop.nextImage")}
          >
            ›
          </button>
        </>
      )}

      {/* ズームコントロール */}
      <div className={styles.zoomControl}>
        {!isMobile && (
          <button
            type="button"
            className={styles.zoomButton}
            onClick={zoomOut}
            disabled={zoomIndex === 0}
            aria-label={t("studio.canvas.zoomOut")}
          >
            −
          </button>
        )}
        <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
        {!isMobile && (
          <button
            type="button"
            className={styles.zoomButton}
            onClick={zoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            aria-label={t("studio.canvas.zoomIn")}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
};
