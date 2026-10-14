import { useEffect, useRef } from "react";
import { getFilesFromClipboardData } from "../utils/fileUtils";

/**
 * ページ全体で Ctrl/Cmd+V による画像貼り付けを受け取るフック。
 * paste イベントの clipboardData からファイルを取り出し、1 つ以上あれば
 * デフォルトの貼り付け動作を抑止してコールバックに渡す（スクリーンショット → 即取込）。
 * 取り出したファイルは呼び出し側で MIME フィルタ・重複除外を通す想定。
 * @param onFiles - 取り込んだファイルを受け取るコールバック
 */
export const usePasteImages = (onFiles: (files: File[]) => void): void => {
  // 最新のコールバックを ref に保持し、購読は 1 回だけにする
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent): void => {
      const files = getFilesFromClipboardData(event.clipboardData);
      // ファイルが無い場合（テキスト貼り付け等）はデフォルト動作を妨げない
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      onFilesRef.current(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, []);
};
