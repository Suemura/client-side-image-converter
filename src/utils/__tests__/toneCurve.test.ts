import { describe, expect, it } from "vitest";
import { LUMA_WEIGHTS } from "../adjustments";
import {
  addCurvePoint,
  applyToneCurveToPixel,
  buildCurveLut,
  buildToneCurveTable,
  CURVE_LUT_SIZE,
  CURVE_POINT_MIN_GAP,
  type CurvePoint,
  DEFAULT_TONE_CURVE,
  evaluateCurve,
  isDefaultCurvePoints,
  isDefaultToneCurve,
  MAX_CURVE_POINTS,
  moveCurvePoint,
  removeCurvePoint,
  sampleCurveTable,
  type ToneCurveState,
} from "../toneCurve";

const identityPoints = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/** 中央を持ち上げた S 字前段のカーブ */
const liftedPoints = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.75 },
  { x: 1, y: 1 },
];

describe("evaluateCurve / buildCurveLut", () => {
  it("恒等カーブ（対角 2 点）は全域で y = x", () => {
    const lut = buildCurveLut(identityPoints());
    for (let i = 0; i < CURVE_LUT_SIZE; i++) {
      expect(lut[i]).toBeCloseTo(i / (CURVE_LUT_SIZE - 1), 6);
    }
  });

  it("カーブは制御点を通る（端点固定を含む）", () => {
    const points = liftedPoints();
    expect(evaluateCurve(points, 0)).toBe(0);
    expect(evaluateCurve(points, 0.5)).toBeCloseTo(0.75, 6);
    expect(evaluateCurve(points, 1)).toBe(1);
  });

  it("単調増加の制御点列では LUT が非減少（Fritsch–Carlson の単調性保証）", () => {
    const lut = buildCurveLut(liftedPoints());
    for (let i = 1; i < CURVE_LUT_SIZE; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it("出力は常に [0,1]（非オーバーシュート）", () => {
    // 極端な持ち上げ / 押し下げの混在でも範囲内
    const points: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 1 },
      { x: 0.9, y: 0 },
      { x: 1, y: 1 },
    ];
    const lut = buildCurveLut(points);
    for (let i = 0; i < CURVE_LUT_SIZE; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(1);
    }
  });

  it("水平区間（同じ y の隣接点）は平坦を維持する", () => {
    const points: CurvePoint[] = [
      { x: 0, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 1, y: 1 },
    ];
    expect(evaluateCurve(points, 0.2)).toBeCloseTo(0.5, 6);
  });

  it("端点 y を動かしたフェード（x=0 で y>0）を表現できる", () => {
    const points: CurvePoint[] = [
      { x: 0, y: 0.2 },
      { x: 1, y: 1 },
    ];
    expect(evaluateCurve(points, 0)).toBeCloseTo(0.2, 6);
    // 全域で持ち上がる
    expect(evaluateCurve(points, 0.5)).toBeGreaterThan(0.5);
  });

  it("制御点 2 点未満の縮退列は恒等として扱う", () => {
    expect(evaluateCurve([], 0.3)).toBeCloseTo(0.3, 6);
    expect(buildCurveLut([{ x: 0.5, y: 0.9 }])[128]).toBeCloseTo(128 / 255, 6);
  });
});

describe("制御点の操作", () => {
  it("addCurvePoint は x 昇順を維持して挿入する", () => {
    const next = addCurvePoint(identityPoints(), 0.5, 0.7);
    expect(next.map((p) => p.x)).toEqual([0, 0.5, 1]);
    expect(next[1].y).toBe(0.7);
  });

  it("addCurvePoint は既存点と最小間隔未満なら同じ配列参照を返す（拒否）", () => {
    const points = identityPoints();
    expect(addCurvePoint(points, CURVE_POINT_MIN_GAP / 2, 0.5)).toBe(points);
  });

  it("addCurvePoint は上限（MAX_CURVE_POINTS）を超えない", () => {
    let points = identityPoints();
    for (let i = 1; i < 30; i++) {
      points = addCurvePoint(points, i / 31, 0.5);
    }
    expect(points.length).toBeLessThanOrEqual(MAX_CURVE_POINTS);
    const rejected = addCurvePoint(points, 0.999, 0.5);
    expect(rejected).toBe(points);
  });

  it("moveCurvePoint は端点の x を固定し y のみ動かす", () => {
    const moved = moveCurvePoint(identityPoints(), 0, 0.4, 0.3);
    expect(moved[0]).toEqual({ x: 0, y: 0.3 });
    const movedLast = moveCurvePoint(identityPoints(), 1, 0.4, 0.6);
    expect(movedLast[1]).toEqual({ x: 1, y: 0.6 });
  });

  it("moveCurvePoint は内部点の x を隣接点 ± 最小間隔にクランプする", () => {
    const points = addCurvePoint(identityPoints(), 0.5, 0.5);
    const moved = moveCurvePoint(points, 1, 2, 0.5);
    expect(moved[1].x).toBeCloseTo(1 - CURVE_POINT_MIN_GAP, 9);
    const movedLeft = moveCurvePoint(points, 1, -1, 0.5);
    expect(movedLeft[1].x).toBeCloseTo(CURVE_POINT_MIN_GAP, 9);
  });

  it("moveCurvePoint は y を [0,1] にクランプし、元配列を変更しない", () => {
    const points = identityPoints();
    const moved = moveCurvePoint(points, 0, 0, 5);
    expect(moved[0].y).toBe(1);
    expect(points[0].y).toBe(0);
  });

  it("removeCurvePoint は内部点のみ削除でき、端点は保護される", () => {
    const points = addCurvePoint(identityPoints(), 0.5, 0.7);
    expect(removeCurvePoint(points, 1)).toHaveLength(2);
    expect(removeCurvePoint(points, 0)).toBe(points);
    expect(removeCurvePoint(points, 2)).toBe(points);
  });
});

/** 焼成時の 8bit 量子化（buildToneCurveTable と同式） */
const quantize8 = (v: number): number => Math.round(v * 255) / 255;

describe("buildToneCurveTable / sampleCurveTable", () => {
  it("RGBA インターリーブで .rgb にマスター、.a に輝度カーブを詰める（8bit 量子化済み）", () => {
    const state: ToneCurveState = {
      rgb: liftedPoints(),
      luminance: identityPoints(),
    };
    const table = buildToneCurveTable(state);
    expect(table).toHaveLength(CURVE_LUT_SIZE * 4);
    const master = buildCurveLut(liftedPoints());
    for (const i of [0, 64, 128, 255]) {
      // Float32Array 格納による丸めがあるため双方 fround で比較する
      const expected = Math.fround(quantize8(master[i]));
      expect(table[i * 4]).toBe(expected);
      expect(table[i * 4 + 1]).toBe(expected);
      expect(table[i * 4 + 2]).toBe(expected);
      // 輝度は恒等
      expect(table[i * 4 + 3]).toBeCloseTo(i / 255, 6);
    }
  });

  it("全エントリが 8bit 量子化済み（GPU の RGBA8 テクセルと同値。量子化は冪等）", () => {
    const table = buildToneCurveTable({
      rgb: liftedPoints(),
      luminance: liftedPoints(),
    });
    for (let k = 0; k < table.length; k++) {
      expect(table[k]).toBe(Math.fround(quantize8(table[k])));
    }
  });

  it("既定状態は恒等テーブルになる", () => {
    const table = buildToneCurveTable(DEFAULT_TONE_CURVE);
    for (const i of [0, 100, 255]) {
      for (let ch = 0; ch < 4; ch++) {
        expect(table[i * 4 + ch]).toBeCloseTo(i / 255, 6);
      }
    }
  });

  it("sampleCurveTable は floor + lerp の線形補間（GPU の LINEAR サンプリングと同式）", () => {
    const table = new Float32Array(CURVE_LUT_SIZE * 4);
    // R チャンネルへ階段状の値を入れて中間点の補間を確認する
    table[10 * 4] = 0.2;
    table[11 * 4] = 0.4;
    const v = 10.5 / (CURVE_LUT_SIZE - 1);
    expect(sampleCurveTable(table, 0, v)).toBeCloseTo(0.3, 6);
    // 範囲外はクランプ
    expect(sampleCurveTable(table, 0, -1)).toBe(table[0]);
    expect(sampleCurveTable(table, 0, 2)).toBe(table[255 * 4]);
  });
});

describe("applyToneCurveToPixel", () => {
  it("恒等テーブルでは変化しない", () => {
    const table = buildToneCurveTable(DEFAULT_TONE_CURVE);
    const [r, g, b] = applyToneCurveToPixel(0.25, 0.5, 0.75, table);
    expect(r).toBeCloseTo(0.25, 5);
    expect(g).toBeCloseTo(0.5, 5);
    expect(b).toBeCloseTo(0.75, 5);
  });

  it("マスターカーブの持ち上げで全チャンネルが増加する", () => {
    const table = buildToneCurveTable({
      rgb: liftedPoints(),
      luminance: identityPoints(),
    });
    const [r, g, b] = applyToneCurveToPixel(0.5, 0.5, 0.5, table);
    // 8bit 量子化（最大 ~1/510）と 256 エントリ補間の誤差を許容する
    expect(r).toBeCloseTo(0.75, 2);
    expect(g).toBeCloseTo(0.75, 2);
    expect(b).toBeCloseTo(0.75, 2);
  });

  it("輝度カーブは加算シフト（Rec.709 luma 基準で 3 チャンネル等量）として作用する", () => {
    const table = buildToneCurveTable({
      rgb: identityPoints(),
      luminance: liftedPoints(),
    });
    const input: [number, number, number] = [0.6, 0.5, 0.4];
    const luma =
      input[0] * LUMA_WEIGHTS[0] +
      input[1] * LUMA_WEIGHTS[1] +
      input[2] * LUMA_WEIGHTS[2];
    const expectedShift = sampleCurveTable(table, 3, luma) - luma;
    const [r, g, b] = applyToneCurveToPixel(...input, table);
    expect(r).toBeCloseTo(input[0] + expectedShift, 6);
    expect(g).toBeCloseTo(input[1] + expectedShift, 6);
    expect(b).toBeCloseTo(input[2] + expectedShift, 6);
    // チャンネル間の差（色味）は保たれる
    expect(r - g).toBeCloseTo(0.1, 5);
  });

  it("シフト後は [0,1] にクランプされる", () => {
    const table = buildToneCurveTable({
      rgb: identityPoints(),
      luminance: [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    const [r, g, b] = applyToneCurveToPixel(0.9, 0.9, 0.9, table);
    expect(r).toBe(1);
    expect(g).toBe(1);
    expect(b).toBe(1);
  });
});

describe("isDefaultToneCurve / isDefaultCurvePoints", () => {
  it("既定状態の判定", () => {
    expect(isDefaultToneCurve(DEFAULT_TONE_CURVE)).toBe(true);
    expect(isDefaultCurvePoints(identityPoints())).toBe(true);
    expect(isDefaultCurvePoints(liftedPoints())).toBe(false);
    expect(
      isDefaultToneCurve({ rgb: liftedPoints(), luminance: identityPoints() }),
    ).toBe(false);
  });
});
