import { describe, expect, it } from "vitest";
import { createFileNameUniquifier } from "../fileName";
import { extractWritableEntries, planFolderWrites } from "../folderExportCore";
import type { ConversionResult } from "../imageConverter";
import type { CropResult } from "../imageCropper";

/** テスト用の ConversionResult を最小構成で作る */
const makeConversionResult = (
  filename: string,
  blob = new Blob(["converted"]),
): ConversionResult => ({
  blob,
  url: "blob:mock",
  originalSize: 100,
  convertedSize: 50,
  filename,
  originalFilename: filename,
  file: new File(["original"], filename),
});

/** テスト用の CropResult を最小構成で作る */
const makeCropResult = (
  fileName: string,
  success = true,
  blob = new Blob(["cropped"]),
): CropResult => ({
  originalFile: new File(["original"], fileName),
  croppedBlob: blob,
  fileName,
  success,
});

describe("extractWritableEntries", () => {
  it("ConversionResult から filename と blob を取り出す", () => {
    const blob = new Blob(["a"]);
    const entries = extractWritableEntries([
      makeConversionResult("photo.webp", blob),
    ]);
    expect(entries).toEqual([{ name: "photo.webp", blob }]);
  });

  it("CropResult から fileName と croppedBlob を取り出す", () => {
    const blob = new Blob(["b"]);
    const entries = extractWritableEntries([
      makeCropResult("cropped.png", true, blob),
    ]);
    expect(entries).toEqual([{ name: "cropped.png", blob }]);
  });

  it("失敗した CropResult はスキップする", () => {
    const entries = extractWritableEntries([
      makeCropResult("ok.png", true),
      makeCropResult("failed.png", false),
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["ok.png"]);
  });

  it("空の結果一覧は空の配列を返す", () => {
    expect(extractWritableEntries([])).toEqual([]);
  });
});

describe("planFolderWrites", () => {
  it("既存ファイルと衝突しない名前はそのまま採用する", () => {
    const plan = planFolderWrites(
      [{ name: "photo.webp", blob: new Blob() }],
      ["other.png"],
    );
    expect(plan.map((entry) => entry.targetName)).toEqual(["photo.webp"]);
  });

  it("フォルダ内の既存ファイルと衝突する名前は上書きせず連番へ回る", () => {
    const plan = planFolderWrites(
      [{ name: "photo.webp", blob: new Blob() }],
      ["photo.webp"],
    );
    expect(plan.map((entry) => entry.targetName)).toEqual(["photo_2.webp"]);
  });

  it("結果内の同名ファイル同士も連番で一意化する", () => {
    const plan = planFolderWrites(
      [
        { name: "photo.webp", blob: new Blob() },
        { name: "photo.webp", blob: new Blob() },
      ],
      [],
    );
    expect(plan.map((entry) => entry.targetName)).toEqual([
      "photo.webp",
      "photo_2.webp",
    ]);
  });

  it("連番候補が既存ファイル名と衝突する場合は一意になるまで進める", () => {
    const plan = planFolderWrites(
      [{ name: "photo.webp", blob: new Blob() }],
      ["photo.webp", "photo_2.webp"],
    );
    expect(plan.map((entry) => entry.targetName)).toEqual(["photo_3.webp"]);
  });

  it("ZIP ダウンロードと同一の連番規則を共有する（createFileNameUniquifier）", () => {
    // ZIP 側（既存名シードなし）と同じ入力順で同じ採番結果になることを担保
    const zipUniquify = createFileNameUniquifier();
    const names = ["a.png", "a.png", "a_2.png"];
    const zipNames = names.map(zipUniquify);
    const plan = planFolderWrites(
      names.map((name) => ({ name, blob: new Blob() })),
      [],
    );
    expect(plan.map((entry) => entry.targetName)).toEqual(zipNames);
  });

  it("計画の各エントリは入力の blob 参照を保持する", () => {
    const blob = new Blob(["payload"]);
    const plan = planFolderWrites([{ name: "photo.webp", blob }], []);
    expect(plan[0].blob).toBe(blob);
  });
});
