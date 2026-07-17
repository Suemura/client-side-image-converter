import { describe, expect, it } from "vitest";
import { SUPPORTED_IMAGE_FORMATS } from "../constants";
import type { ConversionResult } from "../conversionCore";
import {
  conversionResultsToFiles,
  createHandoffStore,
  cropResultsToFiles,
  findHandoffTool,
  HANDOFF_TOOLS,
  type HandoffPayload,
  resolveHandoffTargets,
  resolveShareAcceptTypes,
} from "../handoff";
import type { CropResult } from "../imageCropper";

/** テスト用の ConversionResult を最小構成で生成する */
const createConversionResult = (
  filename: string,
  mimeType: string,
): ConversionResult => {
  const blob = new Blob([new Uint8Array(8)], { type: mimeType });
  return {
    blob,
    url: `blob:${filename}`,
    originalSize: 100,
    convertedSize: 8,
    filename,
    originalFilename: filename,
    file: new File([blob], filename, { type: mimeType }),
  };
};

/** テスト用の CropResult を最小構成で生成する */
const createCropResult = (
  fileName: string,
  mimeType: string,
  success = true,
): CropResult => ({
  originalFile: new File([new Uint8Array(4)], fileName, { type: mimeType }),
  croppedBlob: success
    ? new Blob([new Uint8Array(8)], { type: mimeType })
    : new Blob(),
  fileName,
  success,
  error: success ? undefined : "crop failed",
});

