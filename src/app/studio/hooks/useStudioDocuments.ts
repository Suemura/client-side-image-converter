"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  MAX_INPUT_FILES,
  SUPPORTED_IMAGE_FORMATS,
} from "../../../utils/constants";
import {
  canRedoEditHistory,
  canUndoEditHistory,
  createEditHistory,
  currentEditState,
  type EditHistoryStack,
  jumpEditHistory,
  pushEditHistory,
  redoEditHistory,
  undoEditHistory,
} from "../../../utils/editHistory";
import {
  addUniqueFilesWithLimit,
  filterValidFiles,
} from "../../../utils/fileUtils";
import type {
  StudioDocument,
  StudioHistoryLabel,
} from "../../../utils/studioCore";

/** 履歴パネルへ渡す 1 行分の表示データ */
export interface StudioHistoryEntry {
  label: StudioHistoryLabel;
  timestamp: number;
}

/** useStudioDocuments の返却値 */
export interface StudioDocuments {
  /** 現在のドキュメント一覧（履歴の現在位置） */
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
  replaceFiles: (
    updates: ReadonlyMap<number, File>,
    label: StudioHistoryLabel,
  ) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** 履歴パネルの表示行（古い順。先頭は「元画像を読み込み」） */
  historyEntries: StudioHistoryEntry[];
  /** 履歴上の現在位置（historyEntries のインデックス） */
  historyIndex: number;
  /** 任意の履歴位置へ移動する（後方は破棄せず redo 可能のまま） */
  jumpToHistory: (index: number) => void;
  /** 履歴を全破棄して各画像を元画像の状態に戻す */
  clearHistory: () => void;
}

const EMPTY_DOCUMENTS: StudioDocument[] = [];

type DocumentHistory = EditHistoryStack<StudioDocument[], StudioHistoryLabel>;

/**
 * ワークスペースのドキュメント一覧とツール横断の編集履歴を管理するフック。
 * 履歴のスナップショットは StudioDocument[]（File は参照保持のため軽量。
 * AI 処理の結果も File としてノードに残るため、履歴復帰で再推論は発生しない）。
 * 上部バーの undo / redo と履歴パネルは同一スタックを共有する。
 */
export function useStudioDocuments(): StudioDocuments {
  // 最初のファイル投入で baseline（元画像を読み込み）を作る。それまでは null
  const [history, setHistory] = useState<DocumentHistory | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [limitExceeded, setLimitExceeded] = useState(false);
  // ドキュメント id の採番（ファイル差し替え後も不変な識別子）
  const nextDocIdRef = useRef(1);

  const documents = history ? currentEditState(history) : EMPTY_DOCUMENTS;
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
      const current = prev ? currentEditState(prev) : EMPTY_DOCUMENTS;
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
      const next = [...current, ...appended];
      if (prev === null) {
        // 最初の投入は baseline（元画像を読み込み）
        return createEditHistory(next, { key: "load" }, Date.now());
      }
      return pushEditHistory(
        prev,
        next,
        { key: "add", params: { count: appended.length } },
        Date.now(),
      ).stack;
    });
  }, []);

  const replaceFiles = useCallback(
    (updates: ReadonlyMap<number, File>, label: StudioHistoryLabel) => {
      if (updates.size === 0) {
        return;
      }
      setHistory((prev) => {
        if (prev === null) {
          return prev;
        }
        const next = currentEditState(prev).map((doc, index) => {
          const file = updates.get(index);
          return file ? { ...doc, currentFile: file } : doc;
        });
        return pushEditHistory(prev, next, label, Date.now()).stack;
      });
    },
    [],
  );

  const clampSelection = useCallback((docs: StudioDocument[]) => {
    setSelectedIndex((prev) =>
      docs.length === 0 ? 0 : Math.min(prev, docs.length - 1),
    );
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev === null) {
        return prev;
      }
      const next = undoEditHistory(prev);
      clampSelection(currentEditState(next));
      return next;
    });
  }, [clampSelection]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev === null) {
        return prev;
      }
      const next = redoEditHistory(prev);
      clampSelection(currentEditState(next));
      return next;
    });
  }, [clampSelection]);

  const jumpToHistory = useCallback(
    (index: number) => {
      setHistory((prev) => {
        if (prev === null) {
          return prev;
        }
        const next = jumpEditHistory(prev, index);
        clampSelection(currentEditState(next));
        return next;
      });
    },
    [clampSelection],
  );

  const clearHistory = useCallback(() => {
    setHistory((prev) => {
      if (prev === null) {
        return prev;
      }
      // 現在のドキュメント構成を保ったまま、各画像を元画像へ戻して履歴を作り直す
      const reset = currentEditState(prev).map((doc) => ({
        ...doc,
        currentFile: doc.originalFile,
      }));
      clampSelection(reset);
      return createEditHistory(reset, { key: "load" }, Date.now());
    });
  }, [clampSelection]);

  const historyEntries = useMemo<StudioHistoryEntry[]>(
    () =>
      history
        ? history.nodes.map((node) => ({
            label: node.label,
            timestamp: node.timestamp,
          }))
        : [],
    [history],
  );

  return {
    documents,
    files,
    selectedIndex,
    setSelectedIndex,
    addFiles,
    limitExceeded,
    replaceFiles,
    canUndo: history ? canUndoEditHistory(history) : false,
    canRedo: history ? canRedoEditHistory(history) : false,
    undo,
    redo,
    historyEntries,
    historyIndex: history?.index ?? 0,
    jumpToHistory,
    clearHistory,
  };
}
