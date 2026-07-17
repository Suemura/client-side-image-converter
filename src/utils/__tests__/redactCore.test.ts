import { describe, expect, it } from "vitest";
import type { CropArea } from "../cropGeometry";
import {
  addRegion,
  applyRedactionsToImageData,
  clampRegionToImage,
  DEFAULT_REDACT_STYLE,
  parseHexColor,
  type RedactRegion,
  type RedactState,
  type RedactStyle,
  type RgbaImage,
  removeRegion,
  resolveBlurRadius,
  resolveMosaicBlockSize,
  resolveRegionsForIndex,
  updateRegionArea,
} from "../redactCore";

/** 全ピクセルを指定の RGBA で埋めたテスト画像を生成する */
const createImage = (
  width: number,
  height: number,
  rgba: [number, number, number, number] = [0, 0, 0, 255],
): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { data, width, height };
};

/** 指定座標の RGBA を読み出す */
const pixelAt = (
  image: RgbaImage,
  x: number,
  y: number,
): [number, number, number, number] => {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ];
};

/** 指定座標の RGBA を書き込む */
const setPixel = (
  image: RgbaImage,
  x: number,
  y: number,
  rgba: [number, number, number, number],
): void => {
  const offset = (y * image.width + x) * 4;
  image.data.set(rgba, offset);
};

const region = (id: number, area: CropArea): RedactRegion => ({ id, area });

const styleOf = (overrides: Partial<RedactStyle>): RedactStyle => ({
  ...DEFAULT_REDACT_STYLE,
  ...overrides,
});

