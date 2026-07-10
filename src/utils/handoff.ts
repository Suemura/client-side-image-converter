/**
 * ツール連携（ハンドオフ）の純粋ロジック。
 * あるツールの処理結果（File[]）をダウンロードせずに別ツールへ引き継ぐための
 * ツールメタ定義・送り先候補の算出・結果→File[] 変換・consume-once ストアを提供する。
 * Canvas / DOM 非依存で単体テスト対象（React への配線は contexts/HandoffContext.tsx）。
 */

import { SUPPORTED_IMAGE_FORMATS } from "./constants";
import type { ConversionResult } from "./conversionCore";
import type { CropResult } from "./imageCropper";

/** ツール識別子（ハンドオフの送り元・送り先） */
export type ToolId = "convert" | "crop" | "edit" | "metadata";

/** ツールのメタ定義。ハンドオフと Navigation で共有する単一の真実 */
export interface HandoffTool {
  id: ToolId;
  /** next/link で遷移するパス（Navigation と同じ末尾スラッシュなし形式） */
  path: string;
  /** ナビゲーション・送り先メニューで表示するラベルの i18n キー */
  labelKey: string;
  /** このツールが入力として受理できる MIME タイプ */
  acceptedTypes: readonly string[];
  /**
   * ハンドオフの送り先（受け取り側の配線済みページ）として有効か。
   * Phase 1（Issue #70）は convert / crop のみ。metadata は Phase 2（#71）、
   * edit は Phase 3（#72）で受け取り配線とともに有効化する。
   */
  canReceiveHandoff: boolean;
}

/**
 * 全ツールのメタ定義（Navigation の表示順に並べる）。
 * acceptedTypes は各ページが FileUploadArea に渡している受理形式と同じ定数を参照し、
 * 送り先候補の判定と実際の取り込みフィルタが乖離しないようにする。
 */
export const HANDOFF_TOOLS: readonly HandoffTool[] = [
  {
    id: "crop",
    path: "/crop",
    labelKey: "navigation.crop",
    acceptedTypes: SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    canReceiveHandoff: true,
  },
  {
    id: "convert",
    path: "/convert",
    labelKey: "navigation.convert",
    acceptedTypes: SUPPORTED_IMAGE_FORMATS.CONVERT_UPLOAD_FORMATS,
    canReceiveHandoff: true,
  },
  {
    id: "edit",
    path: "/edit",
    labelKey: "navigation.edit",
    acceptedTypes: SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    canReceiveHandoff: false,
  },
  {
    id: "metadata",
    path: "/metadata",
    labelKey: "navigation.metadata",
    acceptedTypes: SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    canReceiveHandoff: false,
  },
];

/** id からツールメタを引く（未知の id は undefined） */
export const findHandoffTool = (id: ToolId): HandoffTool | undefined =>
  HANDOFF_TOOLS.find((tool) => tool.id === id);

/**
 * ハンドオフの送り先候補を算出する。
 * - 送り元自身は除外する
 * - 受け取り未配線（canReceiveHandoff: false）のツールは除外する
 * - 結果の全 MIME タイプを受理できるツールだけを返す（一部しか受理できない
 *   ツールへ送って黙って欠落させない。混在バッチは全形式対応の送り先のみ）
 * @param origin - 送り元ツールの id
 * @param resultMimeTypes - 結果ファイルの MIME タイプ一覧（重複可・空なら候補なし）
 */
export const resolveHandoffTargets = (
  origin: ToolId,
  resultMimeTypes: readonly string[],
): HandoffTool[] => {
  if (resultMimeTypes.length === 0) {
    return [];
  }
  return HANDOFF_TOOLS.filter(
    (tool) =>
      tool.id !== origin &&
      tool.canReceiveHandoff &&
      resultMimeTypes.every((mime) => tool.acceptedTypes.includes(mime)),
  );
};

/**
 * ファイル名の同名衝突を ZIP ダウンロード（downloadAsZip）と同じ規則で一意化する。
 * 初出はそのまま、2 件目以降は拡張子の前に `_2`, `_3`, ... を付ける。
 */
const uniquifyFileNames = (entries: { name: string; blob: Blob }[]): File[] => {
  const nameCounts = new Map<string, number>();
  return entries.map(({ name, blob }) => {
    let filename = name;
    if (nameCounts.has(filename)) {
      const count = (nameCounts.get(filename) || 0) + 1;
      nameCounts.set(filename, count);
      const nameWithoutExt =
        filename.substring(0, filename.lastIndexOf(".")) || filename;
      const extension = filename.substring(filename.lastIndexOf(".")) || "";
      filename = `${nameWithoutExt}_${count}${extension}`;
    } else {
      nameCounts.set(filename, 1);
    }
    return new File([blob], filename, { type: blob.type });
  });
};

