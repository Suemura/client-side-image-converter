/**
 * LUT のブラウザ側読み込みオーケストレーション。
 *
 * プリセットの動的 fetch（初期バンドル非影響）、ユーザーの `.cube` テキスト読み込み、
 * HALD CLUT PNG のデコード（Canvas 経由で RGBA を取り出す）を担う。パース・変換の純粋ロジックは
 * `lutParser.ts`（単体テスト対象）に委譲し、本モジュールは fetch / FileReader / Canvas といった
 * ブラウザ依存の橋渡しのみを行う（E2E で検証）。
 */

import { haldClutToLutData, type LutData, parseCubeLut } from "./lutParser";

/** プリセット LUT の配信ディレクトリ（public/luts → 静的配信で /luts/*.cube） */
const PRESET_BASE_PATH = "/luts";

/** 読み込み済みプリセットのモジュール内キャッシュ（ファイル名 → LutData） */
const presetCache = new Map<string, LutData>();

/**
 * プリセット `.cube`（public/luts 配下）を fetch してパースする。
 * 一度読んだファイルはモジュール内にキャッシュして再 fetch を避ける。
 */
export const loadPresetLut = async (file: string): Promise<LutData> => {
  const cached = presetCache.get(file);
  if (cached) {
    return cached;
  }
  const response = await fetch(`${PRESET_BASE_PATH}/${file}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch preset LUT: ${file} (${response.status})`);
  }
  const text = await response.text();
  const lut = parseCubeLut(text);
  presetCache.set(file, lut);
  return lut;
};

/** File をテキストとして読み込む */
const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

/** ユーザーがアップロードした `.cube` ファイルをパースする */
export const loadCubeFromFile = async (file: File): Promise<LutData> => {
  const text = await readFileAsText(file);
  return parseCubeLut(text);
};

/**
 * ユーザーがアップロードした HALD CLUT PNG を Canvas でデコードして LutData へ変換する。
 * `createImageBitmap` で読み込み、OffscreenCanvas（無ければ通常 canvas）へ描画して RGBA を取り出す。
 */
export const loadHaldFromFile = async (file: File): Promise<LutData> => {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : document.createElement("canvas");
    if (!(canvas instanceof OffscreenCanvas)) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) {
      throw new Error("Canvas 2D context is not supported");
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    return haldClutToLutData(imageData.data, width, height);
  } finally {
    bitmap.close();
  }
};

/**
 * アップロードされたファイルを拡張子から判別して LUT を読み込む。
 * `.cube` はテキストパース、`.png` は HALD CLUT として扱う。
 */
export const loadLutFromFile = async (file: File): Promise<LutData> => {
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) {
    return loadHaldFromFile(file);
  }
  if (name.endsWith(".cube")) {
    return loadCubeFromFile(file);
  }
  throw new Error("Unsupported LUT file (expected .cube or HALD .png)");
};