describe("HANDOFF_TOOLS", () => {
  it("5 ツール分の定義があり ID が一意である", () => {
    const ids = HANDOFF_TOOLS.map((tool) => tool.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("path は実ルート・labelKey は navigation 名前空間を指す", () => {
    for (const tool of HANDOFF_TOOLS) {
      expect(tool.path).toBe(`/${tool.id}`);
      expect(tool.labelKey).toBe(`navigation.${tool.id}`);
    }
  });

  it("acceptedTypes は各ページが FileUploadArea に渡す定数と同一参照である", () => {
    expect(findHandoffTool("convert")?.acceptedTypes).toBe(
      SUPPORTED_IMAGE_FORMATS.CONVERT_UPLOAD_FORMATS,
    );
    expect(findHandoffTool("crop")?.acceptedTypes).toBe(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    );
    expect(findHandoffTool("edit")?.acceptedTypes).toBe(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    );
    expect(findHandoffTool("redact")?.acceptedTypes).toBe(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    );
    expect(findHandoffTool("metadata")?.acceptedTypes).toBe(
      SUPPORTED_IMAGE_FORMATS.UPLOAD_FORMATS,
    );
  });

  it("全 5 ツールが受け取り可能（#98 で redact まで有効化済み）", () => {
    const receivable = HANDOFF_TOOLS.filter((tool) => tool.canReceiveHandoff);
    expect(receivable.map((tool) => tool.id).sort()).toEqual([
      "convert",
      "crop",
      "edit",
      "metadata",
      "redact",
    ]);
  });

  it("findHandoffTool で ID から引ける", () => {
    expect(findHandoffTool("crop")?.path).toBe("/crop");
  });
});

describe("resolveHandoffTargets", () => {
  it("convert の結果（PNG）は crop / edit / redact / metadata へ送れる", () => {
    const targets = resolveHandoffTargets("convert", ["image/png"]);
    expect(targets.map((tool) => tool.id)).toEqual([
      "crop",
      "edit",
      "redact",
      "metadata",
    ]);
  });

  it("crop の結果（JPEG）は convert / edit / redact / metadata へ送れる", () => {
    const targets = resolveHandoffTargets("crop", ["image/jpeg"]);
    expect(targets.map((tool) => tool.id)).toEqual([
      "convert",
      "edit",
      "redact",
      "metadata",
    ]);
  });

  it("metadata の結果（WebP）は crop / convert / edit / redact へ送れる", () => {
    const targets = resolveHandoffTargets("metadata", ["image/webp"]);
    expect(targets.map((tool) => tool.id)).toEqual([
      "crop",
      "convert",
      "edit",
      "redact",
    ]);
  });

  it("edit の結果（PNG）は crop / convert / redact / metadata へ送れる（編集 → 変換の中核フロー）", () => {
    const targets = resolveHandoffTargets("edit", ["image/png"]);
    expect(targets.map((tool) => tool.id)).toEqual([
      "crop",
      "convert",
      "redact",
      "metadata",
    ]);
  });

  it("redact の結果（JPEG）は他の全 4 ツールへ送れる（レタッチ → メタデータ削除の安全化フロー）", () => {
    const targets = resolveHandoffTargets("redact", ["image/jpeg"]);
    expect(targets.map((tool) => tool.id)).toEqual([
      "crop",
      "convert",
      "edit",
      "metadata",
    ]);
  });

  it("edit の AVIF 出力はどのツールも受理できないため候補なし", () => {
    expect(resolveHandoffTargets("edit", ["image/avif"])).toEqual([]);
  });

  it("送り元自身は候補に含まれない", () => {
    const targets = resolveHandoffTargets("convert", ["image/png"]);
    expect(targets.some((tool) => tool.id === "convert")).toBe(false);
  });

  it("AVIF 結果はどのツールも受理できないため候補なし（metadata にも出ない）", () => {
    // crop / metadata は UPLOAD_FORMATS（AVIF 非受理）、convert 自身は送り元のため除外
    expect(resolveHandoffTargets("convert", ["image/avif"])).toEqual([]);
  });

  it("混在バッチは全 MIME を受理できるツールのみ（部分送出を作らない）", () => {
    expect(
      resolveHandoffTargets("convert", ["image/png", "image/avif"]),
    ).toEqual([]);
  });

  it("TIFF は convert のみ受理するため crop からの送り先は convert になる", () => {
    const targets = resolveHandoffTargets("crop", ["image/tiff"]);
    expect(targets.map((tool) => tool.id)).toEqual(["convert"]);
  });

  it("空の MIME 一覧では候補なし", () => {
    expect(resolveHandoffTargets("convert", [])).toEqual([]);
  });

  it("共有シート起点（origin: share）は JPEG なら全 5 ツールへ送れる（自己除外に該当しない）", () => {
    const targets = resolveHandoffTargets("share", ["image/jpeg"]);
    expect(targets.map((tool) => tool.id)).toEqual([
      "crop",
      "convert",
      "edit",
      "redact",
      "metadata",
    ]);
  });

  it("共有シート起点の HEIC は convert のみが受理する", () => {
    const targets = resolveHandoffTargets("share", ["image/heic"]);
    expect(targets.map((tool) => tool.id)).toEqual(["convert"]);
  });
});

describe("resolveShareAcceptTypes", () => {
  it("受け取り可能ツールの acceptedTypes の和集合（重複なし）を返す", () => {
    const types = resolveShareAcceptTypes();
    expect(new Set(types).size).toBe(types.length);
    const expected = new Set(
      HANDOFF_TOOLS.filter((tool) => tool.canReceiveHandoff).flatMap((tool) => [
        ...tool.acceptedTypes,
      ]),
    );
    expect(new Set(types)).toEqual(expected);
  });

  it("convert 固有の HEIC / TIFF を含む（共有シート → 変換ページの動線を塞がない）", () => {
    const types = resolveShareAcceptTypes();
    expect(types).toContain("image/heic");
    expect(types).toContain("image/tiff");
  });
});

describe("conversionResultsToFiles", () => {
  it("filename と blob の MIME を引き継いだ File を返す", () => {
    const files = conversionResultsToFiles([
      createConversionResult("photo.webp", "image/webp"),
      createConversionResult("logo.png", "image/png"),
    ]);
    expect(files.map((file) => file.name)).toEqual(["photo.webp", "logo.png"]);
    expect(files.map((file) => file.type)).toEqual(["image/webp", "image/png"]);
  });

  it("同名衝突は ZIP ダウンロードと同じ _2 連番で一意化する", () => {
    const files = conversionResultsToFiles([
      createConversionResult("photo.webp", "image/webp"),
      createConversionResult("photo.webp", "image/webp"),
      createConversionResult("photo.webp", "image/webp"),
    ]);
    expect(files.map((file) => file.name)).toEqual([
      "photo.webp",
      "photo_2.webp",
      "photo_3.webp",
    ]);
  });

  it("連番候補が既出の実ファイル名と衝突する場合は一意になるまで進める", () => {
    // photo.png / photo_2.png / photo.webp を JPEG 変換したバッチ:
    // 3 件目の連番候補 photo_2.jpeg は 2 件目の実名と衝突するため photo_3.jpeg になる
    const files = conversionResultsToFiles([
      createConversionResult("photo.jpeg", "image/jpeg"),
      createConversionResult("photo_2.jpeg", "image/jpeg"),
      createConversionResult("photo.jpeg", "image/jpeg"),
    ]);
    expect(files.map((file) => file.name)).toEqual([
      "photo.jpeg",
      "photo_2.jpeg",
      "photo_3.jpeg",
    ]);
  });
});

describe("cropResultsToFiles", () => {
  it("成功結果のみを File に変換し失敗はスキップする", () => {
    const files = cropResultsToFiles([
      createCropResult("a_cropped.jpg", "image/jpeg"),
      createCropResult("b_cropped.jpg", "image/jpeg", false),
      createCropResult("c_cropped.png", "image/png"),
    ]);
    expect(files.map((file) => file.name)).toEqual([
      "a_cropped.jpg",
      "c_cropped.png",
    ]);
  });

  it("MIME は croppedBlob の実体から取る（元 File の type ではなく）", () => {
    // BMP 入力は canvas.toBlob が PNG にフォールバックするため blob.type が実体を表す
    const result: CropResult = {
      originalFile: new File([new Uint8Array(4)], "img.bmp", {
        type: "image/bmp",
      }),
      croppedBlob: new Blob([new Uint8Array(8)], { type: "image/png" }),
      fileName: "img_cropped.bmp",
      success: true,
    };
    const files = cropResultsToFiles([result]);
    expect(files[0].type).toBe("image/png");
  });

  it("同名衝突は _2 連番で一意化する", () => {
    const files = cropResultsToFiles([
      createCropResult("img_cropped.png", "image/png"),
      createCropResult("img_cropped.png", "image/png"),
    ]);
    expect(files.map((file) => file.name)).toEqual([
      "img_cropped.png",
      "img_cropped_2.png",
    ]);
  });
});

describe("createHandoffStore", () => {
  const createPayload = (): HandoffPayload => ({
    files: [new File([new Uint8Array(4)], "a.png", { type: "image/png" })],
    origin: "convert",
    sentAt: 1234567890,
  });

  it("未送出時の consume は null を返す", () => {
    expect(createHandoffStore().consume("/crop")).toBeNull();
  });

  it("到着ページの間は同じペイロードを何度でも返す（二重マウント耐性）", () => {
    const store = createHandoffStore();
    const payload = createPayload();
    store.send(payload, "/convert");
    // Next.js のクライアント遷移では遷移先ページが二重マウントされることがあり、
    // 破棄される側のマウントが先に consume しても取りこぼさないよう冪等に読める
    expect(store.consume("/crop")).toBe(payload);
    expect(store.consume("/crop")).toBe(payload);
  });

  it("送出元ページには配送しない（送出直後の再マウントで誤到着させない）", () => {
    const store = createHandoffStore();
    const payload = createPayload();
    store.send(payload, "/convert");
    // ルートレイアウトごと再マウントされると送出元ページの receiver が
    // 再実行されることがあるが、送出元への配送・到着扱いはしない
    expect(store.consume("/convert")).toBeNull();
    // その後の実到着では受け取れる
    expect(store.consume("/crop")).toBe(payload);
  });

  it("別ページからの consume で破棄される（戻る操作での二重取り込み防止）", () => {
    const store = createHandoffStore();
    store.send(createPayload(), "/convert");
    expect(store.consume("/crop")).not.toBeNull();
    // 到着ページ（/crop）から離れて別ページで consume → 破棄
    expect(store.consume("/convert")).toBeNull();
    // 再び到着ページへ戻っても復活しない
    expect(store.consume("/crop")).toBeNull();
  });

  it("onNavigate: 到着ページ以外への移動でペイロードを破棄する", () => {
    const store = createHandoffStore();
    store.send(createPayload(), "/convert");
    expect(store.consume("/crop")).not.toBeNull();
    // 受け取り側のないページ（例: トップ）へ移動 → 破棄
    store.onNavigate("/");
    expect(store.consume("/crop")).toBeNull();
  });

  it("onNavigate: 同一パス名の再通知・未到着時は破棄しない", () => {
    const store = createHandoffStore();
    store.send(createPayload(), "/convert");
    // 未到着（送出直後の遷移中）の onNavigate では消えない
    store.onNavigate("/crop");
    expect(store.consume("/crop")).not.toBeNull();
    // 到着ページと同じパス名の再通知でも消えない
    store.onNavigate("/crop");
    expect(store.consume("/crop")).not.toBeNull();
  });

  it("連続 send は最後のペイロードで上書きし到着状態もリセットする", () => {
    const store = createHandoffStore();
    const first = createPayload();
    const second = { ...createPayload(), origin: "crop" as const };
    store.send(first, "/convert");
    expect(store.consume("/crop")).toBe(first);
    store.send(second, "/crop");
    // 再送出で到着状態がリセットされ、新しい到着ページで受け取れる
    expect(store.consume("/convert")).toBe(second);
  });
});
