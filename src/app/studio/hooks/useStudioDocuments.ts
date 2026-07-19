"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  MAX_INPUT_FILES,
  SUPPORTED_IMAGE_FORMATS,
} from "../../../utils/constants";
import {
  addUniqueFilesWithLimit,
  filterValidFiles,
} from "../../../utils/fileUtils";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  type StudioDocument,
  type StudioHistory,
  undoHistory,
} from "../../../utils/studioCore";

/** useStudioDocuments の返却値 */
export interface StudioDocuments {
  /** 現在のドキュメント一覧（履歴の present） */
  documents: StudioDocument[];
  /** 各ドキュメントの currentFile 一覧（各ツールの files 入力に使う） */
  files: File[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  /** ファイルを追加する（MIME フィルタ・重複除外・上限件数）。追加があれば履歴へ積む */
  addFiles: (rawFiles: File[]) => void;
  /** 上限超過で一部を取り込めなかったか（直近の追加操作） */
  limitExceeded: boolean;
  /** 指定インデックスの currentFile を差し替えて履歴へ積む（破壊的適用の反映） */
  replaceFiles: (updates: ReadonlyMap<number, File>) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const EMPTY_DOCUMENTS: StudioDocument[] = [];

/**
 * ワークスペースのドキュメント一覧と undo / redo 履歴を管理するフック。
 * 履歴のスナップショットは StudioDocument[]（File は参照保持のため軽量）。
 */
export function useStudioDocuments(): StudioDocuments {
  const [history, setHistory] = useState<StudioHistory<StudioDocument[]>>(() =>
    createHistory(EMPTY_DOCUMENTS),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [limitExceeded, setLimitExceeded] = useState(false);
  // ドキュメント id の採番（ファイル差し替え後も不変な識別子）
  const nextDocIdRef = useRef(1);

  const documents = history.present;
  const files = useMemo(
    () => documents.map((doc) => doc.currentFile),
    [documents],
  );

  const addFiles = useCallback((rawFiles: File[]) => {
    const validFiles = filterValidFiles(
      rawFiles,
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    );
    setHistory((prev) => {
      const current = prev.present;
      const currentFiles = current.map((doc) => doc.currentFile);
      // 重複ファイルを除外（ファイル名とサイズで判定）し、上限件数まで切り詰める
      const { files: mergedFiles, truncated } = addUniqueFilesWithLimit(
        currentFiles,
        validFiles,
        MAX_INPUT_FILES,
      );
      if (mergedFiles.length === currentFiles.length) {
        setLimitExceeded(truncated);
        return prev;
      }
      const appended = mergedFiles
        .slice(currentFiles.length)
        .map((file): StudioDocument => {
          const id = `doc-${nextDocIdRef.current}`;
          nextDocIdRef.current += 1;
          return { id, originalFile: file, currentFile: file };
        });
      setLimitExceeded(truncated);
      return pushHistory(prev, [...current, ...appended]).history;
    });
  }, []);

  const replaceFiles = useCallback((updates: ReadonlyMap<number, File>) => {
    if (updates.size === 0) {
      return;
    }
    setHistory((prev) => {
      const next = prev.present.map((doc, index) => {
        const file = updates.get(index);
        return file ? { ...doc, currentFile: file } : doc;
      });
      return pushHistory(prev, next).history;
    });
  }, []);

  const clampSelection = useCallback((docs: StudioDocument[]) => {
    setSelectedIndex((prev) =>
      docs.length === 0 ? 0 : Math.min(prev, docs.length - 1),
    );
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      const next = undoHistory(prev);
      clampSelection(next.present);
      return next;
    });
  }, [clampSelection]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      const next = redoHistory(prev);
      clampSelection(next.present);
      return next;
    });
  }, [clampSelection]);

  return {
    documents,
    files,
    selectedIndex,
    setSelectedIndex,
    addFiles,
    limitExceeded,
    replaceFiles,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    undo,
    redo,
  };
}
