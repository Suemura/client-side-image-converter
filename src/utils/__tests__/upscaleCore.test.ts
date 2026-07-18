import { describe, expect, it } from "vitest";
import {
  accumulateTile,
  computeFeatherWeights,
  computeTileGrid,
  computeTileProgress,
  createBlendAccumulator,
  DEFAULT_TILE_SIZE,
  downscaleRgbaByHalf,
  extractTileTensor,
  finalizeToRgba,
  hasTransparency,
  isUpscalableSize,
  MAX_UPSCALE_INPUT_DIMENSION,
  MODEL_SCALE,
  resizeAlphaBilinear,
  resolveOutputSize,
  type TileRect,
} from "../upscaleCore";

/** 単色 RGBA バッファを生成するテストヘルパー */
const createRgba = (
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number],
): Uint8ClampedArray => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = a;
  }
  return rgba;
};

/** タイルを「入力をそのまま scale 倍に最近傍拡大した」テンソルへ変換するテストヘルパー */
const identityUpscaleTensor = (
  rgba: Uint8ClampedArray,
  imageWidth: number,
  tile: TileRect,
  scale: number,
): Float32Array => {
  const tw = tile.width * scale;
  const th = tile.height * scale;
  const plane = tw * th;
  const tensor = new Float32Array(plane * 3);
  for (let y = 0; y < th; y++) {
    const srcY = tile.y + Math.floor(y / scale);
    for (let x = 0; x < tw; x++) {
      const srcX = tile.x + Math.floor(x / scale);
      const srcOffset = (srcY * imageWidth + srcX) * 4;
      const planeIndex = y * tw + x;
      tensor[planeIndex] = rgba[srcOffset] / 255;
      tensor[plane + planeIndex] = rgba[srcOffset + 1] / 255;
      tensor[plane * 2 + planeIndex] = rgba[srcOffset + 2] / 255;
    }
  }
  return tensor;
};

describe("computeTileGrid", () => {
  it("タイルより小さい画像は 1 タイルで全体を覆う", () => {
    expect(computeTileGrid(100, 80, 192, 16)).toEqual([
      { x: 0, y: 0, width: 100, height: 80 },
    ]);
  });

  it("タイルと同寸の画像は 1 タイル", () => {
    expect(computeTileGrid(192, 192, 192, 16)).toEqual([
      { x: 0, y: 0, width: 192, height: 192 },
    ]);
  });

  it("タイルを超える軸は stride = tileSize - overlap で分割し末尾は右端に揃う", () => {
    const tiles = computeTileGrid(400, 100, 192, 16);
    // x 位置: 0, 176, 208（= 400 - 192）
    expect(tiles.map((t) => t.x)).toEqual([0, 176, 208]);
    for (const tile of tiles) {
      expect(tile.width).toBe(192);
      expect(tile.height).toBe(100);
      expect(tile.x + tile.width).toBeLessThanOrEqual(400);
    }
  });

  it("全画素がいずれかのタイルに覆われる（隙間なし）", () => {
    const width = 500;
    const height = 450;
    const tiles = computeTileGrid(width, height, 192, 16);
    const covered = new Uint8Array(width * height);
    for (const tile of tiles) {
      for (let y = tile.y; y < tile.y + tile.height; y++) {
        for (let x = tile.x; x < tile.x + tile.width; x++) {
          covered[y * width + x] = 1;
        }
      }
    }
    expect(covered.every((v) => v === 1)).toBe(true);
  });

  it("行優先（左上 → 右下）の決定的な順序で返す", () => {
    const tiles = computeTileGrid(400, 400, 192, 16);
    expect(tiles.map((t) => `${t.x},${t.y}`)).toEqual([
      "0,0",
      "176,0",
      "208,0",
      "0,176",
      "176,176",
      "208,176",
      "0,208",
      "176,208",
      "208,208",
    ]);
  });

  it("サイズ 0 以下は空配列", () => {
    expect(computeTileGrid(0, 100)).toEqual([]);
    expect(computeTileGrid(100, 0)).toEqual([]);
  });

  it("tileSize <= overlap は例外", () => {
    expect(() => computeTileGrid(100, 100, 16, 16)).toThrow();
  });

  it("既定値はモジュール定数を使う", () => {
    const tiles = computeTileGrid(DEFAULT_TILE_SIZE + 1, 10);
    expect(tiles).toHaveLength(2);
    expect(tiles[1].x).toBe(DEFAULT_TILE_SIZE + 1 - DEFAULT_TILE_SIZE);
  });
});

