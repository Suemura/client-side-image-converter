import { describe, expect, it } from "vitest";
import {
  applyLutToPixel,
  createIdentityLut,
  haldClutToLutData,
  LUT_1D_EXPAND_SIZE,
  type LutData,
  parseCubeLut,
} from "../lutParser";

/** R 最速の並びで 3D LUT の 1 節点を読む（テスト用） */
const nodeAt = (
  lut: LutData,
  r: number,
  g: number,
  b: number,
): [number, number, number] => {
  const idx = ((b * lut.size + g) * lut.size + r) * 3;
  return [lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]];
};

/** R↔B を入れ替える 2^3 の 3D LUT（線形変換なのでトライリニアで厳密） */
const SWAP_RB_CUBE = `TITLE "Swap RB"
LUT_3D_SIZE 2
0 0 0
0 0 1
0 1 0
0 1 1
1 0 0
1 0 1
1 1 0
1 1 1
`;

describe("parseCubeLut", () => {
  it("3D LUT（LUT_3D_SIZE）をパースし R 最速の並びで格納する", () => {
    const lut = parseCubeLut(SWAP_RB_CUBE);
    expect(lut.size).toBe(2);
    expect(lut.title).toBe("Swap RB");
    expect(lut.data.length).toBe(2 ** 3 * 3);
    // index1 = (r=1,g=0,b=0) は出力 (0,0,1)
    expect(nodeAt(lut, 1, 0, 0)).toEqual([0, 0, 1]);
    // index4 = (r=0,g=0,b=1) は出力 (1,0,0)
    expect(nodeAt(lut, 0, 0, 1)).toEqual([1, 0, 0]);
  });

  it("DOMAIN_MIN / DOMAIN_MAX を反映する", () => {
    const cube = `LUT_3D_SIZE 2
DOMAIN_MIN 0.1 0.2 0.3
DOMAIN_MAX 0.8 0.9 1.0
0 0 0
0 0 0
0 0 0
0 0 0
0 0 0
0 0 0
0 0 0
0 0 0
`;
    const lut = parseCubeLut(cube);
    expect(lut.domainMin).toEqual([0.1, 0.2, 0.3]);
    expect(lut.domainMax).toEqual([0.8, 0.9, 1.0]);
  });

  it("コメント行・空行・前後の空白を無視する", () => {
    const cube = `# comment line

  LUT_3D_SIZE 2

  0 0 0
0 0 1
0 1 0
0 1 1
1 0 0
1 0 1
1 1 0
   1 1 1
`;
    const lut = parseCubeLut(cube);
    expect(lut.size).toBe(2);
    expect(nodeAt(lut, 1, 1, 1)).toEqual([1, 1, 1]);
  });

  it("1D LUT（LUT_1D_SIZE）を 3D へ展開する", () => {
    // 反転曲線（各チャンネル out = 1 - in）を 3 エントリで定義
    const cube = `LUT_1D_SIZE 3
1 1 1
0.5 0.5 0.5
0 0 0
`;
    const lut = parseCubeLut(cube);
    // 3 <= LUT_1D_EXPAND_SIZE なのでサイズはそのまま 3
    expect(lut.size).toBe(3);
    // r=0 → 1、r=2 → 0（反転）。分離可能なので節点は厳密
    expect(nodeAt(lut, 0, 0, 0)).toEqual([1, 1, 1]);
    expect(nodeAt(lut, 2, 2, 2)).toEqual([0, 0, 0]);
  });

  it("大きな 1D LUT は LUT_1D_EXPAND_SIZE 上限で展開する", () => {
    const entries = Array.from({ length: 256 }, (_, i) => {
      const v = i / 255;
      return `${v} ${v} ${v}`;
    }).join("\n");
    const lut = parseCubeLut(`LUT_1D_SIZE 256\n${entries}\n`);
    expect(lut.size).toBe(LUT_1D_EXPAND_SIZE);
  });

  it("サイズ未宣言でエラーを投げる", () => {
    expect(() => parseCubeLut("0 0 0\n1 1 1\n")).toThrow();
  });

  it("3D の行数不足でエラーを投げる", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\n0 0 0\n1 1 1\n")).toThrow();
  });

  it("非数値のデータ行でエラーを投げる", () => {
    const cube = `LUT_3D_SIZE 2
0 0 0
0 0 1
0 1 0
0 1 1
1 0 0
1 0 abc
1 1 0
1 1 1
`;
    expect(() => parseCubeLut(cube)).toThrow();
  });

  it("3D と 1D の同時宣言でエラーを投げる", () => {
    expect(() => parseCubeLut("LUT_3D_SIZE 2\nLUT_1D_SIZE 2\n")).toThrow();
  });
});

