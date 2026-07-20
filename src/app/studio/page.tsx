"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNotice } from "../../components/ErrorNotice";
import { FileUploadArea } from "../../components/FileUploadArea";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { MAX_INPUT_FILES } from "../../utils/constants";
import type { StudioToolId } from "../../utils/studioCore";
import { useEditPreview } from "../edit/hooks/useEditPreview";
import { useWhiteBalanceTools } from "../edit/hooks/useWhiteBalanceTools";
import { BottomSheet } from "./components/BottomSheet";
import { CanvasStage } from "./components/CanvasStage";
import { ExportDialog } from "./components/ExportDialog";
import { Filmstrip } from "./components/Filmstrip";
import { HistoryPanel } from "./components/HistoryPanel";
import { MobileTabBar } from "./components/MobileTabBar";
import { AdjustPanel } from "./components/panels/AdjustPanel";
import { CropPanel } from "./components/panels/CropPanel";
import { InfoPanel } from "./components/panels/InfoPanel";
import { RemoveBgPanel } from "./components/panels/RemoveBgPanel";
import { RetouchPanel } from "./components/panels/RetouchPanel";
import { UpscalePanel } from "./components/panels/UpscalePanel";
import { ToolRail } from "./components/ToolRail";
import { TopBar } from "./components/TopBar";
import { useStudioDocuments } from "./hooks/useStudioDocuments";
import { useStudioTools } from "./hooks/useStudioTools";
import styles from "./studio.module.css";

