import { useCallback, useEffect, useState } from "react";
import {
  type MetadataAnalysis,
  analyzeMetadata,
  removeMetadataFromFiles,
} from "../utils/metadataManager";

export interface UseMetadataManagerResult {
  analysis: MetadataAnalysis | null;
  isAnalyzing: boolean;
  isProcessing: boolean;
  selectedTags: Set<string>;
  progressCurrent: number;
  progressTotal: number;
  analyzeFiles: (files: File[]) => Promise<void>;
  toggleTag: (tag: string) => void;
  selectAllPrivacyTags: () => void;
  clearSelection: () => void;
  removeSelectedMetadata: () => Promise<File[]>;
}

export const useMetadataManager = (): UseMetadataManagerResult => {
  const [analysis, setAnalysis] = useState<MetadataAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // ファイルを分析する
  const analyzeFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsAnalyzing(true);
    try {
      const result = await analyzeMetadata(files);
      setAnalysis(result);
      // デフォルトでプライバシーリスクタグを選択
      setSelectedTags(new Set(result.privacyRiskTags));
    } catch (error) {
      console.error("Failed to analyze metadata:", error);
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
      );

      return cleanedFiles;
    } catch (error) {
      console.error("Failed to remove metadata:", error);
      return [];
    } finally {
      setIsProcessing(false);
      setProgressCurrent(0);
      setProgressTotal(0);
    }
  }, [analysis, selectedTags]);

  // ファイルが変更されたら分析をリセット
  useEffect(() => {
    return () => {
      setAnalysis(null);
      setSelectedTags(new Set());
    };
  }, []);

  return {
    analysis,
    isAnalyzing,
    isProcessing,
    selectedTags,
    progressCurrent,
    progressTotal,
    analyzeFiles,
    toggleTag,
    selectAllPrivacyTags,
    clearSelection,
    removeSelectedMetadata,
  };
};
