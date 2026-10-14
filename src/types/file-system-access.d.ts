/**
 * File System Access API のうち TypeScript の lib.dom に含まれない部分の型定義。
 * showDirectoryPicker は WICG 仕様（Chromium 系のみ実装）のため lib.dom 未収録。
 * FileSystemDirectoryHandle の非同期イテレーターも同様に補完する。
 */

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?:
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

interface Window {
  showDirectoryPicker?: (
    options?: DirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}