describe("parseHexColor", () => {
  it("#rrggbb 形式をパースできる", () => {
    expect(parseHexColor("#ff8040")).toEqual({ r: 255, g: 128, b: 64 });
    expect(parseHexColor("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("#rgb 短縮形式をパースできる", () => {
    expect(parseHexColor("#f00")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseHexColor("#08c")).toEqual({ r: 0, g: 136, b: 204 });
  });

  it("不正な形式は null を返す", () => {
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor("ff8040")).toBeNull();
    expect(parseHexColor("#ff80")).toBeNull();
    expect(parseHexColor("#gggggg")).toBeNull();
  });
});

describe("領域リスト操作", () => {
  const base: RedactRegion[] = [
    region(1, { x: 0, y: 0, width: 10, height: 10 }),
    region(2, { x: 20, y: 20, width: 5, height: 5 }),
  ];

  it("addRegion は末尾へ追加した新しい配列を返す（元配列は不変）", () => {
    const added = region(3, { x: 1, y: 1, width: 2, height: 2 });
    const next = addRegion(base, added);
    expect(next).toHaveLength(3);
    expect(next[2]).toBe(added);
    expect(next).not.toBe(base);
    expect(base).toHaveLength(2);
  });

  it("updateRegionArea は指定 id の矩形だけを差し替える", () => {
    const area = { x: 5, y: 5, width: 8, height: 8 };
    const next = updateRegionArea(base, 2, area);
    expect(next).not.toBe(base);
    expect(next[0]).toBe(base[0]);
    expect(next[1]).toEqual({ id: 2, area });
    // 元配列は不変
    expect(base[1].area).toEqual({ x: 20, y: 20, width: 5, height: 5 });
  });

  it("updateRegionArea は id が見つからない場合に同一配列参照を返す", () => {
    expect(
      updateRegionArea(base, 99, { x: 0, y: 0, width: 1, height: 1 }),
    ).toBe(base);
  });

  it("removeRegion は指定 id の領域を取り除く", () => {
    const next = removeRegion(base, 1);
    expect(next.map((r) => r.id)).toEqual([2]);
    expect(base).toHaveLength(2);
  });

  it("removeRegion は id が見つからない場合に同一配列参照を返す", () => {
    expect(removeRegion(base, 99)).toBe(base);
  });
});

describe("resolveRegionsForIndex", () => {
  it("設定済みインデックスは保持中の領域リストを返す", () => {
    const regions = [region(1, { x: 0, y: 0, width: 4, height: 4 })];
    const state: RedactState = { perImageRegions: { 1: regions } };
    expect(resolveRegionsForIndex(1, state)).toBe(regions);
  });

  it("未設定のインデックスは空リストを返す", () => {
    const state: RedactState = { perImageRegions: {} };
    expect(resolveRegionsForIndex(0, state)).toEqual([]);
  });
});

describe("強度の下限（復元攻撃対策）", () => {
  it("resolveMosaicBlockSize は小さな領域では指定値をそのまま使う", () => {
    expect(
      resolveMosaicBlockSize(16, { x: 0, y: 0, width: 100, height: 100 }),
    ).toBe(16);
  });

  it("resolveMosaicBlockSize は大きな領域で短辺/24 まで引き上げる", () => {
    // 短辺 1200px → 下限 ceil(1200/24) = 50
    expect(
      resolveMosaicBlockSize(8, { x: 0, y: 0, width: 2000, height: 1200 }),
    ).toBe(50);
  });

  it("resolveBlurRadius は小さな領域では指定値をそのまま使う", () => {
    expect(resolveBlurRadius(12, { x: 0, y: 0, width: 100, height: 100 })).toBe(
      12,
    );
  });

  it("resolveBlurRadius は大きな領域で短辺/16 まで引き上げる", () => {
    // 短辺 800px → 下限 ceil(800/16) = 50
    expect(resolveBlurRadius(8, { x: 0, y: 0, width: 800, height: 1000 })).toBe(
      50,
    );
  });

  it("0 以下の指定値でも 1 以上になる", () => {
    expect(
      resolveMosaicBlockSize(0, { x: 0, y: 0, width: 10, height: 10 }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      resolveBlurRadius(0, { x: 0, y: 0, width: 10, height: 10 }),
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("clampRegionToImage", () => {
  it("境界内の領域は整数化して返す", () => {
    expect(
      clampRegionToImage({ x: 1.4, y: 2.6, width: 3.2, height: 4.1 }, 100, 100),
    ).toEqual({ x: 1, y: 3, width: 4, height: 4 });
  });

  it("はみ出した領域を画像内へクランプする", () => {
    expect(
      clampRegionToImage({ x: -5, y: -5, width: 20, height: 20 }, 10, 10),
    ).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("画像外の領域・空の領域は null を返す", () => {
    expect(
      clampRegionToImage({ x: 100, y: 100, width: 10, height: 10 }, 50, 50),
    ).toBeNull();
    expect(
      clampRegionToImage({ x: 0, y: 0, width: 0, height: 5 }, 50, 50),
    ).toBeNull();
  });
});

describe("塗りつぶし（fill）", () => {
  it("領域内を指定色（不透明）で塗り、領域境界の外側 1px は変更しない", () => {
    const image = createImage(4, 4, [10, 20, 30, 128]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 1, y: 1, width: 2, height: 2 })],
      styleOf({ mode: "fill", fillColor: "#ff8040" }),
    );

    // 領域内は指定色 + アルファ 255
    expect(pixelAt(image, 1, 1)).toEqual([255, 128, 64, 255]);
    expect(pixelAt(image, 2, 2)).toEqual([255, 128, 64, 255]);
    // 領域境界の外側 1px は不変
    expect(pixelAt(image, 0, 0)).toEqual([10, 20, 30, 128]);
    expect(pixelAt(image, 3, 1)).toEqual([10, 20, 30, 128]);
    expect(pixelAt(image, 1, 3)).toEqual([10, 20, 30, 128]);
    expect(pixelAt(image, 0, 2)).toEqual([10, 20, 30, 128]);
  });

  it("不正な色指定は黒へフォールバックする", () => {
    const image = createImage(2, 2, [100, 100, 100, 255]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 2, height: 2 })],
      styleOf({ mode: "fill", fillColor: "invalid" }),
    );
    expect(pixelAt(image, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it("画像からはみ出した領域はクランプして適用する", () => {
    const image = createImage(4, 4, [10, 20, 30, 255]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 2, y: 2, width: 100, height: 100 })],
      styleOf({ mode: "fill", fillColor: "#ffffff" }),
    );
    expect(pixelAt(image, 3, 3)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(image, 1, 1)).toEqual([10, 20, 30, 255]);
  });
});

describe("モザイク（mosaic）", () => {
  it("ブロック内を平均色で塗る", () => {
    // 左ブロック（2×2）の R 値: 10, 20, 30, 40 → 平均 25
    const image = createImage(4, 2, [0, 50, 100, 255]);
    setPixel(image, 0, 0, [10, 50, 100, 255]);
    setPixel(image, 1, 0, [20, 50, 100, 255]);
    setPixel(image, 0, 1, [30, 50, 100, 255]);
    setPixel(image, 1, 1, [40, 50, 100, 255]);

    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 4, height: 2 })],
      styleOf({ mode: "mosaic", mosaicBlockSize: 2 }),
    );

    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      expect(pixelAt(image, x, y)).toEqual([25, 50, 100, 255]);
    }
  });

  it("領域端の端数ブロックは実際に含まれるピクセル数で平均する", () => {
    // 3×3 領域 + ブロックサイズ 2 → 右端・下端に端数ブロックができる
    const image = createImage(3, 3, [0, 0, 0, 255]);
    // 右上の端数ブロック（1×2）: R 値 100, 200 → 平均 150
    setPixel(image, 2, 0, [100, 0, 0, 255]);
    setPixel(image, 2, 1, [200, 0, 0, 255]);

    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 3, height: 3 })],
      styleOf({ mode: "mosaic", mosaicBlockSize: 2 }),
    );

    expect(pixelAt(image, 2, 0)).toEqual([150, 0, 0, 255]);
    expect(pixelAt(image, 2, 1)).toEqual([150, 0, 0, 255]);
  });

  it("領域外のピクセルは変更しない", () => {
    const image = createImage(6, 6, [10, 20, 30, 255]);
    setPixel(image, 2, 2, [200, 20, 30, 255]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 2, y: 2, width: 2, height: 2 })],
      styleOf({ mode: "mosaic", mosaicBlockSize: 2 }),
    );
    // 領域外は不変
    expect(pixelAt(image, 1, 2)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 4, 2)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 2, 4)).toEqual([10, 20, 30, 255]);
  });

  it("完全透明画素の RGB は平均へ混ぜない（アルファ加重平均）", () => {
    // 2×1 ブロック: 不透明の白 + 完全透明の黒。ストレートアルファの単純平均だと
    // RGB が (128,128,128) へ沈むが、アルファ加重平均では白のまま残る
    const image = createImage(2, 1, [0, 0, 0, 0]);
    setPixel(image, 0, 0, [255, 255, 255, 255]);

    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 2, height: 1 })],
      styleOf({ mode: "mosaic", mosaicBlockSize: 2 }),
    );

    // RGB は不透明画素の白・アルファのみ平均（(255+0)/2 → 128）
    expect(pixelAt(image, 0, 0)).toEqual([255, 255, 255, 128]);
    expect(pixelAt(image, 1, 0)).toEqual([255, 255, 255, 128]);
  });

  it("全画素が完全透明のブロックは完全透明のまま", () => {
    const image = createImage(2, 2, [70, 80, 90, 0]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 2, height: 2 })],
      styleOf({ mode: "mosaic", mosaicBlockSize: 2 }),
    );
    expect(pixelAt(image, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(image, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("同じ入力から常に同じ出力を生成する（決定的）", () => {
    const build = (): RgbaImage => {
      const image = createImage(8, 8);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          setPixel(image, x, y, [(x * 37 + y * 91) % 256, x * 20, y * 20, 255]);
        }
      }
      return image;
    };
    const style = styleOf({ mode: "mosaic", mosaicBlockSize: 3 });
    const regions = [region(1, { x: 1, y: 1, width: 6, height: 6 })];
    const a = build();
    const b = build();
    applyRedactionsToImageData(a, regions, style);
    applyRedactionsToImageData(b, regions, style);
    expect(a.data).toEqual(b.data);
  });
});

