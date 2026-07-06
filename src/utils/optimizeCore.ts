/**
 * 画像最適化のコア型と Canvas / WASM / DOM 非依存の純粋ロジック（Issue #61）
 *
 * メインスレッド（`imageOptimizer.ts` の `optimizeImage`）と Web Worker
 * （`imageProcessing.worker.ts` の optimize 分岐）の双方から共有するため、
 * ここには「形式→エンジンのディスパッチ」「サイズ比較（no-worse-than-original）」
 * 「WebP のロスレス/ロッシー判定」といった純粋関数だけを集約し、単体テスト対象とする
 * （`conversionCore.ts` と同じ方針）。
 */

/**
 * 最適化エンジン。形式ごとに使い分ける。
 * - "oxipng": PNG のバイト列→バイト列の真の可逆最適化（ピクセル不変・Canvas 不要）
 * - "mozjpeg": JPEG を progressive + trellis で高品質再エンコード（実質劣化最小）
 * - "webp": WebP を再エンコード（ロスレス入力はロスレス、ロッシー入力は高品質ロッシー）
 */
export type OptimizeEngine = "oxipng" | "mozjpeg" | "webp";

/** WebP のエンコード方式（ロスレス VP8L / ロッシー VP8 / 判定不能） */
export type WebpEncoding = "lossless" | "lossy" | "unknown";

/**
 * MIME タイプ → 最適化エンジンのディスパッチ表。
 * 一部ブラウザは JPEG に "image/jpg" を使うため両方を受ける。
 */
const OPTIMIZE_ENGINE_BY_MIME: Record<string, OptimizeEngine> = {
  "image/png": "oxipng",
  "image/jpeg": "mozjpeg",
  "image/jpg": "mozjpeg",
  "image/webp": "webp",
};

/**
 * MIME タイプから最適化エンジンを解決する。対応外（GIF / AVIF / TIFF / HEIC 等）は null。
 * 大文字小文字や末尾パラメータ（"image/jpeg; charset=..."）の揺れを吸収する。
 */
export const resolveOptimizeEngine = (
  mimeType: string,
): OptimizeEngine | null => {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return OPTIMIZE_ENGINE_BY_MIME[normalized] ?? null;
};

/** その MIME タイプが同一形式のまま最適化可能か */
export const isOptimizableType = (mimeType: string): boolean =>
  resolveOptimizeEngine(mimeType) !== null;

/**
 * no-worse-than-original 保証: 最適化後が元より小さいときだけ最適化版を採用する。
 * 同サイズ・元以上のときは元をそのまま採用する（可逆最適化で得がない場合や
 * 再エンコードで膨らんだ場合に、元を保持して劣化・肥大を防ぐ）。
 */
export const pickSmallerSize = (
  originalSize: number,
  optimizedSize: number,
): "original" | "optimized" =>
  optimizedSize < originalSize ? "optimized" : "original";

/**
 * WebP バイト列がロスレス（VP8L）かロッシー（VP8）かを RIFF ヘッダーから判定する。
 * 拡張フォーマット（VP8X）はサブチャンクを走査して VP8L / VP8 を探す。
 *
 * 判定できない場合（非 WebP・破損・未知チャンクのみ）は "unknown" を返す。
 * 呼び出し側は "lossless" のみロスレス再エンコードし、それ以外は高品質ロッシー再エンコードする。
 */
export const detectWebpEncoding = (bytes: Uint8Array): WebpEncoding => {
  // "RIFF"...."WEBP" + 先頭チャンクの fourcc まで最低 16 バイト必要
  if (bytes.length < 16) {
    return "unknown";
  }
  const fourccAt = (offset: number): string =>
    String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );

  if (fourccAt(0) !== "RIFF" || fourccAt(8) !== "WEBP") {
    return "unknown";
  }

  const firstChunk = fourccAt(12);
  if (firstChunk === "VP8L") {
    return "lossless";
  }
  if (firstChunk === "VP8 ") {
    return "lossy";
  }
  if (firstChunk === "VP8X") {
    // 拡張フォーマット: 12 バイト目以降のチャンク列を走査する
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunk = fourccAt(offset);
      const size = view.getUint32(offset + 4, true);
      if (chunk === "VP8L") {
        return "lossless";
      }
      if (chunk === "VP8 ") {
        return "lossy";
      }
      // チャンクデータは 2 バイト境界にパディングされる（奇数長なら +1）
      offset += 8 + size + (size % 2);
    }
  }
  return "unknown";
};
