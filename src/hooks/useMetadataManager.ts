import { useCallback, useEffect, useState } from "react";
import { detectC2pa } from "../utils/c2paBinary";
import type { C2paReadResult } from "../utils/c2paManager";
import { mapWithConcurrency } from "../utils/concurrency";
import {
  analyzeMetadata,
  type MetadataAnalysis,
  removeMetadataFromFiles,
} from "../utils/metadataManager";

/** GPS の処理方法: 削除 / 市区町村レベルに丸める */
export type GpsMode = "remove" | "round";

/**
 * C2PA 読み取り（WASM デコード）の同時実行数。
 * 大量バッチ（最大 200 件）に C2PA 埋め込みファイルが多数含まれても
 * WASM リーダーが一斉並行実行されメモリ・CPU 負荷が急増しないよう小さめに固定する。
 */
const C2PA_READ_CONCURRENCY = 3;

export interface UseMetadataManagerResult {
  analysis: MetadataAnalysis | null;
  isAnalyzing: boolean;
  isProcessing: boolean;
  selectedTags: Set<string>;
  gpsMode: GpsMode;
  progressCurrent: number;
  progressTotal: number;
  /**
   * C2PA（コンテンツ来歴）検出ファイルの読み取り結果。
   * File オブジェクト自体をキーにする（同名・同サイズのファイルが複数あっても
   * File インスタンスは別物として区別されるため、file.name をキーにする場合に
   * 起きる同名ファイルの上書き衝突を避けられる）
   */
  c2paResults: Map<File, C2paReadResult>;
  /** C2PA を除去対象にするか */
  removeC2pa: boolean;
  analyzeFiles: (files: File[]) => Promise<void>;
  toggleTag: (tag: string) => void;
  selectAllPrivacyTags: () => void;
  clearSelection: () => void;
  setGpsMode: (mode: GpsMode) => void;
  setRemoveC2pa: (remove: boolean) => void;
  removeSelectedMetadata: () => Promise<File[]>;
}

export const useMetadataManager = (): UseMetadataManagerResult => {
  const [analysis, setAnalysis] = useState<MetadataAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [gpsMode, setGpsMode] = useState<GpsMode>("remove");
  const [c2paResults, setC2paResults] = useState<Map<File, C2paReadResult>>(
    new Map(),
  );
  const [removeC2pa, setRemoveC2pa] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // C2PA（コンテンツ来歴）の検出と読み取り。
  // 検出は純粋バイナリスキャン（c2paBinary）で行い、1 件も無ければ
  // c2pa-web（WASM 8MB 超）を含む c2paManager をロードしない。
  // 検出ゲートによりリモート参照のみの画像も c2pa-web に渡さない（外部通信なし）
  const analyzeC2pa = useCallback(
    async (files: File[]): Promise<Map<File, C2paReadResult>> => {
      const detected: File[] = [];
      for (const file of files) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (detectC2pa(bytes, file.type)) {
            detected.push(file);
          }
        } catch {
          // 読み取り失敗は「C2PA なし」として扱う
        }
      }
      const results = new Map<File, C2paReadResult>();
      if (detected.length === 0) {
        return results;
      }
      const { readC2paSummary } = await import("../utils/c2paManager");
      // 同時実行数を制限して WASM リーダーの一斉並行実行によるメモリ・CPU 負荷急増を防ぐ
      const settled = await mapWithConcurrency(
        detected,
        C2PA_READ_CONCURRENCY,
        (file) => readC2paSummary(file),
      );
      settled.forEach((result, index) => {
        // readC2paSummary は内部で fail-closed するため常に ok のはずだが、
        // 万一 reject した場合は「結果なし」として扱う（対象ファイルは検出済みのまま残る）
        if (result.ok) {
          results.set(detected[index], result.value);
        }
      });
      return results;
    },
    [],
  );

  // ファイルを分析する
  const analyzeFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsAnalyzing(true);
      try {
        const [result, c2pa] = await Promise.all([
          analyzeMetadata(files),
          analyzeC2pa(files),
        ]);
        setAnalysis(result);
        setC2paResults(c2pa);
        // デフォルトでプライバシーリスクタグを選択（C2PA の除去はオプトイン）
        setSelectedTags(new Set(result.privacyRiskTags));
        setRemoveC2pa(false);
      } catch (error) {
        console.error("Failed to analyze metadata:", error);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [analyzeC2pa],
  );

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
    setRemoveC2pa(false);
  }, []);

  // 選択されたメタデータ（EXIF タグ / C2PA）を削除
  const removeSelectedMetadata = useCallback(async (): Promise<File[]> => {
    if (!analysis || (selectedTags.size === 0 && !removeC2pa)) {
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
        // GPS 丸めモードでは JPEG の GPS を削除せず精度を落とす
        { roundGpsInsteadOfRemove: gpsMode === "round", removeC2pa },
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
  }, [analysis, selectedTags, gpsMode, removeC2pa]);

  // ファイルが変更されたら分析をリセット
  useEffect(() => {
    return () => {
      setAnalysis(null);
      setSelectedTags(new Set());
      setC2paResults(new Map());
      setRemoveC2pa(false);
    };
  }, []);

  return {
    analysis,
    isAnalyzing,
    isProcessing,
    selectedTags,
    gpsMode,
    progressCurrent,
    progressTotal,
    c2paResults,
    removeC2pa,
    analyzeFiles,
    toggleTag,
    selectAllPrivacyTags,
    clearSelection,
    setGpsMode,
    setRemoveC2pa,
    removeSelectedMetadata,
  };
};
