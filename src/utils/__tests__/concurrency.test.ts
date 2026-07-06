import { describe, expect, it } from "vitest";
import { mapWithConcurrency, resolveConcurrency } from "../concurrency";

describe("resolveConcurrency", () => {
  it("hardwareConcurrency が有効なら件数との小さい方を返す", () => {
    expect(resolveConcurrency(8, 3)).toBe(3);
    expect(resolveConcurrency(4, 10)).toBe(4);
    expect(resolveConcurrency(4, 4)).toBe(4);
  });

  it("hardwareConcurrency が不明（undefined/0/NaN）なら fallback を使う", () => {
    expect(resolveConcurrency(undefined, 10)).toBe(4);
    expect(resolveConcurrency(0, 10)).toBe(4);
    expect(resolveConcurrency(Number.NaN, 10)).toBe(4);
    expect(resolveConcurrency(undefined, 10, 6)).toBe(6);
  });

  it("小数の hardwareConcurrency は切り捨てる", () => {
    expect(resolveConcurrency(3.9, 10)).toBe(3);
  });

  it("件数が 0 以下なら 0 を返す", () => {
    expect(resolveConcurrency(8, 0)).toBe(0);
    expect(resolveConcurrency(8, -1)).toBe(0);
  });

  it("下限は 1（fallback が件数を超えても件数側にクランプ）", () => {
    expect(resolveConcurrency(8, 1)).toBe(1);
    expect(resolveConcurrency(undefined, 1)).toBe(1);
  });
});

/** 指定ミリ秒待つ（並行実行の重なりを作るため） */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("全件を処理し、結果を入力順で返す", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(results).toEqual([
      { ok: true, value: 10 },
      { ok: true, value: 20 },
      { ok: true, value: 30 },
      { ok: true, value: 40 },
      { ok: true, value: 50 },
    ]);
  });

  it("完了順が入力順と異なっても入力順で返す", async () => {
    // 先頭ほど遅く完了させる
    const items = [30, 20, 10];
    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await delay(ms);
      return ms;
    });
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([30, 20, 10]);
  });

  it("同時実行数が concurrency を超えない", async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapWithConcurrency(items, 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(5);
      active -= 1;
      return true;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBe(3);
  });

  it("一部が reject しても全件処理を継続し、該当 index にエラーを記録する", async () => {
    const items = [1, 2, 3, 4];
    const results = await mapWithConcurrency(items, 2, async (n) => {
      if (n % 2 === 0) {
        throw new Error(`fail ${n}`);
      }
      return n;
    });
    expect(results[0]).toEqual({ ok: true, value: 1 });
    expect(results[1].ok).toBe(false);
    expect(results[2]).toEqual({ ok: true, value: 3 });
    expect(results[3].ok).toBe(false);
    if (!results[1].ok) {
      expect((results[1].error as Error).message).toBe("fail 2");
    }
  });

  it("settle ごとに進捗コールバックが (完了数, 総数) で呼ばれる", async () => {
    const items = [1, 2, 3];
    const progress: Array<[number, number]> = [];
    await mapWithConcurrency(
      items,
      1,
      async (n) => n,
      (completed, total) => {
        progress.push([completed, total]);
      },
    );
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("空配列は空の結果を返し、worker を呼ばない", async () => {
    let called = false;
    const results = await mapWithConcurrency([], 4, async () => {
      called = true;
      return 1;
    });
    expect(results).toEqual([]);
    expect(called).toBe(false);
  });

  it("worker には要素とインデックスが渡る", async () => {
    const items = ["a", "b", "c"];
    const seen: Array<[string, number]> = [];
    await mapWithConcurrency(items, 2, async (item, index) => {
      seen.push([item, index]);
      return index;
    });
    expect(seen.sort((a, b) => a[1] - b[1])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });
});