describe("computeFeatherWeights", () => {
  it("画像端に接する側は減衰しない（単一タイルは全重み 1）", () => {
    const weights = computeFeatherWeights(0, 100, 100, 16, 1);
    expect(weights).toHaveLength(100);
    expect(weights.every((w) => w === 1)).toBe(true);
  });

  it("隣接タイルがある側だけ端に向かって減衰する", () => {
    // 左に隣接あり（tileStart > 0）・右は画像端
    const weights = computeFeatherWeights(50, 100, 150, 8, 1);
    expect(weights[0]).toBeLessThan(weights[7]);
    expect(weights[8]).toBe(1);
    expect(weights[99]).toBe(1);
  });

  it("重みは 0 にならない（合成時のゼロ除算を構造的に排除）", () => {
    const weights = computeFeatherWeights(10, 20, 100, 8, 2);
    for (const w of weights) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("重みは出力解像度（scale 倍）で返す", () => {
    expect(computeFeatherWeights(0, 100, 200, 16, 4)).toHaveLength(400);
  });
});

describe("extractTileTensor", () => {
  it("RGBA から NCHW（R 平面 → G 平面 → B 平面）の 0..1 テンソルへ変換する", () => {
    // 2x1 画像: 左 = (255, 0, 51), 右 = (0, 255, 102)
    const rgba = new Uint8ClampedArray([255, 0, 51, 255, 0, 255, 102, 128]);
    const tensor = extractTileTensor(rgba, 2, {
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    });
    expect(Array.from(tensor)).toEqual([
      1, // R 平面
      0,
      0, // G 平面
      1,
      Math.fround(51 / 255), // B 平面
      Math.fround(102 / 255),
    ]);
  });

  it("タイル矩形の位置から切り出す", () => {
    const rgba = createRgba(4, 4, [0, 0, 0, 255]);
    // (2,3) だけ白にする
    const offset = (3 * 4 + 2) * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    const tensor = extractTileTensor(rgba, 4, {
      x: 2,
      y: 3,
      width: 2,
      height: 1,
    });
    expect(tensor[0]).toBe(1);
    expect(tensor[1]).toBe(0);
  });
});

describe("accumulateTile / finalizeToRgba", () => {
  it("単一タイルの合成は入力テンソルをそのまま復元する", () => {
    const rgba = createRgba(3, 2, [200, 100, 50, 255]);
    const tile: TileRect = { x: 0, y: 0, width: 3, height: 2 };
    const scale = 2;
    const acc = createBlendAccumulator(6, 4);
    accumulateTile(
      acc,
      identityUpscaleTensor(rgba, 3, tile, scale),
      tile,
      scale,
      computeFeatherWeights(0, 3, 3, 1, scale),
      computeFeatherWeights(0, 2, 2, 1, scale),
    );
    const out = finalizeToRgba(acc, null);
    for (let i = 0; i < 6 * 4; i++) {
      expect(out[i * 4]).toBe(200);
      expect(out[i * 4 + 1]).toBe(100);
      expect(out[i * 4 + 2]).toBe(50);
      expect(out[i * 4 + 3]).toBe(255);
    }
  });

  it("オーバーラップ合成しても一様な画像は一様なまま（重み正規化の検証）", () => {
    const width = 40;
    const height = 30;
    const overlap = 4;
    const tileSize = 16;
    const scale = 2;
    const rgba = createRgba(width, height, [120, 60, 240, 255]);
    const tiles = computeTileGrid(width, height, tileSize, overlap);
    expect(tiles.length).toBeGreaterThan(1);
    const acc = createBlendAccumulator(width * scale, height * scale);
    for (const tile of tiles) {
      accumulateTile(
        acc,
        identityUpscaleTensor(rgba, width, tile, scale),
        tile,
        scale,
        computeFeatherWeights(tile.x, tile.width, width, overlap, scale),
        computeFeatherWeights(tile.y, tile.height, height, overlap, scale),
      );
    }
    const out = finalizeToRgba(acc, null);
    for (let i = 0; i < width * scale * height * scale; i++) {
      expect(out[i * 4]).toBe(120);
      expect(out[i * 4 + 1]).toBe(60);
      expect(out[i * 4 + 2]).toBe(240);
      expect(out[i * 4 + 3]).toBe(255);
    }
  });

  it("アルファ平面を渡すと出力のアルファに反映される", () => {
    const rgba = createRgba(2, 2, [10, 20, 30, 255]);
    const tile: TileRect = { x: 0, y: 0, width: 2, height: 2 };
    const acc = createBlendAccumulator(2, 2);
    accumulateTile(
      acc,
      identityUpscaleTensor(rgba, 2, tile, 1),
      tile,
      1,
      computeFeatherWeights(0, 2, 2, 1, 1),
      computeFeatherWeights(0, 2, 2, 1, 1),
    );
    const alpha = new Uint8ClampedArray([0, 64, 128, 255]);
    const out = finalizeToRgba(acc, alpha);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(64);
    expect(out[11]).toBe(128);
    expect(out[15]).toBe(255);
  });
});

describe("hasTransparency", () => {
  it("全画素不透明なら false", () => {
    expect(hasTransparency(createRgba(2, 2, [1, 2, 3, 255]))).toBe(false);
  });

  it("半透明画素があれば true", () => {
    const rgba = createRgba(2, 2, [1, 2, 3, 255]);
    rgba[7] = 254;
    expect(hasTransparency(rgba)).toBe(true);
  });
});

describe("resizeAlphaBilinear", () => {
  it("一様なアルファは拡大後も一様", () => {
    const rgba = createRgba(3, 3, [0, 0, 0, 100]);
    const alpha = resizeAlphaBilinear(rgba, 3, 3, 12, 12);
    expect(alpha).toHaveLength(144);
    expect(alpha.every((a) => a === 100)).toBe(true);
  });

  it("左右で異なるアルファは中間で補間される", () => {
    // 2x1: 左 = 0, 右 = 200
    const rgba = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 200]);
    const alpha = resizeAlphaBilinear(rgba, 2, 1, 8, 1);
    expect(alpha[0]).toBe(0);
    expect(alpha[7]).toBe(200);
    // 単調非減少で中間値を通る
    for (let i = 1; i < 8; i++) {
      expect(alpha[i]).toBeGreaterThanOrEqual(alpha[i - 1]);
    }
    expect(alpha[3]).toBeGreaterThan(0);
    expect(alpha[3]).toBeLessThan(200);
  });
});

