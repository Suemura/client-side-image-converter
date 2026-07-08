/**
 * LUT（色変換フィルタ）のパースと CPU 適用のコア型 / Canvas・WebGL・DOM 非依存の純粋ロジック。
 *
 * `.cube`（Adobe/Resolve 形式、1D / 3D）と HALD CLUT の生ピクセルを、下流（GPU の 3D テクスチャ /
 * CPU のトライリニア lookup）が単一の 3D グリッドだけを扱えばよいよう、常に正規化済みの 3D `LutData`
 * へ変換する（1D LUT はチャンネル分離のまま 3D グリッドへ厳密展開する）。
 *
 * GPU（`adjustmentShader.ts` の GLSL）と CPU（`applyLutToPixel`）の LUT 適用は、
 * ドメイン正規化 → 3D lookup（トライリニア）→ 強度ブレンドを同じ順序でミラーする
 * （`adjustments.ts` の `applyAdjustmentToPixel` を唯一の真実とするのと同方針）。
 *
 * Canvas / WebGL / DOM / fetch に依存しないため単体テスト対象
 * （cropGeometry.ts / adjustments.ts と同じ「純粋ロジックの切り出し」方針）。
 * PNG デコードや fetch などブラウザ依存の橋渡しは `lutLoader.ts` が担う。
 */

/**
 * 正規化済み 3D LUT データ。1D LUT や HALD CLUT もこの形へ揃えて保持する。
 *
 * `data` は RGB 三つ組の並びで長さ `size**3 * 3`。並び順は R が最速で
 * `index(r, g, b) = ((b * size + g) * size + r) * 3`（`.cube` の 3D データ順・WebGL2
 * `texImage3D` の (x=R, y=G, z=B) メモリ順のいずれとも一致する）。
 */
export interface LutData {
  /** 3D グリッドの 1 軸あたりの節点数（2 以上） */
  size: number;
  /** RGB 三つ組（各 [0,1] 目安）。長さ `size**3 * 3`、R 最速の並び */
  data: Float32Array;
  /** 入力ドメインの下限 [r, g, b]（既定 [0,0,0]） */
  domainMin: [number, number, number];
  /** 入力ドメインの上限 [r, g, b]（既定 [1,1,1]） */
  domainMax: [number, number, number];
  /** TITLE（任意） */
  title?: string;
}

/** 1D LUT を 3D へ展開する際のグリッドサイズ上限（分離可能変換のため節点値は厳密） */
export const LUT_1D_EXPAND_SIZE = 33;

/** 受理する 3D LUT サイズの上限（巨大メモリ確保のガード。一般的な .cube は 17/33/65） */
const MAX_3D_SIZE = 144;
/** 受理する 1D LUT エントリ数の上限 */
const MAX_1D_SIZE = 65536;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;

/**
 * `.cube` テキスト（1D / 3D）をパースして正規化済みの 3D `LutData` を返す。
 * `LUT_3D_SIZE` / `LUT_1D_SIZE` / `DOMAIN_MIN` / `DOMAIN_MAX` / `TITLE` に対応する。
 * 不正なフォーマット（サイズ未宣言 / 行数不整合 / 非数値など）では `Error` を投げる。
 */
