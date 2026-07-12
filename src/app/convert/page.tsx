"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { HandoffNotice } from "../../components/HandoffNotice";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ConversionResults } from "../../components/Results";
import { useHandoffReceiver } from "../../hooks/useHandoffReceiver";
import { SUPPORTED_IMAGE_FORMATS } from "../../utils/constants";
import {
  type ConversionFailure,
  type ConversionResult,
  convertMultipleImages,
} from "../../utils/imageConverter";
import { ConversionErrors } from "./components/ConversionErrors";
import {
  ConversionSettings,
  type ConversionSettings as ConversionSettingsType,
} from "./components/ConversionSettings";
import { ImageUploadSection } from "./components/ImageUploadSection";
import { ProgressBar } from "./components/ProgressBar";

export default function Home() {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [conversionSettings, setConversionSettings] =
    useState<ConversionSettingsType>({
      mode: "convert",
      targetFormat: "jpeg",
      quality: 90,
      maintainAspectRatio: true,
      preserveExif: false,
    });
  const [conversionResults, setConversionResults] = useState<
    ConversionResult[]
  >([]);
  const [conversionFailures, setConversionFailures] = useState<
    ConversionFailure[]
  >([]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({
    current: 0,
    total: 0,
  });

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    console.log("Selected files:", files);
  };

  // 他ツールからのハンドオフ（処理結果の引き継ぎ）を mount 時に取り込む
  const { notice: handoffNotice, clearNotice: clearHandoffNotice } =
    useHandoffReceiver(
      SUPPORTED_IMAGE_FORMATS.CONVERT_UPLOAD_FORMATS,
      handleFilesSelected,
    );

  const handleClearFiles = () => {
    setSelectedFiles([]);
    // ファイルを選び直す際は前回の失敗通知も不要になるためリセットする
    setConversionFailures([]);
    clearHandoffNotice();
    console.log("Files cleared");
  };

  const handleSettingsChange = (settings: ConversionSettingsType) => {
    setConversionSettings(settings);
  };

  const handleConvert = useCallback(async () => {
    if (selectedFiles.length === 0) {
      alert(t("convert.pleaseSelectFiles"));
      return;
    }

    setIsConverting(true);
    setConversionProgress({ current: 0, total: selectedFiles.length });
    setConversionResults([]);
    setConversionFailures([]);

    try {
      const { results, failures } = await convertMultipleImages(
        selectedFiles,
        {
          mode: conversionSettings.mode,
          format: conversionSettings.targetFormat,
          quality: conversionSettings.quality,
          width: conversionSettings.width,
          height: conversionSettings.height,
          maintainAspectRatio: conversionSettings.maintainAspectRatio,
          preserveExif: conversionSettings.preserveExif,
          targetFileSizeKB: conversionSettings.targetFileSizeKB,
        },
        (current, total) => {
          setConversionProgress({ current, total });
        },
      );

      setConversionResults(results);
      setConversionFailures(failures);
    } catch (error) {
      console.error("Conversion error:", error);
      alert(t("convert.conversionError"));
    } finally {
      setIsConverting(false);
      setConversionProgress({ current: 0, total: 0 });
    }
  }, [selectedFiles, conversionSettings, t]);

  const handleClearResults = useCallback(() => {
    setConversionResults([]);
    setConversionFailures([]);
    // URLの解放
    for (const result of conversionResults) {
      URL.revokeObjectURL(result.url);
    }
  }, [conversionResults]);

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <HandoffNotice notice={handoffNotice} onDismiss={clearHandoffNotice} />
        <ImageUploadSection
          files={selectedFiles}
          onFilesSelected={handleFilesSelected}
          onClearFiles={handleClearFiles}
          acceptedTypes={SUPPORTED_IMAGE_FORMATS.CONVERT_UPLOAD_FORMATS}
        />
        <ConversionSettings
          settings={conversionSettings}
          onSettingsChange={handleSettingsChange}
          onConvert={handleConvert}
          isConverting={isConverting}
          hasFiles={selectedFiles.length > 0}
        />
        <ProgressBar
          current={conversionProgress.current}
          total={conversionProgress.total}
          isVisible={isConverting}
        />
        <ConversionErrors failures={conversionFailures} />
        <ConversionResults
          results={conversionResults}
          originalFiles={selectedFiles}
          onClear={handleClearResults}
          handoffOrigin="convert"
        />
      </MainContent>
    </LayoutContainer>
  );
}
