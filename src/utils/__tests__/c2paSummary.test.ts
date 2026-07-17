import { describe, expect, it } from "vitest";
import { summarizeManifestStore } from "../c2paSummary";

/** c2pa-web の manifestStore() 相当の最小フィクスチャ */
const buildStore = (overrides?: {
  manifest?: Record<string, unknown>;
  store?: Record<string, unknown>;
}): Record<string, unknown> => ({
  active_manifest: "urn:c2pa:example",
  manifests: {
    "urn:c2pa:example": {
      claim_generator_info: [{ name: "TestApp", version: "1.2.3" }],
      signature_info: {
        issuer: "Example Issuer",
        time: "2026-01-01T00:00:00Z",
      },
      assertions: [
        {
          label: "c2pa.actions",
          data: {
            actions: [
              { action: "c2pa.created", softwareAgent: "TestApp" },
              { action: "c2pa.color_adjustments" },
            ],
          },
        },
      ],
      ...overrides?.manifest,
    },
  },
  validation_state: "Valid",
  ...overrides?.store,
});

describe("summarizeManifestStore", () => {
  it("発行者・生成ツール・署名時刻・アクションを抽出する", () => {
    const summary = summarizeManifestStore(buildStore());
    expect(summary).not.toBeNull();
    expect(summary?.issuer).toBe("Example Issuer");
    expect(summary?.claimGenerator).toBe("TestApp 1.2.3");
    expect(summary?.signedAt).toBe("2026-01-01T00:00:00Z");
    expect(summary?.actions.map((a) => a.action)).toEqual([
      "c2pa.created",
      "c2pa.color_adjustments",
    ]);
    expect(summary?.signature).toBe("valid");
    expect(summary?.isAiGenerated).toBe(false);
  });

  it("digitalSourceType が trainedAlgorithmicMedia を含めば AI 生成と判定する", () => {
    const summary = summarizeManifestStore(
      buildStore({
        manifest: {
          assertions: [
            {
              label: "c2pa.actions.v2",
              data: {
                actions: [
                  {
                    action: "c2pa.created",
                    digitalSourceType:
                      "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
                    softwareAgent: { name: "AI Generator" },
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(summary?.isAiGenerated).toBe(true);
    // v2 形式（softwareAgent がオブジェクト）も名前を取れる
    expect(summary?.actions[0].softwareAgent).toBe("AI Generator");
  });

  it("合成系（compositeWithTrainedAlgorithmicMedia）も AI 生成と判定する", () => {
    const summary = summarizeManifestStore(
      buildStore({
        manifest: {
          assertions: [
            {
              label: "c2pa.actions",
              data: {
                actions: [
                  {
                    action: "c2pa.placed",
                    digitalSourceType:
                      "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
                  },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(summary?.isAiGenerated).toBe(true);
  });

  it("validation_state → 署名状態のマッピング", () => {
    expect(
      summarizeManifestStore(
        buildStore({ store: { validation_state: "Trusted" } }),
      )?.signature,
    ).toBe("valid");
    expect(
      summarizeManifestStore(
        buildStore({ store: { validation_state: "Invalid" } }),
      )?.signature,
    ).toBe("invalid");
  });

  it("validation_state が無い場合は validation_status の失敗コードで判定する", () => {
    const invalid = summarizeManifestStore(
      buildStore({
        store: {
          validation_state: undefined,
          validation_status: [{ code: "claimSignature.mismatch" }],
        },
      }),
    );
    expect(invalid?.signature).toBe("invalid");
    expect(invalid?.validationIssues).toEqual(["claimSignature.mismatch"]);

    const valid = summarizeManifestStore(
      buildStore({
        store: { validation_state: undefined, validation_status: [] },
      }),
    );
    expect(valid?.signature).toBe("valid");
  });

  it("検証情報がまったく無ければ unknown", () => {
    const summary = summarizeManifestStore(
      buildStore({ store: { validation_state: undefined } }),
    );
    expect(summary?.signature).toBe("unknown");
  });

  it("claim_generator_info が無ければ claim_generator 文字列にフォールバックする", () => {
    const summary = summarizeManifestStore(
      buildStore({
        manifest: {
          claim_generator_info: undefined,
          claim_generator: "legacy-app/2.0",
        },
      }),
    );
    expect(summary?.claimGenerator).toBe("legacy-app/2.0");
  });

  it("active_manifest が引けない場合は先頭のマニフェストにフォールバックする", () => {
    const summary = summarizeManifestStore(
      buildStore({ store: { active_manifest: "urn:missing" } }),
    );
    expect(summary?.issuer).toBe("Example Issuer");
  });

  it("欠損フィールドに耐える（すべて不明の要約を返す）", () => {
    const summary = summarizeManifestStore({
      manifests: { a: {} },
    });
    expect(summary).not.toBeNull();
    expect(summary?.issuer).toBeNull();
    expect(summary?.claimGenerator).toBeNull();
    expect(summary?.actions).toEqual([]);
    expect(summary?.signature).toBe("unknown");
  });

  it("解釈できない形状は null（呼び出し側で解析不能表示）", () => {
    expect(summarizeManifestStore(null)).toBeNull();
    expect(summarizeManifestStore("not-an-object")).toBeNull();
    expect(summarizeManifestStore({})).toBeNull();
    expect(summarizeManifestStore({ manifests: [] })).toBeNull();
  });
});