export default function StudioPage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 768px)");

  const docs = useStudioDocuments();
  const { files, documents, selectedIndex, setSelectedIndex } = docs;
  const tools = useStudioTools(docs);
  const { tool, setTool } = tools;

  // 選択インデックスはドキュメント側が所有するため、前後送りは剰余で巡回させる
  const handlePreviousImage = useCallback(() => {
    setSelectedIndex(
      files.length === 0
        ? 0
        : (selectedIndex - 1 + files.length) % files.length,
    );
  }, [files.length, selectedIndex, setSelectedIndex]);
  const handleNextImage = useCallback(() => {
    setSelectedIndex(
      files.length === 0 ? 0 : (selectedIndex + 1) % files.length,
    );
  }, [files.length, selectedIndex, setSelectedIndex]);

  // 前後比較モード（調整ツールのプレビュー）
  const [compare, setCompare] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  // 履歴パネル（PC: サイドパネル / スマホ: ボトムシート）の開閉
  const [historyOpen, setHistoryOpen] = useState(false);

  // EXIF 補正済みプレビューソース（調整・レタッチ・AI・情報で共有）
  const { previewSource, previewSize, sourceHistogram, previewError } =
    useEditPreview(files, selectedIndex);

  // 自動補正（オートレベル / 自動 WB / WB スポイト）
  const {
    wbEyedropperActive,
    handleToggleEyedropper,
    handleAutoLevels,
    handleAutoWhiteBalance,
    handleEyedropperPick,
  } = useWhiteBalanceTools({
    files,
    currentIndex: selectedIndex,
    previewSource,
    sourceHistogram,
    currentAdjustments: tools.adjust.scopeStores.adjustments.current,
    setCurrentAdjustments: tools.adjust.scopeStores.adjustments.setCurrent,
  });

  // 情報ツール: 現在画像に GPS メタデータがあるか（キャンバスのピン表示）
  const currentFileMetadata =
    tools.info.manager.analysis?.fileMetadata[selectedIndex];
  const hasGps = currentFileMetadata
    ? Object.keys(currentFileMetadata.exifData).some((tag) =>
        tag.toLowerCase().includes("gps"),
      )
    : false;

  const currentFile = files[selectedIndex] ?? null;
  const hasFiles = files.length > 0;

  const renderPanel = (activeTool: StudioToolId, compact: boolean) => {
    switch (activeTool) {
      case "crop":
        return (
          <CropPanel
            tools={tools}
            imageCount={files.length}
            compact={compact}
          />
        );
      case "adjust":
        return (
          <AdjustPanel
            tools={tools}
            onAutoLevels={handleAutoLevels}
            onAutoWhiteBalance={handleAutoWhiteBalance}
            onToggleEyedropper={handleToggleEyedropper}
            eyedropperActive={wbEyedropperActive}
            autoDisabled={!sourceHistogram}
            compact={compact}
          />
        );
      case "retouch":
        return <RetouchPanel tools={tools} compact={compact} />;
      case "upscale":
        return (
          <UpscalePanel
            tools={tools}
            previewSize={previewSize}
            compact={compact}
          />
        );
      case "removebg":
        return <RemoveBgPanel tools={tools} compact={compact} />;
      case "info":
        return (
          <InfoPanel
            tools={tools}
            currentFile={currentFile}
            compact={compact}
          />
        );
    }
  };

  return (
    <div className={styles.workspace} data-testid="studio-workspace">
      <TopBar
        fileName={currentFile?.name ?? null}
        compare={compare}
        onCompareChange={setCompare}
        canUndo={docs.canUndo}
        canRedo={docs.canRedo}
        onUndo={docs.undo}
        onRedo={docs.redo}
        onOpenExport={() => setExportOpen(true)}
        exportDisabled={!hasFiles}
        isMobile={isMobile}
        onToggleHistory={() => setHistoryOpen((prev) => !prev)}
        historyDisabled={!hasFiles}
      />

      {!hasFiles ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyHint}>{t("studio.canvas.dropHint")}</p>
          <div className={styles.emptyUpload}>
            <FileUploadArea
              files={files}
              onFilesSelected={docs.addFiles}
              onClearFiles={() => undefined}
              showFileList={false}
            />
          </div>
        </div>
      ) : isMobile ? (
        <>
          <Filmstrip
            documents={documents}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onAddFiles={docs.addFiles}
            applyToAll={tools.applyToAll}
            onApplyToAllChange={tools.setApplyToAllMode}
            isMobile
          />
          <CanvasStage
            tool={tool}
            tools={tools}
            files={files}
            selectedIndex={selectedIndex}
            onPreviousImage={handlePreviousImage}
            onNextImage={handleNextImage}
            previewSource={previewSource}
            previewSize={previewSize}
            previewError={previewError}
            compare={compare}
            eyedropperActive={wbEyedropperActive}
            onEyedropperPick={handleEyedropperPick}
            aiProgress={tools.aiProgress}
            hasGps={hasGps}
            isMobile
            onCompareChange={setCompare}
          />
          <BottomSheet>{renderPanel(tool, true)}</BottomSheet>
          <MobileTabBar tool={tool} onToolChange={setTool} />
          {historyOpen && (
            <HistoryPanel
              entries={docs.historyEntries}
              currentIndex={docs.historyIndex}
              onJump={docs.jumpToHistory}
              onClear={docs.clearHistory}
              isMobile
              onClose={() => setHistoryOpen(false)}
            />
          )}
        </>
      ) : (
        <>
          <div className={styles.body}>
            <ToolRail
              tool={tool}
              onToolChange={setTool}
              historyOpen={historyOpen}
              onToggleHistory={() => setHistoryOpen((prev) => !prev)}
            />
            {historyOpen && (
              <HistoryPanel
                entries={docs.historyEntries}
                currentIndex={docs.historyIndex}
                onJump={docs.jumpToHistory}
                onClear={docs.clearHistory}
                isMobile={false}
                onClose={() => setHistoryOpen(false)}
              />
            )}
            <CanvasStage
              tool={tool}
              tools={tools}
              files={files}
              selectedIndex={selectedIndex}
              onPreviousImage={handlePreviousImage}
              onNextImage={handleNextImage}
              previewSource={previewSource}
              previewSize={previewSize}
              previewError={previewError}
              compare={compare}
              eyedropperActive={wbEyedropperActive}
              onEyedropperPick={handleEyedropperPick}
              aiProgress={tools.aiProgress}
              hasGps={hasGps}
              isMobile={false}
              onCompareChange={setCompare}
            />
            <div className={styles.rightPanel}>{renderPanel(tool, false)}</div>
          </div>
          <Filmstrip
            documents={documents}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onAddFiles={docs.addFiles}
            applyToAll={tools.applyToAll}
            onApplyToAllChange={tools.setApplyToAllMode}
            isMobile={false}
          />
        </>
      )}

      {/* 適用エラーの通知（全レイアウト共通・下部固定） */}
      <div className={styles.notices}>
        <ErrorNotice
          message={tools.applyError ? t("studio.applyError") : null}
        />
        <ErrorNotice
          message={
            tools.applyFailures.length > 0 ? t("studio.applyFailures") : null
          }
          fileNames={tools.applyFailures}
        />
        <ErrorNotice
          message={
            docs.limitExceeded
              ? t("fileUpload.limitExceeded", { max: MAX_INPUT_FILES })
              : null
          }
        />
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        files={files}
        selectedIndex={selectedIndex}
        buildJobs={tools.buildCurrentEditJobs}
        isMobile={isMobile}
      />
    </div>
  );
}