describe("ぼかし（blur）", () => {
  it("一様な領域は変化しない", () => {
    const image = createImage(10, 10, [100, 150, 200, 255]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 2, y: 2, width: 6, height: 6 })],
      styleOf({ mode: "blur", blurRadius: 2 }),
    );
    expect(pixelAt(image, 4, 4)).toEqual([100, 150, 200, 255]);
    expect(pixelAt(image, 2, 2)).toEqual([100, 150, 200, 255]);
  });

  it("単一のインパルスが減衰しながら周囲へ拡散する", () => {
    const image = createImage(9, 9, [0, 0, 0, 255]);
    setPixel(image, 4, 4, [255, 0, 0, 255]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 9, height: 9 })],
      styleOf({ mode: "blur", blurRadius: 2 }),
    );
    // 中心は減衰し、隣接ピクセルへ拡散する
    expect(pixelAt(image, 4, 4)[0]).toBeLessThan(255);
    expect(pixelAt(image, 3, 4)[0]).toBeGreaterThan(0);
    expect(pixelAt(image, 4, 6)[0]).toBeGreaterThan(0);
  });

  it("領域外のピクセルを読まない（外側の色が領域内へ混ざらない）", () => {
    // 領域内は一様 50、領域外は 255。クランプサンプリングが領域内に閉じていれば
    // ぼかし後も領域内は 50 のまま変化しない
    const image = createImage(10, 10, [255, 255, 255, 255]);
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        setPixel(image, x, y, [50, 50, 50, 255]);
      }
    }
    applyRedactionsToImageData(
      image,
      [region(1, { x: 3, y: 3, width: 4, height: 4 })],
      styleOf({ mode: "blur", blurRadius: 3 }),
    );
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        expect(pixelAt(image, x, y)).toEqual([50, 50, 50, 255]);
      }
    }
  });

  it("完全透明画素の RGB が混ざって黒ずまない（アルファ乗算済みでぼかす）", () => {
    // 全画素 RGB=白でアルファのみ市松（255 / 0）の画像。ストレートアルファで
    // ぼかすと透明画素の RGB(0,0,0) が混ざり白が灰色へ沈むが、
    // premultiplied では RGB は白のままアルファだけがぼける
    const image = createImage(8, 8, [0, 0, 0, 0]);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 === 0) {
          setPixel(image, x, y, [255, 255, 255, 255]);
        }
      }
    }

    applyRedactionsToImageData(
      image,
      [region(1, { x: 0, y: 0, width: 8, height: 8 })],
      styleOf({ mode: "blur", blurRadius: 2 }),
    );

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [r, g, b, a] = pixelAt(image, x, y);
        expect([r, g, b]).toEqual([255, 255, 255]);
        // アルファは 255 と 0 の混合になる
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThan(255);
      }
    }
  });

  it("完全透明の領域は完全透明のまま", () => {
    const image = createImage(6, 6, [70, 80, 90, 0]);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 1, y: 1, width: 4, height: 4 })],
      styleOf({ mode: "blur", blurRadius: 2 }),
    );
    expect(pixelAt(image, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(image, 4, 4)).toEqual([0, 0, 0, 0]);
  });

  it("領域外のピクセルを書き換えない", () => {
    const image = createImage(10, 10, [10, 20, 30, 255]);
    for (let y = 3; y < 7; y++) {
      for (let x = 3; x < 7; x++) {
        setPixel(image, x, y, [250, 20, 30, 255]);
      }
    }
    applyRedactionsToImageData(
      image,
      [region(1, { x: 3, y: 3, width: 4, height: 4 })],
      styleOf({ mode: "blur", blurRadius: 2 }),
    );
    // 領域境界の外側 1px は不変
    expect(pixelAt(image, 2, 4)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 7, 4)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 4, 2)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(image, 4, 7)).toEqual([10, 20, 30, 255]);
  });
});

