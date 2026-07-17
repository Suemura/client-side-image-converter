/**
 * C2PA マニフェストストア（c2pa-web の manifestStore() が返す JSON）を
 * 表示用モデルへ整形する純粋ロジック。
 *
 * c2pa-web は 0.x で JSON 形状の変動があり得るため、必要なフィールドだけを
 * 防御的な部分型として定義し、欠損・型不一致はすべて「不明」へ fail-closed する
 * （WASM やブラウザ API に依存しないため単体テスト対象）。
 */

/** 署名検証の結果状態 */
export type C2paSignatureState = "valid" | "invalid" | "unknown";

/** 編集履歴（c2pa.actions アサーション）の 1 アクション */
export interface C2paActionSummary {
  /** アクション識別子（例: c2pa.created / c2pa.edited） */
  action: string;
  /** アクションを実行したソフトウェア名（判明時のみ） */
  softwareAgent: string | null;
  /** IPTC digitalSourceType（判明時のみ） */
  digitalSourceType: string | null;
}

/** /metadata の「コンテンツ来歴」セクションが表示する要約 */
export interface C2paSummary {
  /** 署名証明書の発行者名 */
  issuer: string | null;
  /** マニフェストを生成したツール名（claim generator） */
  claimGenerator: string | null;
  /** 署名時刻（ISO 文字列。判明時のみ） */
  signedAt: string | null;
  /** AI 生成（trainedAlgorithmicMedia 系の digitalSourceType）を含むか */
  isAiGenerated: boolean;
  /** 編集履歴（アクション一覧） */
  actions: C2paActionSummary[];
  /** 署名検証の結果 */
  signature: C2paSignatureState;
  /** 検証で報告された問題コード（invalid の理由表示用） */
  validationIssues: string[];
}

/** AI 生成と判定する digitalSourceType（IPTC newscodes）の部分文字列 */
const AI_SOURCE_TYPE_PATTERN = /trainedAlgorithmicMedia/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** claim_generator_info（[{ name, version }]）または claim_generator 文字列からツール名を得る */
const readClaimGenerator = (
  manifest: Record<string, unknown>,
): string | null => {
  const info = manifest.claim_generator_info;
  if (Array.isArray(info) && isRecord(info[0])) {
    const name = asString(info[0].name);
    if (name) {
      const version = asString(info[0].version);
      return version ? `${name} ${version}` : name;
    }
  }
  return asString(manifest.claim_generator);
};

/** assertions 配列から c2pa.actions（v2 含む）のアクション一覧を集める */
const readActions = (
  manifest: Record<string, unknown>,
): C2paActionSummary[] => {
  const assertions = manifest.assertions;
  if (!Array.isArray(assertions)) {
    return [];
  }
  const actions: C2paActionSummary[] = [];
  for (const assertion of assertions) {
    if (!isRecord(assertion)) {
      continue;
    }
    const label = asString(assertion.label);
    if (!label || !label.startsWith("c2pa.actions")) {
      continue;
    }
    const data = assertion.data;
    if (!isRecord(data) || !Array.isArray(data.actions)) {
      continue;
    }
    for (const action of data.actions) {
      if (!isRecord(action)) {
        continue;
      }
      const name = asString(action.action);
      if (!name) {
        continue;
      }
      // softwareAgent は文字列（v1）と { name } オブジェクト（v2）の両形がある
      const agent = isRecord(action.softwareAgent)
        ? asString(action.softwareAgent.name)
        : asString(action.softwareAgent);
      actions.push({
        action: name,
        softwareAgent: agent,
        digitalSourceType: asString(action.digitalSourceType),
      });
    }
  }
  return actions;
};

/**
 * validation_state（新形式）と validation_status（問題コード配列）から署名状態を決める。
 * - validation_state: "Trusted" / "Valid" → valid、"Invalid" → invalid
 * - validation_state が無い場合: validation_status に失敗コードがあれば invalid、
 *   空配列なら valid、フィールド自体が無ければ unknown
 */
const readSignatureState = (
  store: Record<string, unknown>,
): { state: C2paSignatureState; issues: string[] } => {
  const issues: string[] = [];
  const status = store.validation_status;
  if (Array.isArray(status)) {
    for (const entry of status) {
      if (isRecord(entry)) {
        const code = asString(entry.code);
        if (code) {
          issues.push(code);
        }
      }
    }
  }
  const state = asString(store.validation_state);
  if (state === "Trusted" || state === "Valid") {
    return { state: "valid", issues };
  }
  if (state === "Invalid") {
    return { state: "invalid", issues };
  }
  if (Array.isArray(status)) {
    return { state: issues.length > 0 ? "invalid" : "valid", issues };
  }
  return { state: "unknown", issues };
};

/**
 * マニフェストストア JSON からアクティブマニフェストの要約を作る。
 * 形状が解釈できない場合は null（呼び出し側は「解析不能」表示に落とす）。
 */
export const summarizeManifestStore = (json: unknown): C2paSummary | null => {
  if (!isRecord(json)) {
    return null;
  }
  const manifests = json.manifests;
  if (!isRecord(manifests)) {
    return null;
  }
  // active_manifest のラベルが引けない場合は先頭のマニフェストにフォールバックする
  const activeLabel = asString(json.active_manifest);
  const manifest =
    (activeLabel && isRecord(manifests[activeLabel])
      ? (manifests[activeLabel] as Record<string, unknown>)
      : undefined) ?? Object.values(manifests).find(isRecord);
  if (!manifest) {
    return null;
  }

  const signatureInfo = isRecord(manifest.signature_info)
    ? manifest.signature_info
    : {};
  const actions = readActions(manifest);
  const { state, issues } = readSignatureState(json);

  return {
    issuer: asString(signatureInfo.issuer),
    claimGenerator: readClaimGenerator(manifest),
    signedAt: asString(signatureInfo.time),
    isAiGenerated: actions.some(
      (action) =>
        action.digitalSourceType !== null &&
        AI_SOURCE_TYPE_PATTERN.test(action.digitalSourceType),
    ),
    actions,
    signature: state,
    validationIssues: issues,
  };
};
