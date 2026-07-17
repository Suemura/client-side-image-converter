import type { DownloadableResult } from "./fileDownloader";
import { extractWritableEntries, planFolderWrites } from "./folderExportCore";

/** フォルダ保存の結果（cancelled はユーザーによる picker キャンセル。エラー扱いしない） */
export type FolderSaveOutcome =
  | { status: "saved"; writtenCount: number }
  | { status: "no-entries" }
  | { status: "cancelled" }
  | { status: "error"; writtenCount: number; totalCount: number };

/**
 * File System Access API（showDirectoryPicker）が利用可能かを判定する。
 * Chromium 系ブラウザのみ実装されている。SSG / hydration 差異を避けるため、
 * 呼び出し側は useEffect 内で実行して state 経由で描画に反映すること。
 */
export const isFolderSaveSupported = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.showDirectoryPicker === "function";

/**
 * 結果一覧をユーザーが選択したローカルフォルダへ直接書き込む。
 * ディレクトリハンドルは永続化せず、この関数のスコープ内でのみ使用する
 * （プライバシー原則: 書き込み先はユーザーが明示的に許可したフォルダのみ・セッション限り）。
 * 同名ファイルは上書きせず、ZIP / ハンドオフと同一規則の連番で一意化する。
 * @param results - 変換結果またはトリミング結果の一覧
 * @returns 保存結果（キャンセル・部分書き込みエラーを含む）
 */
export const saveResultsToFolder = async (
  results: DownloadableResult[],
): Promise<FolderSaveOutcome> => {
  const entries = extractWritableEntries(results);
  if (entries.length === 0 || !window.showDirectoryPicker) {
    // 保存対象（成功結果）が 0 件、または API 未対応の場合は picker を開かず終了する。
    // 「保存しました」と誤認させないよう、成功系の status とは分離する。
    return { status: "no-entries" };
  }

  // picker のキャンセル（AbortError）は正常系として扱う
  let directoryHandle: FileSystemDirectoryHandle;
  try {
    directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "cancelled" };
    }
    throw error;
  }

  // フォルダ内の既存ファイル名を列挙し、衝突時の自動連番のシードにする
  const existingNames: string[] = [];
  for await (const name of directoryHandle.keys()) {
    existingNames.push(name);
  }

  const plan = planFolderWrites(entries, existingNames);
  let writtenCount = 0;
  try {
    for (const { targetName, blob } of plan) {
      const fileHandle = await directoryHandle.getFileHandle(targetName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      writtenCount += 1;
    }
  } catch (error) {
    // ディスク満杯・権限剥奪等。書き込み済み件数を保持して UI へ伝える
    // （非破壊の連番方式のため、再実行しても既存ファイルは壊れない）
    console.error("フォルダへの保存に失敗しました:", error);
    return { status: "error", writtenCount, totalCount: plan.length };
  }

  return { status: "saved", writtenCount };
};
