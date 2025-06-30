"use client";

import React, { useState, useCallback } from "react";
import { ConversionResults } from "../../components/ConversionResults";
import {
  ConversionSettings,
  type ConversionSettings as ConversionSettingsType,
} from "../../components/ConversionSettings";
import { Header } from "../../components/Header";
import { ImageUploadSection } from "../../components/ImageUploadSection";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { ProgressBar } from "../../components/ProgressBar";
import {
  type ConversionResult,
  ImageConverter,
} from "../../utils/imageConverter";

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [conversionSettings, setConversionSettings] =
    useState<ConversionSettingsType>({
      targetFormat: "jpeg",
      quality: 90,
      maintainAspectRatio: true,
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
      alert("Please select files to convert");
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
        },
        (current, total) => {
          setConversionProgress({ current, total });
        },
      );

      setConversionResults(results);
    } catch (error) {
      console.error("Conversion error:", error);
      alert("変換中にエラーが発生しました。");
    } finally {
      setIsConverting(false);
      setConversionProgress({ current: 0, total: 0 });
    }
  }, [selectedFiles, conversionSettings]);

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
          onClear={handleClearResults}
        />
      </MainContent>
    </LayoutContainer>
  );
}
