/**
 * 画像最適化（フォーマット維持の再圧縮・可逆最適化）のブラウザ側オーケストレーション（Issue #61）
 *
 * `avifEncoder.ts` と同じく `@jsquash/*` を動的 import し、`file.type` から適切なエンジンへ
 * ディスパッチする。Canvas / DOM に非依存（jsquash は WASM + ImageData で完結する）ため、
 * メインスレッドと Web Worker の双方から呼べる（Worker バンドルへの Canvas コード混入を防ぐ）。
 *
 * エンジン:
 * - PNG  → @jsquash/oxipng   … バイト列→バイト列の真の可逆最適化（ピクセル不変・デコード不要）
 * - JPEG → @jsquash/jpeg     … mozjpeg で progressive + trellis の高品質再エンコード（実質劣化最小）
 * - WebP → @jsquash/webp     … ロスレス入力はロスレス再エンコード、ロッシー入力は高品質ロッシー再エンコード
 *
 * いずれも「最適化後が元より大きくなったら元をそのまま採用」する（no-worse-than-original 保証）。
 */

import type { ConversionResult } from "./conversionCore";
import { buildOptimizeResult } from "./conversionResult";
import { extractWebpExif } from "./exifBinary";
import {
  detectWebpEncoding,
  pickSmallerSize,
  resolveOptimizeEngine,
} from "./optimizeCore";

/**
 * JPEG 再エンコードの既定品質（高め）。再エンコードは不可逆のため、
 * 実質劣化最小となるよう高めに設定する（元品質が低い画像では膨らみうるが
 * no-worse-than-original 判定で元が採用される）。
 */
const JPEG_OPTIMIZE_QUALITY = 82;

/** ロッシー WebP 再エンコードの既定品質（JPEG と同様に高め） */
const WEBP_OPTIMIZE_QUALITY = 82;

/**
 * oxipng の最適化レベル（0-6）。2 は速度と圧縮率のバランスが良い既定的な値。
 * 可逆最適化のためレベルを上げても画質には影響しない（時間対効果のみ）。
 */
const OXIPNG_LEVEL = 2;

/** 最適化結果。`optimized` は最適化版が採用されたか（false は元を採用） */
export interface OptimizeBufferResult {
  buffer: ArrayBuffer;
  mime: string;
  optimized: boolean;
}

/**
 * バッファを同一フォーマットのまま最適化する（Canvas 非依存。メインスレッド / Worker 共用）。
 *
 * 最適化に対応するのは PNG / JPEG / WebP のみ。対応外の形式（BMP / TIFF / HEIC / AVIF 等、
 * 同一形式のまま再圧縮できないもの）は throw し、呼び出し側で失敗として通知する。
 * 対応形式でも最適化後が元以上なら元を採用する（no-worse-than-original）。
 *
 * 注: jsquash の各コーデックは入力 ArrayBuffer を WASM ヒープへコピーして読むだけで
 * デタッチしない。そのため元採用時に `buffer` をそのまま返しても安全で、防御的コピー
 * （大量バッチでのメモリ圧迫要因）は設けていない。
 *
 * @param buffer - 入力画像のバイト列
 * @param mimeType - 入力の MIME タイプ（ディスパッチに使用）
 */
export const optimizeImageBuffer = async (
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<OptimizeBufferResult> => {
  const engine = resolveOptimizeEngine(mimeType);
  if (!engine) {
    // 対応外（BMP / TIFF / HEIC / AVIF 等）は同一形式のまま最適化できないため失敗させる
    throw new Error(`最適化に対応していない形式です: ${mimeType || "unknown"}`);
  }

  // no-worse-than-original 判定に使う元サイズを、エンコード呼び出し前に控えておく
  const originalSize = buffer.byteLength;
  let candidate: ArrayBuffer;
  let mime: string;

  if (engine === "oxipng") {
    // index.js 経由だと不要なコードも取り込まれるため optimise モジュールを直接 import する
    const { default: optimise } = await import("@jsquash/oxipng/optimise.js");
    candidate = await optimise(buffer, { level: OXIPNG_LEVEL });
    mime = "image/png";
  } else if (engine === "mozjpeg") {
    const { default: decode } = await import("@jsquash/jpeg/decode.js");
    const { default: encode } = await import("@jsquash/jpeg/encode.js");
    // preserveOrientation: true で EXIF Orientation をピクセルへ焼き込む。
    // 再エンコード後の JPEG は EXIF（Orientation タグ含む）を持たないため、焼き込まないと
    // Orientation!=1 のスマホ写真が最適化後に 90° 回転して表示されてしまう（WYSIWYG 化）。
    const imageData = await decode(buffer, { preserveOrientation: true });
    candidate = await encode(imageData, {
      quality: JPEG_OPTIMIZE_QUALITY,
      progressive: true,
      optimize_coding: true,
      // trellis 量子化で圧縮効率を高める（画質を保ちつつサイズを削る）
      trellis_multipass: true,
    });
    mime = "image/jpeg";
  } else {
    // webp: @jsquash/webp/decode には JPEG の preserveOrientation 相当が無く、EXIF Orientation を
    // 補正できない。かつ再エンコードで EXIF は失われる。そのため EXIF を持つ WebP は最適化せず
    // 元を採用し、Orientation!=1 の WebP が回転して表示される・メタデータが黙って失われるのを防ぐ
    // （EXIF を持たない WebP のみ再圧縮する。JPEG は codec 側で焼き込めるため最適化する点と非対称だが、
    // それぞれ codec の能力に応じた安全側の選択）。
    if (extractWebpExif(new Uint8Array(buffer)) !== null) {
      return { buffer, mime: mimeType, optimized: false };
    }
    // 入力がロスレス(VP8L)ならロスレスで、そうでなければ高品質ロッシーで再エンコードする
    const { default: decode } = await import("@jsquash/webp/decode.js");
    const { default: encode } = await import("@jsquash/webp/encode.js");
    const encoding = detectWebpEncoding(new Uint8Array(buffer));
    const imageData = await decode(buffer);
    candidate =
      encoding === "lossless"
        ? await encode(imageData, { lossless: 1 })
        : await encode(imageData, { quality: WEBP_OPTIMIZE_QUALITY });
    mime = "image/webp";
  }

  if (pickSmallerSize(originalSize, candidate.byteLength) === "optimized") {
    return { buffer: candidate, mime, optimized: true };
  }
  // 最適化で削減できなかった: 元のバイト列・MIME をそのまま採用する
  return { buffer, mime: mimeType, optimized: false };
};

/**
 * 1 ファイルを最適化して `ConversionResult` を組み立てる（メインスレッド用）。
 *
 * OffscreenCanvas / Worker 非対応環境や Worker 個別失敗時のフォールバックとして
 * ワーカープールから注入される（`convertImage` の最適化版に相当）。
 */
export const optimizeImage = async (file: File): Promise<ConversionResult> => {
  const buffer = await file.arrayBuffer();
  const { buffer: outBuffer, mime } = await optimizeImageBuffer(
    buffer,
    file.type,
  );
  const blob = new Blob([outBuffer], { type: mime });
  return buildOptimizeResult(file, blob);
};