describe("applyRedactionsToImageData", () => {
  it("複数領域を順に適用する", () => {
    const image = createImage(10, 4, [100, 100, 100, 255]);
    applyRedactionsToImageData(
      image,
      [
        region(1, { x: 0, y: 0, width: 2, height: 2 }),
        region(2, { x: 5, y: 0, width: 2, height: 2 }),
      ],
      styleOf({ mode: "fill", fillColor: "#ff0000" }),
    );
    expect(pixelAt(image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(image, 5, 0)).toEqual([255, 0, 0, 255]);
    // 領域間は不変
    expect(pixelAt(image, 3, 0)).toEqual([100, 100, 100, 255]);
  });

  it("空の領域リストでは何も変更しない", () => {
    const image = createImage(4, 4, [1, 2, 3, 4]);
    const before = new Uint8ClampedArray(image.data);
    applyRedactionsToImageData(image, [], DEFAULT_REDACT_STYLE);
    expect(image.data).toEqual(before);
  });

  it("画像外へ完全に出た領域はスキップする", () => {
    const image = createImage(4, 4, [1, 2, 3, 255]);
    const before = new Uint8ClampedArray(image.data);
    applyRedactionsToImageData(
      image,
      [region(1, { x: 100, y: 100, width: 10, height: 10 })],
      styleOf({ mode: "fill", fillColor: "#ffffff" }),
    );
    expect(image.data).toEqual(before);
  });
});
