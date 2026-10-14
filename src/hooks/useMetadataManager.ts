import { useCallback, useEffect, useState } from "react";
import {
  analyzeMetadata,
  type MetadataAnalysis,
  removeMetadataFromFiles,
} from "../utils/metadataManager";

/** GPS の処理方法: 削除 / 市区町村レベルに丸める */
export type GpsMode = "remove" | "round";

export interface UseMetadataManagerResult {
  analysis: MetadataAnalysis | null;
  /** 解析全体が失敗した場合 true（個別ファイルの失敗は analysis.analysisFailures に入る） */
  analysisError: boolean;
  /** メタデータ削除処理全体が失敗した場合 true */
  removeError: boolean;
  isAnalyzing: boolean;
  isProcessing: boolean;
  selectedTags: Set<string>;
  gpsMode: GpsMode;
  progressCurrent: number;
  progressTotal: number;
  analyzeFiles: (files: File[]) => Promise<void>;
  toggleTag: (tag: string) => void;
  selectAllPrivacyTags: () => void;
  clearSelection: () => void;
  setGpsMode: (mode: GpsMode) => void;
  removeSelectedMetadata: () => Promise<File[]>;
}

export const useMetadataManager = (): UseMetadataManagerResult => {
  const [analysis, setAnalysis] = useState<MetadataAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [gpsMode, setGpsMode] = useState<GpsMode>("remove");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // ファイルを分析する
  const analyzeFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError(false);
    try {
      const result = await analyzeMetadata(files);
      setAnalysis(result);
      // デフォルトでプライバシーリスクタグを選択
      setSelectedTags(new Set(result.privacyRiskTags));
    } catch (error) {
      console.error("Failed to analyze metadata:", error);
      // 解析結果が何も出ない「無反応な失敗」を防ぐため UI へ通知する（Issue #118）
      setAnalysis(null);
      setAnalysisError(true);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // タグの選択状態をトグル
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) {
        newSet.delete(tag);
      } else {
        newSet.add(tag);
      }
      return newSet;
    });
  }, []);

  // すべてのプライバシーリスクタグを選択
  const selectAllPrivacyTags = useCallback(() => {
    if (analysis) {
      setSelectedTags(new Set(analysis.privacyRiskTags));
    }
  }, [analysis]);

  // 選択をクリア
  const clearSelection = useCallback(() => {
    setSelectedTags(new Set());
  }, []);

  // 選択されたメタデータを削除
  const removeSelectedMetadata = useCallback(async (): Promise<File[]> => {
    if (!analysis || selectedTags.size === 0) {
      return [];
    }

    setIsProcessing(true);
    setRemoveError(false);
    setProgressCurrent(0);
    setProgressTotal(analysis.fileMetadata.length);

    try {
      const files = analysis.fileMetadata.map((fm) => fm.file);
      const tagsToRemove = Array.from(selectedTags);

      const cleanedFiles = await removeMetadataFromFiles(
        files,
        tagsToRemove,
        (current, total) => {
          setProgressCurrent(current);
          setProgressTotal(total);
        },
        // GPS 丸めモードでは JPEG の GPS を削除せず精度を落とす
        { roundGpsInsteadOfRemove: gpsMode === "round" },
      );

      return cleanedFiles;
    } catch (error) {
      console.error("Failed to remove metadata:", error);
      setRemoveError(true);
      return [];
    } finally {
      setIsProcessing(false);
      setProgressCurrent(0);
      setProgressTotal(0);
    }
  }, [analysis, selectedTags, gpsMode]);

  // ファイルが変更されたら分析をリセット
  useEffect(() => {
    return () => {
      setAnalysis(null);
      setSelectedTags(new Set());
    };
  }, []);

  return {
    analysis,
    analysisError,
    removeError,
    isAnalyzing,
    isProcessing,
    selectedTags,
    gpsMode,
    progressCurrent,
    progressTotal,
    analyzeFiles,
    toggleTag,
    selectAllPrivacyTags,
    clearSelection,
    setGpsMode,
    removeSelectedMetadata,
  };
};
