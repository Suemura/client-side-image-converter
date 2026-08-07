"use client";

import { useEffect, useState } from "react";
import { renderOrientedImage } from "../../../utils/imageCropper";
import type { StudioDocument } from "../../../utils/studioCore";

/**
 * 長押し原画表示（#146）用に、選択中ドキュメントの元画像（originalFile =
 * 履歴スタック先頭・全編集適用前）の EXIF Orientation 補正済みキャンバスを保持するフック。
 *
 * - 未編集（originalFile === currentFile）の間はデコード済みの previewSource を
 *   そのまま流用し、二重デコードを避ける
 * - 編集済みの場合のみ元画像を選択切替時に 1 回デコードしてビットマップを保持する
 *   （長押しの切替時に再デコードを発生させない）
 */
export function useStudioOriginal(
  documents: StudioDocument[],
  selectedIndex: number,
  previewSource: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const doc = documents[selectedIndex] ?? null;
  const originalFile = doc?.originalFile ?? null;
  const needsDecode = doc !== null && doc.originalFile !== doc.currentFile;
  const [decoded, setDecoded] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 前のドキュメントの原画を残すと切替直後に誤った画像を表示するため必ず破棄する
    setDecoded(null);
    if (!needsDecode || !originalFile) {
      return;
    }
    let cancelled = false;
    renderOrientedImage(originalFile)
      .then((canvas) => {
        if (!cancelled) {
          setDecoded(canvas);
        }
      })
      .catch((error) => {
        console.error("Original preview generation failed:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [needsDecode, originalFile]);

  if (!doc) {
    return null;
  }
  return needsDecode ? decoded : previewSource;
}
