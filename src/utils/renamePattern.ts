/**
 * 書き出し時のリネーム規則（パターン指定）の純粋ロジック（Issue #144）。
 *
 * `/studio` の書き出しダイアログで入力されたトークンパターン
 * （例: `{name}_{seq}_{width}px`）から出力ファイル名を組み立てる。
 * Canvas / DOM に依存しないため単体テスト対象（`__tests__/renamePattern.test.ts`）。
 */

/** サポートするトークンの一覧（UI のチップ表示にも使う） */
export const RENAME_TOKENS = [
  "{name}",
  "{seq}",
  "{width}",
  "{height}",
  "{date}",
] as const;

/** 1 ファイル分のトークン展開コンテキスト */
export interface RenameContext {
  /** 元ファイル名（拡張子除く） */
  name: string;
  /** 連番（1 起点） */
  seq: number;
  /** 書き出し対象の総枚数（連番のゼロ埋め桁数の決定に使う） */
  total: number;
  /** 出力画像の幅 px（リサイズ等適用後）。未確定時は undefined = トークンをリテラルのまま残す */
  width?: number;
  /** 出力画像の高さ px（リサイズ等適用後）。未確定時は undefined */
  height?: number;
  /** `{date}` に使う日付（EXIF 撮影日時優先・なければ書き出し日時） */
  date: Date;
}

/** OS 禁止文字（Windows / macOS / Linux の和集合）と制御文字 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字のサニタイズが目的
const FORBIDDEN_CHARS = /[/\\:*?"<>|\u0000-\u001f]/g;

/**
 * パターンが有効（空欄でない）かを判定する。空欄・空白のみは従来命名へフォールバックする。
 */
export const hasRenamePattern = (pattern: string): boolean =>
  pattern.trim().length > 0;

/** ファイル名から拡張子を除いたベース名を返す（拡張子がない場合はそのまま） */
export const stripExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
};

/**
 * OS 禁止文字を `_` に置換する。パス区切りやワイルドカードの混入を防ぐ
 * （ZIP 内エントリ・File System Access API の両方で安全な名前にする）。
 * Windows は末尾のドット・スペースも無効なため、それらも除去する
 * （例: `photo.` → `photo` / `photo ` → `photo`）。
 */
export const sanitizeFileName = (name: string): string =>
  name.replace(FORBIDDEN_CHARS, "_").replace(/[. ]+$/, "");

/**
 * `{seq}` のゼロ埋め桁数を返す。最低 2 桁、総枚数が 100 以上なら桁数を自動拡張する
 * （例: 総数 150 → 3 桁 = 001..150）。
 */
export const resolveSeqPadding = (total: number): number =>
  Math.max(2, String(Math.max(1, Math.floor(total))).length);

/** `{date}` 用に Date を `YYYYMMDD`（ローカル時刻）へ整形する */
export const formatDateYyyymmdd = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

/**
 * EXIF の日時文字列（`YYYY:MM:DD HH:MM:SS` 形式）を Date に変換する。
 * 解析できない・暦として不正な値は null を返す（呼び出し側が書き出し日時へフォールバック）。
 */
export const parseExifDateTime = (value: string): Date | null => {
  const match =
    /^(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
      value.trim(),
    );
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  // Date は不正値を繰り上げるため（例: 2024-13-40）、往復で一致するかを検証する
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/**
 * パターン内のトークンを展開する。未知のトークン（`{foo}` 等）はリテラルのまま残す。
 * `{width}` / `{height}` はコンテキスト未確定（undefined）の場合もリテラルのまま残す
 * （プレビューで寸法ロード前に表示が壊れないようにするため）。
 */
export const expandRenamePattern = (
  pattern: string,
  context: RenameContext,
): string => {
  const padding = resolveSeqPadding(context.total);
  return pattern.replace(/\{(name|seq|width|height|date)\}/g, (token, key) => {
    switch (key) {
      case "name":
        return context.name;
      case "seq":
        return String(context.seq).padStart(padding, "0");
      case "width":
        return context.width !== undefined ? String(context.width) : token;
      case "height":
        return context.height !== undefined ? String(context.height) : token;
      case "date":
        return formatDateYyyymmdd(context.date);
      default:
        return token;
    }
  });
};

/**
 * ベース名（拡張子なし）の衝突を ` (1)`, ` (2)`, … の付与で一意化する関数を生成する。
 * 呼び出しごとに採番状態を共有する（1 回の書き出しバッチ内で使い回す）。
 */
export const createRenameUniquifier = (): ((baseName: string) => string) => {
  const usedNames = new Set<string>();
  return (baseName: string): string => {
    if (!usedNames.has(baseName)) {
      usedNames.add(baseName);
      return baseName;
    }
    let counter = 1;
    let candidate = `${baseName} (${counter})`;
    while (usedNames.has(candidate)) {
      counter += 1;
      candidate = `${baseName} (${counter})`;
    }
    usedNames.add(candidate);
    return candidate;
  };
};

/**
 * パターンとコンテキスト一覧から出力ファイル名一覧を組み立てる（展開 → サニタイズ → 一意化 →
 * 拡張子付与）。拡張子は出力フォーマットから自動付与するためパターンには含めない。
 * 展開結果が空文字になった場合は元名へフォールバックする（無名ファイルを作らない）。
 *
 * @param pattern - リネーム規則（`hasRenamePattern` が true であること）
 * @param contexts - ファイルごとの展開コンテキスト（書き出し順）
 * @param extension - 付与する拡張子（ドットなし。例: "jpeg"）
 */
export const buildRenamedFileNames = (
  pattern: string,
  contexts: RenameContext[],
  extension: string,
): string[] => {
  const uniquify = createRenameUniquifier();
  return contexts.map((context) => {
    const expanded = sanitizeFileName(
      expandRenamePattern(pattern, context),
    ).trim();
    const base =
      expanded.length > 0 ? expanded : sanitizeFileName(context.name);
    return `${uniquify(base)}.${extension}`;
  });
};
