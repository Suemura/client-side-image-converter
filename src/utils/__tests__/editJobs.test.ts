import { describe, expect, it } from "vitest";
import { DEFAULT_ADJUSTMENTS } from "../adjustments";
import type { ApplyScopeState } from "../applyScope";
import { buildEditJobs } from "../editJobs";
import { DEFAULT_LUT_SELECTION, type LutSelection } from "../lutState";
import { DEFAULT_TONE_CURVE, type ToneCurveState } from "../toneCurve";
import type { LutApplication } from "../webglImageRenderer";

const sharedScope = <T>(shared: T): ApplyScopeState<T> => ({
  applyToAll: true,
  shared,
  perImage: {},
});

const perImageScope = <T>(
  shared: T,
  perImage: Record<number, T>,
): ApplyScopeState<T> => ({ applyToAll: false, shared, perImage });

/** レジストリ解決の代役: lutId をそのまま data に見立てて返す */
const fakeResolveLut = (selection: LutSelection): LutApplication | null =>
  selection.lutId
    ? ({ data: selection.lutId, strength: selection.strength / 100 } as never)
    : null;

const liftedCurve: ToneCurveState = {
  ...DEFAULT_TONE_CURVE,
  rgb: [
    { x: 0, y: 0.1 },
    { x: 1, y: 1 },
  ],
};

describe("buildEditJobs", () => {
  it("ファイル数ぶんのジョブを一括モードの共有値で組み立てる", () => {
    const adjustments = { ...DEFAULT_ADJUSTMENTS, exposure: 30 };
    const jobs = buildEditJobs(
      3,
      sharedScope(adjustments),
      sharedScope<LutSelection>({ lutId: "warm", strength: 50 }),
      fakeResolveLut,
      sharedScope(DEFAULT_TONE_CURVE),
    );
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      expect(job.adjustments).toBe(adjustments);
      expect(job.lut).toEqual({ data: "warm", strength: 0.5 });
      // 恒等カーブは null（サンプリングをスキップ）
      expect(job.curve).toBeNull();
    }
  });

  it("画像ごとモードは当該インデックスの値、未設定はデフォルトで解決する", () => {
    const perAdjustments = { ...DEFAULT_ADJUSTMENTS, contrast: 40 };
    const jobs = buildEditJobs(
      2,
      perImageScope(DEFAULT_ADJUSTMENTS, { 1: perAdjustments }),
      perImageScope(DEFAULT_LUT_SELECTION, {
        0: { lutId: "mono", strength: 100 },
      }),
      fakeResolveLut,
      perImageScope(DEFAULT_TONE_CURVE, { 1: liftedCurve }),
    );
    expect(jobs[0].adjustments).toBe(DEFAULT_ADJUSTMENTS);
    expect(jobs[1].adjustments).toBe(perAdjustments);
    expect(jobs[0].lut).toEqual({ data: "mono", strength: 1 });
    expect(jobs[1].lut).toBeNull();
    expect(jobs[0].curve).toBeNull();
    expect(jobs[1].curve).toBeInstanceOf(Float32Array);
  });

  it("同じカーブ state のテーブルは重複焼成せず同一参照を共有する", () => {
    const jobs = buildEditJobs(
      3,
      sharedScope(DEFAULT_ADJUSTMENTS),
      sharedScope(DEFAULT_LUT_SELECTION),
      fakeResolveLut,
      sharedScope(liftedCurve),
    );
    expect(jobs[0].curve).toBeInstanceOf(Float32Array);
    expect(jobs[1].curve).toBe(jobs[0].curve);
    expect(jobs[2].curve).toBe(jobs[0].curve);
  });
});
