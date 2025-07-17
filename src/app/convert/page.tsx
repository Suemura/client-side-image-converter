"use client";

import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import {
  type ConversionResult,
  ImageConverter,
} from "../../utils/imageConverter";
import { ConversionResults } from "../../components/Results";
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
      targetFormat: "jpeg",
      quality: 90,
      maintainAspectRatio: true,
      preserveExif: false,
    });
  const [conversionResults, setConversionResults] = useState<
    ConversionResult[]
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

  const handleClearFiles = () => {
    setSelectedFiles([]);
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

    try {
      const results = await ImageConverter.convertMultipleImages(
        selectedFiles,
        {
          format: conversionSettings.targetFormat,
          quality: conversionSettings.quality,
          width: conversionSettings.width,
          height: conversionSettings.height,
          maintainAspectRatio: conversionSettings.maintainAspectRatio,
          preserveExif: conversionSettings.preserveExif,
        },
        (current, total) => {
          setConversionProgress({ current, total });
        },
      );

      setConversionResults(results);
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
    // URLの解放
    for (const result of conversionResults) {
      URL.revokeObjectURL(result.url);
    }
  }, [conversionResults]);

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <ImageUploadSection
          files={selectedFiles}
          onFilesSelected={handleFilesSelected}
          onClearFiles={handleClearFiles}
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
        <ConversionResults
          results={conversionResults}
          originalFiles={selectedFiles}
          onClear={handleClearResults}
        />
      </MainContent>
    </LayoutContainer>
  );
}
