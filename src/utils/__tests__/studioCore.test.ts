import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  resolveExportIndices,
  resolveResizeDimensions,
  resolveSelectionAfterRemove,
  STUDIO_HISTORY_LIMIT,
  undoHistory,
} from "../studioCore";

describe("studioCore 履歴", () => {
  it("初期状態は undo / redo とも不可", () => {
    const history = createHistory("a");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("push で past に積まれ undo / redo で行き来できる", () => {
    let { history } = pushHistory(createHistory("a"), "b");
    ({ history } = pushHistory(history, "c"));
    expect(history.present).toBe("c");
    expect(canUndo(history)).toBe(true);

    history = undoHistory(history);
    expect(history.present).toBe("b");
    expect(canRedo(history)).toBe(true);

    history = undoHistory(history);
    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);

    history = redoHistory(history);
    expect(history.present).toBe("b");
  });

  it("undo 不可のときは同じ参照を返す", () => {
    const history = createHistory("a");
    expect(undoHistory(history)).toBe(history);
    expect(redoHistory(history)).toBe(history);
  });

  it("push は future を破棄する", () => {
    let { history } = pushHistory(createHistory("a"), "b");
    history = undoHistory(history);
    ({ history } = pushHistory(history, "c"));
    expect(history.present).toBe("c");
    expect(canRedo(history)).toBe(false);
    expect(history.past).toEqual(["a"]);
  });

  it("上限を超えると最古のスナップショットが evicted で返る", () => {
    let history = createHistory(0);
    let allEvicted: number[] = [];
    for (let i = 1; i <= STUDIO_HISTORY_LIMIT + 3; i++) {
      const result = pushHistory(history, i);
      history = result.history;
      allEvicted = [...allEvicted, ...result.evicted];
    }
    expect(history.past).toHaveLength(STUDIO_HISTORY_LIMIT);
    expect(allEvicted).toEqual([0, 1, 2]);
    // 上限まで undo できる
    let cursor = history;
    let undoCount = 0;
    while (canUndo(cursor)) {
      cursor = undoHistory(cursor);
      undoCount++;
    }
    expect(undoCount).toBe(STUDIO_HISTORY_LIMIT);
  });

  it("カスタム上限を指定できる", () => {
    let history = createHistory("a");
    ({ history } = pushHistory(history, "b", 1));
    const { history: next, evicted } = pushHistory(history, "c", 1);
    expect(evicted).toEqual(["a"]);
    expect(next.past).toEqual(["b"]);
  });
});

describe("resolveResizeDimensions", () => {
  it("幅・高さとも未指定なら null", () => {
    expect(resolveResizeDimensions(400, 300, { keepAspect: true })).toBeNull();
  });

  it("不正値（0 / 負 / NaN）は未指定扱い", () => {
    expect(
      resolveResizeDimensions(400, 300, {
        width: 0,
        height: Number.NaN,
        keepAspect: true,
      }),
    ).toBeNull();
    expect(
      resolveResizeDimensions(400, 300, { width: -100, keepAspect: false }),
    ).toBeNull();
  });

  it("keepAspect + 幅のみ指定は高さをアスペクト比から算出", () => {
    expect(
      resolveResizeDimensions(400, 300, { width: 200, keepAspect: true }),
    ).toEqual({ width: 200, height: 150 });
  });

  it("keepAspect + 高さのみ指定は幅をアスペクト比から算出", () => {
    expect(
      resolveResizeDimensions(400, 300, { height: 150, keepAspect: true }),
    ).toEqual({ width: 200, height: 150 });
  });

  it("keepAspect + 両方指定は内接（contain）", () => {
    expect(
      resolveResizeDimensions(400, 300, {
        width: 200,
        height: 200,
        keepAspect: true,
      }),
    ).toEqual({ width: 200, height: 150 });
  });

  it("keepAspect でない場合は指定値そのまま・未指定側は元寸法", () => {
    expect(
      resolveResizeDimensions(400, 300, {
        width: 200,
        height: 100,
        keepAspect: false,
      }),
    ).toEqual({ width: 200, height: 100 });
    expect(
      resolveResizeDimensions(400, 300, { width: 200, keepAspect: false }),
    ).toEqual({ width: 200, height: 300 });
  });

  it("元寸法と同じ結果は null（リサイズ不要）", () => {
    expect(
      resolveResizeDimensions(400, 300, { width: 400, keepAspect: true }),
    ).toBeNull();
  });

  it("極端な縮小でも 1px 未満にならない", () => {
    expect(
      resolveResizeDimensions(4000, 2, { width: 10, keepAspect: true }),
    ).toEqual({ width: 10, height: 1 });
  });

  it("元寸法が不正なら null", () => {
    expect(
      resolveResizeDimensions(0, 300, { width: 100, keepAspect: true }),
    ).toBeNull();
  });
});

describe("resolveExportIndices", () => {
  it("all は全インデックス", () => {
    expect(resolveExportIndices("all", 1, 3)).toEqual([0, 1, 2]);
  });

  it("current は選択中のみ", () => {
    expect(resolveExportIndices("current", 1, 3)).toEqual([1]);
  });

  it("画像なし・範囲外は空", () => {
    expect(resolveExportIndices("all", 0, 0)).toEqual([]);
    expect(resolveExportIndices("current", 5, 3)).toEqual([]);
    expect(resolveExportIndices("current", -1, 3)).toEqual([]);
  });
});

describe("resolveSelectionAfterRemove", () => {
  it("選択より前の削除は選択を 1 つ詰める", () => {
    expect(resolveSelectionAfterRemove(0, 2, 3)).toBe(1);
  });

  it("選択自身の削除は同じ位置（次の画像）を維持", () => {
    expect(resolveSelectionAfterRemove(1, 1, 3)).toBe(1);
  });

  it("末尾選択の削除は 1 つ前へ", () => {
    expect(resolveSelectionAfterRemove(2, 2, 2)).toBe(1);
  });

  it("全削除は 0", () => {
    expect(resolveSelectionAfterRemove(0, 0, 0)).toBe(0);
  });
});
