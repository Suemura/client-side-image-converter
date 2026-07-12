import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHandoff } from "../contexts/HandoffContext";
import { MAX_INPUT_FILES } from "../utils/constants";
import { addUniqueFilesWithLimit, filterValidFiles } from "../utils/fileUtils";
import type { ToolId } from "../utils/handoff";

/** 到着バナーの表示情報 */
export interface HandoffNoticeInfo {
  /** 送り元ツール */
  origin: ToolId;
  /** 実際に取り込んだ件数 */
  receivedCount: number;
  /** 受理形式外・重複・上限超過で取り込めなかった件数 */
  skippedCount: number;
}

/**
 * ハンドオフの受け取り側フック。
 * mount 時に共有ストアからペイロードを取り出し（到着ページの間は冪等・
 * 別ページへ移動した時点で破棄）、新規アップロードと同じフィルタ
 * （MIME・重複除外・MAX_INPUT_FILES 上限）を通してからページの投入経路
 * （onFilesReceived）へ流し込む。
 * @param acceptedTypes - ページの受理形式（FileUploadArea に渡すものと同じ定数）
 * @param onFilesReceived - フィルタ済み File[] を受け取るページ側の投入関数
 */
export const useHandoffReceiver = (
  acceptedTypes: readonly string[],
  onFilesReceived: (files: File[]) => void,
): { notice: HandoffNoticeInfo | null; clearNotice: () => void } => {
  const { consume } = useHandoff();
  const pathname = usePathname();
  const [notice, setNotice] = useState<HandoffNoticeInfo | null>(null);

  // 最新のコールバック・受理形式を ref に保持し、mount 時の消費は 1 回だけにする
  // （usePasteImages と同じパターン。二重取り込み防止はストア側でも保証される）
  const onFilesReceivedRef = useRef(onFilesReceived);
  onFilesReceivedRef.current = onFilesReceived;
  const acceptedTypesRef = useRef(acceptedTypes);
  acceptedTypesRef.current = acceptedTypes;

  useEffect(() => {
    const payload = consume(pathname);
    if (!payload || payload.files.length === 0) {
      return;
    }
    // 新規アップロードと同じ扱い: MIME フィルタ → 重複除外 + 上限切り詰め
    const validFiles = filterValidFiles(
      payload.files,
      acceptedTypesRef.current,
    );
    const { files } = addUniqueFilesWithLimit([], validFiles, MAX_INPUT_FILES);
    if (files.length > 0) {
      onFilesReceivedRef.current(files);
    }
    setNotice({
      origin: payload.origin,
      receivedCount: files.length,
      skippedCount: payload.files.length - files.length,
    });
  }, [consume, pathname]);

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  return { notice, clearNotice };
};
