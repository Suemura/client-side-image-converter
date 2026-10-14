import type { DownloadableResult } from "./fileDownloader";
import { createFileNameUniquifier } from "./fileName";

/** フォルダへ書き込む 1 ファイル分の入力（結果から取り出した名前と Blob） */
export interface WritableEntry {
  name: string;
  blob: Blob;
}

/** 書き込み計画の 1 エントリ（衝突解決済みの出力ファイル名と Blob） */
export interface FolderWritePlanEntry {
  targetName: string;
  blob: Blob;
}

/**
 * 結果一覧から書き込み対象（成功結果の名前と Blob）を取り出す。
 * 判別ロジックは ZIP ダウンロード（downloadAsZip）と同一で、失敗結果はスキップする。
 * @param results - 変換結果またはトリミング結果の一覧
 * @returns 書き込み対象のエントリ一覧
 */
export const extractWritableEntries = (
  results: DownloadableResult[],
): WritableEntry[] => {
  const entries: WritableEntry[] = [];
  for (const result of results) {
    if ("blob" in result) {
      // ConversionResult
      entries.push({ name: result.filename, blob: result.blob });
    } else if (result.success && "croppedBlob" in result) {
      // CropResult
      entries.push({ name: result.fileName, blob: result.croppedBlob });
    }
    // エラー結果はスキップ
  }
  return entries;
};

/**
 * 出力先フォルダへの書き込み計画を作成する。
 * フォルダ内の既存ファイル名を使用済みとしてシードした上で、ZIP / ハンドオフと
 * 同一の連番規則（createFileNameUniquifier）で出力ファイル名を一意化する。
 * 既存ファイルと衝突する入力は上書きせず `_2`, `_3`, ... の連番へ回る（非破壊）。
 * @param entries - 書き込み対象のエントリ一覧
 * @param existingNames - 出力先フォルダに既に存在するファイル名
 * @returns 衝突解決済みの書き込み計画
 */
export const planFolderWrites = (
  entries: WritableEntry[],
  existingNames: Iterable<string>,
): FolderWritePlanEntry[] => {
  const uniquify = createFileNameUniquifier(existingNames);
  return entries.map((entry) => ({
    targetName: uniquify(entry.name),
    blob: entry.blob,
  }));
};