export const parseCubeLut = (text: string): LutData => {
  const lines = text.split(/\r?\n/);
  let size3d = 0;
  let size1d = 0;
  let title: string | undefined;
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const rows: Array<[number, number, number]> = [];

  const parseTriple = (
    tokens: string[],
    label: string,
  ): [number, number, number] => {
    const nums = tokens.map(Number);
    if (nums.length !== 3 || !nums.every((n) => Number.isFinite(n))) {
      throw new Error(`Invalid ${label} in .cube file`);
    }
    return [nums[0], nums[1], nums[2]];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // 空行・コメント（# 始まり）はスキップ
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const tokens = line.split(/\s+/);
    const keyword = tokens[0].toUpperCase();

    if (keyword === "TITLE") {
      const quoted = line.match(/"([^"]*)"/);
      title = quoted ? quoted[1] : tokens.slice(1).join(" ");
      continue;
    }
    if (keyword === "LUT_3D_SIZE") {
      size3d = Number.parseInt(tokens[1], 10);
      if (!Number.isInteger(size3d)) {
        throw new Error("Invalid LUT_3D_SIZE in .cube file");
      }
      continue;
    }
    if (keyword === "LUT_1D_SIZE") {
      size1d = Number.parseInt(tokens[1], 10);
      if (!Number.isInteger(size1d)) {
        throw new Error("Invalid LUT_1D_SIZE in .cube file");
      }
      continue;
    }
    if (keyword === "DOMAIN_MIN") {
      const [r, g, b] = parseTriple(tokens.slice(1), "DOMAIN_MIN");
      domainMin[0] = r;
      domainMin[1] = g;
      domainMin[2] = b;
      continue;
    }
    if (keyword === "DOMAIN_MAX") {
      const [r, g, b] = parseTriple(tokens.slice(1), "DOMAIN_MAX");
      domainMax[0] = r;
      domainMax[1] = g;
      domainMax[2] = b;
      continue;
    }

    // それ以外はデータ行（RGB の 3 値）として扱う
    rows.push(parseTriple(tokens, "data line"));
  }

  if (size3d > 0 && size1d > 0) {
    throw new Error(
      "A .cube file cannot declare both LUT_3D_SIZE and LUT_1D_SIZE",
    );
  }

  if (size3d > 0) {
    if (size3d < 2 || size3d > MAX_3D_SIZE) {
      throw new Error(`Unsupported LUT_3D_SIZE: ${size3d}`);
    }
    const expected = size3d ** 3;
    if (rows.length !== expected) {
      throw new Error(
        `LUT_3D_SIZE ${size3d} expects ${expected} entries but found ${rows.length}`,
      );
    }
    const data = new Float32Array(expected * 3);
    for (let i = 0; i < expected; i++) {
      data[i * 3] = rows[i][0];
      data[i * 3 + 1] = rows[i][1];
      data[i * 3 + 2] = rows[i][2];
    }
    return { size: size3d, data, domainMin, domainMax, title };
  }

  if (size1d > 0) {
    if (size1d < 2 || size1d > MAX_1D_SIZE) {
      throw new Error(`Unsupported LUT_1D_SIZE: ${size1d}`);
    }
    if (rows.length !== size1d) {
      throw new Error(
        `LUT_1D_SIZE ${size1d} expects ${size1d} entries but found ${rows.length}`,
      );
    }
    return expand1dTo3d(rows, domainMin, domainMax, title);
  }

  throw new Error("Missing LUT_3D_SIZE or LUT_1D_SIZE in .cube file");
};

/** 1D 曲線（各行 RGB）を正規化位置 t([0,1]) で線形補間して 1 チャンネル値を返す */
const sampleCurve = (
  rows: Array<[number, number, number]>,
  channel: 0 | 1 | 2,
  t: number,
): number => {
  const n = rows.length;
  const x = clamp01(t) * (n - 1);
  const i0 = Math.floor(x);
  const i1 = Math.min(i0 + 1, n - 1);
  return mix(rows[i0][channel], rows[i1][channel], x - i0);
};

/**
 * 1D LUT（チャンネルごとに独立した曲線）を 3D `LutData` へ展開する。
 * 1D は各チャンネル独立の分離可能変換なので、3D グリッド節点へ厳密に展開でき、
 * トライリニア補間は各チャンネルの 1D 線形補間と等価になる（lookup 経路を 3D に一本化する）。
 */
const expand1dTo3d = (
  rows: Array<[number, number, number]>,
  domainMin: [number, number, number],
  domainMax: [number, number, number],
  title: string | undefined,
): LutData => {
  const size = Math.min(rows.length, LUT_1D_EXPAND_SIZE);
  const data = new Float32Array(size ** 3 * 3);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = ((b * size + g) * size + r) * 3;
        data[idx] = sampleCurve(rows, 0, r / (size - 1));
        data[idx + 1] = sampleCurve(rows, 1, g / (size - 1));
        data[idx + 2] = sampleCurve(rows, 2, b / (size - 1));
      }
    }
  }
  return { size, data, domainMin, domainMax, title };
};

/**
 * HALD CLUT の生 RGBA ピクセルを 3D `LutData` へ変換する。
 * HALD 画像はピクセルが R 最速の走査順で並ぶため、ピクセル線形インデックスがそのまま
 * LUT 節点インデックス（R 最速）に一致する。正方画像かつ総ピクセル数が立方数であることを要求する。
 */