describe("downscaleRgbaByHalf", () => {
  it("2x2 ブロックの平均で 1/2 に縮小する", () => {
    // 2x2 画像 → 1x1
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255, 100, 0, 0, 255, 0, 200, 0, 255, 0, 0, 100, 255,
    ]);
    const result = downscaleRgbaByHalf(rgba, 2, 2);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(Array.from(result.data)).toEqual([25, 50, 25, 255]);
  });

  it("奇数寸法は例外", () => {
    expect(() =>
      downscaleRgbaByHalf(new Uint8ClampedArray(12), 3, 1),
    ).toThrow();
  });
});

describe("resolveOutputSize / isUpscalableSize", () => {
  it("出力寸法は入力の scale 倍", () => {
    expect(resolveOutputSize(100, 50, 2)).toEqual({ width: 200, height: 100 });
    expect(resolveOutputSize(100, 50, 4)).toEqual({ width: 400, height: 200 });
  });

  it("MODEL_SCALE は 4（2x は 4x 推論 + 1/2 縮小）", () => {
    expect(MODEL_SCALE).toBe(4);
  });

  it("長辺が上限以下なら処理可能", () => {
    expect(isUpscalableSize(MAX_UPSCALE_INPUT_DIMENSION, 100)).toBe(true);
    expect(isUpscalableSize(MAX_UPSCALE_INPUT_DIMENSION + 1, 100)).toBe(false);
    expect(isUpscalableSize(0, 100)).toBe(false);
  });
});

describe("computeTileProgress", () => {
  it("完了数 / 総数を 0..1 で返す", () => {
    expect(computeTileProgress(0, 4)).toBe(0);
    expect(computeTileProgress(1, 4)).toBe(0.25);
    expect(computeTileProgress(4, 4)).toBe(1);
  });

  it("総数 0 は 0、範囲外はクランプ", () => {
    expect(computeTileProgress(1, 0)).toBe(0);
    expect(computeTileProgress(5, 4)).toBe(1);
  });

  it("進捗は単調非減少", () => {
    let prev = 0;
    for (let done = 0; done <= 10; done++) {
      const p = computeTileProgress(done, 10);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});