describe("haldClutToLutData", () => {
  it("HALD の生 RGBA を 3D LUT へ変換する（ピクセル順=節点順）", () => {
    // size=2 の HALD は 8 ピクセル（2^3）。恒等の並びで作る
    const identity = createIdentityLut(2);
    const rgba = new Uint8Array(8 * 4);
    for (let p = 0; p < 8; p++) {
      rgba[p * 4] = Math.round(identity.data[p * 3] * 255);
      rgba[p * 4 + 1] = Math.round(identity.data[p * 3 + 1] * 255);
      rgba[p * 4 + 2] = Math.round(identity.data[p * 3 + 2] * 255);
      rgba[p * 4 + 3] = 255;
    }
    // 8 ピクセル = 2x4 の正方でない画像でも pixels が立方数なら受理する
    const lut = haldClutToLutData(rgba, 2, 4);
    expect(lut.size).toBe(2);
    expect(nodeAt(lut, 1, 0, 0)).toEqual([1, 0, 0]);
    expect(nodeAt(lut, 0, 0, 1)).toEqual([0, 0, 1]);
  });

  it("立方数でないピクセル数はエラーを投げる", () => {
    const rgba = new Uint8Array(5 * 4);
    expect(() => haldClutToLutData(rgba, 5, 1)).toThrow();
  });
});

describe("applyLutToPixel", () => {
  const swap = parseCubeLut(SWAP_RB_CUBE);

  it("strength=1 で LUT をフル適用する（R↔B 入替）", () => {
    const [r, g, b] = applyLutToPixel(0.8, 0.3, 0.1, swap, 1);
    expect(r).toBeCloseTo(0.1, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo(0.8, 5);
  });

  it("strength=0 で元色を返す（無変化）", () => {
    const [r, g, b] = applyLutToPixel(0.8, 0.3, 0.1, swap, 0);
    expect(r).toBeCloseTo(0.8, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo(0.1, 5);
  });

  it("strength=0.5 で元色と適用色を線形ブレンドする", () => {
    const [r, g, b] = applyLutToPixel(0.8, 0.3, 0.1, swap, 0.5);
    expect(r).toBeCloseTo((0.8 + 0.1) / 2, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo((0.1 + 0.8) / 2, 5);
  });

  it("恒等 LUT は色を変えない", () => {
    const identity = createIdentityLut(2);
    const [r, g, b] = applyLutToPixel(0.42, 0.7, 0.15, identity, 1);
    expect(r).toBeCloseTo(0.42, 5);
    expect(g).toBeCloseTo(0.7, 5);
    expect(b).toBeCloseTo(0.15, 5);
  });

  it("大きめの恒等 3D LUT でもトライリニア補間が中間値を保つ", () => {
    const identity = createIdentityLut(17);
    const [r, g, b] = applyLutToPixel(0.333, 0.666, 0.123, identity, 1);
    expect(r).toBeCloseTo(0.333, 3);
    expect(g).toBeCloseTo(0.666, 3);
    expect(b).toBeCloseTo(0.123, 3);
  });
});