export const haldClutToLutData = (
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): LutData => {
  const pixels = width * height;
  const size = Math.round(Math.cbrt(pixels));
  if (size < 2 || size ** 3 !== pixels) {
    throw new Error(`Invalid HALD CLUT dimensions: ${width}x${height}`);
  }
  // 巨大な HALD PNG による過大なメモリ確保を防ぐ（.cube の 3D と同じ上限でガード）
  if (size > MAX_3D_SIZE) {
    throw new Error(`Unsupported HALD CLUT size: ${size}`);
  }
  if (rgba.length < pixels * 4) {
    throw new Error("HALD CLUT pixel data is too short");
  }
  const data = new Float32Array(pixels * 3);
  for (let p = 0; p < pixels; p++) {
    data[p * 3] = rgba[p * 4] / 255;
    data[p * 3 + 1] = rgba[p * 4 + 1] / 255;
    data[p * 3 + 2] = rgba[p * 4 + 2] / 255;
  }
  return { size, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
};

/** 恒等 LUT（無変換）を生成する。WebGL の既定 3D テクスチャや単体テストの基準に使う */
export const createIdentityLut = (size = 2): LutData => {
  const data = new Float32Array(size ** 3 * 3);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const idx = ((b * size + g) * size + r) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return { size, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
};

/** 指定 3D グリッド節点の RGB を取り出す */
const sampleNode = (
  lut: LutData,
  ri: number,
  gi: number,
  bi: number,
): [number, number, number] => {
  const n = lut.size;
  const idx = ((bi * n + gi) * n + ri) * 3;
  return [lut.data[idx], lut.data[idx + 1], lut.data[idx + 2]];
};

/** 入力値を [min, max] のドメインで [0,1] に正規化する */
const domainNorm = (v: number, min: number, max: number): number => {
  if (max <= min) {
    return 0;
  }
  return clamp01((v - min) / (max - min));
};

const lerp3 = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

/**
 * 1 ピクセル（RGB, 各 [0,1]）に LUT をトライリニア補間で適用し、強度でブレンドして返す。
 * これが CPU（Canvas2D フォールバック）側の LUT 適用の定義であり、`adjustmentShader.ts` の
 * GLSL 側は同じ順序（ドメイン正規化 → トライリニア → strength ブレンド）でミラーする。
 *
 * @param strength 0（元色）〜 1（フル適用）のブレンド比
 */
export const applyLutToPixel = (
  r: number,
  g: number,
  b: number,
  lut: LutData,
  strength: number,
): [number, number, number] => {
  const n = lut.size;
  const fr = domainNorm(r, lut.domainMin[0], lut.domainMax[0]) * (n - 1);
  const fg = domainNorm(g, lut.domainMin[1], lut.domainMax[1]) * (n - 1);
  const fb = domainNorm(b, lut.domainMin[2], lut.domainMax[2]) * (n - 1);

  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, n - 1);
  const g1 = Math.min(g0 + 1, n - 1);
  const b1 = Math.min(b0 + 1, n - 1);
  const dr = fr - r0;
  const dg = fg - g0;
  const db = fb - b0;

  // R → G → B の順にトライリニア補間（GLSL の texture() の LINEAR サンプリングと同義）
  const c00 = lerp3(
    sampleNode(lut, r0, g0, b0),
    sampleNode(lut, r1, g0, b0),
    dr,
  );
  const c10 = lerp3(
    sampleNode(lut, r0, g1, b0),
    sampleNode(lut, r1, g1, b0),
    dr,
  );
  const c01 = lerp3(
    sampleNode(lut, r0, g0, b1),
    sampleNode(lut, r1, g0, b1),
    dr,
  );
  const c11 = lerp3(
    sampleNode(lut, r0, g1, b1),
    sampleNode(lut, r1, g1, b1),
    dr,
  );
  const c0 = lerp3(c00, c10, dg);
  const c1 = lerp3(c01, c11, dg);
  const graded = lerp3(c0, c1, db);

  return [
    mix(r, clamp01(graded[0]), strength),
    mix(g, clamp01(graded[1]), strength),
    mix(b, clamp01(graded[2]), strength),
  ];
};
