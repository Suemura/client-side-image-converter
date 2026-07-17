/**
 * C2PA マニフェストの読み取り・署名検証のオーケストレーション。
 *
 * @contentauth/c2pa-web（WASM 8MB 超）は本モジュールごと動的 import される想定で、
 * 呼び出し側（useMetadataManager）は c2paBinary.detectC2pa で埋め込みを検出した
 * ファイルがあるときだけ本モジュールをロードする（初期バンドル非影響 + 無駄な
 * WASM ロード回避。加えてリモート参照のみの画像を c2pa-web に渡さないゲートとして
 * 機能し、マニフェスト取得の外部通信を発生させない。本番 CSP の
 * connect-src 'self' も外部 fetch を構造的に遮断する）。
 */

import type { C2paSummary } from "./c2paSummary";
import { summarizeManifestStore } from "./c2paSummary";

/** 1 ファイルの C2PA 読み取り結果 */
export type C2paReadResult =
  | { status: "summary"; summary: C2paSummary }
  /** 埋め込みは検出済みだが c2pa-web で解釈できなかった（破損・未対応形状） */
  | { status: "unreadable" };

/** WASM の配信 URL（scripts/copy-c2pa-wasm.ts が public/c2pa/ へ配置する） */
const WASM_SRC = "/c2pa/c2pa_bg.wasm";

type C2paSdk = Awaited<
  ReturnType<typeof import("@contentauth/c2pa-web").createC2pa>
>;

// SDK（WASM + worker）はセッション中 1 度だけ初期化して使い回す
let sdkPromise: Promise<C2paSdk> | null = null;

const getSdk = (): Promise<C2paSdk> => {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const { createC2pa } = await import("@contentauth/c2pa-web");
      return createC2pa({
        wasmSrc: WASM_SRC,
        settings: {
          // トラストリスト（信頼済み発行者一覧)は同梱していないため、トラスト照合は
          // 無効化して署名の暗号学的な有効性のみを検証する（有効化すると正当に署名
          // された画像まで untrusted 扱いになる。トラストリスト同梱はフォローアップ候補）
          verify: { verifyTrust: false },
        },
      });
    })();
    // 初期化失敗（WASM ロード失敗等）は次回呼び出しで再試行できるようにする
    sdkPromise.catch(() => {
      sdkPromise = null;
    });
  }
  return sdkPromise;
};

/**
 * ファイルの C2PA マニフェストを読み取り、表示用の要約を返す。
 * 呼び出し側で detectC2pa による検出を済ませている前提（検出済みファイル専用）。
 * 解釈できない場合は "unreadable" に fail-closed する（除去機能は影響を受けない）。
 */
export const readC2paSummary = async (file: File): Promise<C2paReadResult> => {
  try {
    const sdk = await getSdk();
    const reader = await sdk.reader.fromBlob(file.type, file);
    if (!reader) {
      return { status: "unreadable" };
    }
    try {
      const store = await reader.manifestStore();
      const summary = summarizeManifestStore(store);
      return summary
        ? { status: "summary", summary }
        : { status: "unreadable" };
    } finally {
      await reader.free();
    }
  } catch {
    // WASM ロード失敗・パース例外はすべて「解析不能」表示に落とす
    return { status: "unreadable" };
  }
};
