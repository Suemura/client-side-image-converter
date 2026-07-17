import { describe, expect, it } from "vitest";
import {
  buildShareTargetManifestEntry,
  extractSharedFiles,
  readSharedPayload,
  SHARE_CACHE_NAME,
  SHARE_FORM_FIELD,
  SHARE_PAYLOAD_URL,
  SHARE_TARGET_ACTION,
  type SharePayloadCacheStorage,
} from "../shareTarget";

/**
 * readSharedPayload 用の CacheStorage フェイク。
 * 呼び出しの種類と順序を calls に記録し、「削除がパースより先」の fail-safe を検証する。
 */
const createCacheStorageFake = (options: {
  /** false ならエントリなし（match が undefined を返す） */
  hasEntry: boolean;
  /** エントリの formData() 実装（省略時は空 FormData を返す） */
  formData?: () => Promise<FormData>;
}): { calls: string[]; storage: SharePayloadCacheStorage } => {
  const calls: string[] = [];
  return {
    calls,
    storage: {
      open: async (cacheName) => {
        calls.push(`open:${cacheName}`);
        return {
          match: async (url) => {
            calls.push(`match:${url}`);
            if (!options.hasEntry) {
              return undefined;
            }
            return {
              formData: () => {
                calls.push("formData");
                return options.formData?.() ?? Promise.resolve(new FormData());
              },
            };
          },
          delete: async (url) => {
            calls.push(`delete:${url}`);
            return true;
          },
        };
      },
    },
  };
};

describe("buildShareTargetManifestEntry", () => {
  it("share_target 仕様の形（POST / multipart / files フィールド）を組み立てる", () => {
    const entry = buildShareTargetManifestEntry(["image/jpeg", "image/png"]);
    expect(entry.action).toBe(SHARE_TARGET_ACTION);
    expect(entry.method).toBe("POST");
    expect(entry.enctype).toBe("multipart/form-data");
    expect(entry.params.files).toHaveLength(1);
    expect(entry.params.files[0].name).toBe(SHARE_FORM_FIELD);
    expect(entry.params.files[0].accept).toEqual(["image/jpeg", "image/png"]);
  });

  it("accept は入力配列の防御コピー（呼び出し後の変更が反映されない）", () => {
    const accept = ["image/jpeg"];
    const entry = buildShareTargetManifestEntry(accept);
    accept.push("image/png");
    expect(entry.params.files[0].accept).toEqual(["image/jpeg"]);
  });
});

describe("extractSharedFiles", () => {
  it("共有フィールドの File のみを取り出す（文字列値・空ファイルは除外）", () => {
    const formData = new FormData();
    const file = new File([new Uint8Array(4)], "a.png", { type: "image/png" });
    formData.append(SHARE_FORM_FIELD, file);
    formData.append(SHARE_FORM_FIELD, "not-a-file");
    formData.append(SHARE_FORM_FIELD, new File([], "empty.png"));

    const files = extractSharedFiles(formData);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a.png");
  });

  it("別フィールドの File は対象外", () => {
    const formData = new FormData();
    formData.append(
      "other",
      new File([new Uint8Array(4)], "b.png", { type: "image/png" }),
    );
    expect(extractSharedFiles(formData)).toEqual([]);
  });

  it("フィールド自体がなければ空配列", () => {
    expect(extractSharedFiles(new FormData())).toEqual([]);
  });
});

describe("readSharedPayload", () => {
  it("エントリなし（直接アクセス・リロード後）は null を返し delete しない", async () => {
    const { calls, storage } = createCacheStorageFake({ hasEntry: false });
    expect(await readSharedPayload(storage)).toBeNull();
    expect(calls).toEqual([
      `open:${SHARE_CACHE_NAME}`,
      `match:${SHARE_PAYLOAD_URL}`,
    ]);
  });

  it("エントリありは共有された File 一覧を返す", async () => {
    const formData = new FormData();
    formData.append(
      SHARE_FORM_FIELD,
      new File([new Uint8Array(4)], "shared.jpg", { type: "image/jpeg" }),
    );
    const { storage } = createCacheStorageFake({
      hasEntry: true,
      formData: () => Promise.resolve(formData),
    });

    const files = await readSharedPayload(storage);
    expect(files?.map((file) => file.name)).toEqual(["shared.jpg"]);
  });

  it("エントリはパースより先に削除する（リロード後にファイルを残さない fail-safe）", async () => {
    const { calls, storage } = createCacheStorageFake({ hasEntry: true });
    await readSharedPayload(storage);
    expect(calls).toEqual([
      `open:${SHARE_CACHE_NAME}`,
      `match:${SHARE_PAYLOAD_URL}`,
      `delete:${SHARE_PAYLOAD_URL}`,
      "formData",
    ]);
  });

  it("multipart として解釈できないペイロード（formData が reject）は null（削除は実行済み）", async () => {
    const { calls, storage } = createCacheStorageFake({
      hasEntry: true,
      formData: () => Promise.reject(new Error("broken payload")),
    });
    expect(await readSharedPayload(storage)).toBeNull();
    expect(calls).toContain(`delete:${SHARE_PAYLOAD_URL}`);
  });
});