/**
 * 変換結果をハンドオフ用の File[] に変換する。
 * MIME タイプは実際にエンコードされた blob.type を使う。
 */
export const conversionResultsToFiles = (
  results: readonly ConversionResult[],
): File[] =>
  uniquifyFileNames(
    results.map((result) => ({ name: result.filename, blob: result.blob })),
  );

/**
 * トリミング結果をハンドオフ用の File[] に変換する（失敗結果はスキップ）。
 * croppedFile.type は元ファイルの MIME を機械的に引き継いでおり、canvas.toBlob が
 * 非対応形式（BMP 等）で PNG にフォールバックした場合に実体と食い違うため、
 * 実際のエンコード結果を反映する croppedBlob から File を作り直す。
 */
export const cropResultsToFiles = (results: readonly CropResult[]): File[] =>
  uniquifyFileNames(
    results
      .filter((result) => result.success)
      .map((result) => ({ name: result.fileName, blob: result.croppedBlob })),
  );

/** ページ間で引き継ぐペイロード。File 実体のみを保持する（ObjectURL は持たない） */
export interface HandoffPayload {
  files: File[];
  /** 送り元ツール（到着バナーの文言に使う） */
  origin: ToolId;
  /** 送出時刻（遷移の同一性判定用） */
  sentAt: number;
}

/** ペイロード置き場（HandoffContext がモジュールスコープに 1 つだけ保持する） */
export interface HandoffStore {
  /** ペイロードを送出する。fromPathname は送出元ページのパス名（自己配送の防止に使う） */
  send: (payload: HandoffPayload, fromPathname: string) => void;
  /**
   * 現在のパス名でペイロードを受け取る。
   * 最初に受け取ったパス名（到着ページ）の間は同じペイロードを何度でも返し、
   * 送出元ページには配送せず、到着後に別のパス名から呼ばれた時点で破棄する。
   */
  consume: (pathname: string) => HandoffPayload | null;
  /** ナビゲーションのたびに呼び、到着ページ以外へ移動していたらペイロードを破棄する */
  onNavigate: (pathname: string) => void;
}

/**
 * 「1 回のナビゲーションだけ生存する」ペイロードストアを生成する。
 * 即時クリアの consume-once にしないのは、Next.js App Router のクライアント遷移では
 * タイミングにより遷移先ページ（またはルートレイアウトごと）が二重マウントされることが
 * あり、破棄される側のマウントが先に consume するとペイロードを取りこぼすため。
 * - 到着ページ（最初に consume したパス名）の間は冪等に同じペイロードを返す
 * - 送出元ページからの consume には配送しない（送出直後に送出元が再マウントされても
 *   誤って到着扱いにしない）
 * - 到着後に別パス名から consume / onNavigate された時点で破棄する
 *   （戻る操作などでの二重取り込みは起きない）
 */
export const createHandoffStore = (): HandoffStore => {
  let payload: HandoffPayload | null = null;
  // 送出元ページのパス名（このパス名からの consume には配送しない）
  let sentFromPathname: string | null = null;
  // ペイロードを最初に consume したパス名（= 到着ページ）。未到着は null
  let arrivedPathname: string | null = null;

  const clear = (): void => {
    payload = null;
    sentFromPathname = null;
    arrivedPathname = null;
  };

  return {
    send: (next: HandoffPayload, fromPathname: string): void => {
      payload = next;
      sentFromPathname = fromPathname;
      arrivedPathname = null;
    },
    consume: (pathname: string): HandoffPayload | null => {
      if (!payload) {
        return null;
      }
      if (arrivedPathname !== null) {
        if (arrivedPathname === pathname) {
          // 到着ページ内の再取得（二重マウント）には同じペイロードを返す
          return payload;
        }
        // 到着ページとは別のページからの取得要求 = 2 度目以降のナビゲーション。
        // 二重取り込みを防ぐためここで破棄する
        clear();
        return null;
      }
      if (pathname === sentFromPathname) {
        // 送出元ページ（遷移中に再マウントされた場合など）には配送しない
        return null;
      }
      arrivedPathname = pathname;
      return payload;
    },
    onNavigate: (pathname: string): void => {
      // 到着済みペイロードを残したまま受け取り側のないページへ移動した場合の破棄。
      // 未到着（送出直後の遷移中）は消さない
      if (payload && arrivedPathname !== null && arrivedPathname !== pathname) {
        clear();
      }
    },
  };
};
