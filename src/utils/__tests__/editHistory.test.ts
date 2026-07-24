import { describe, expect, it } from "vitest";
import {
  canRedoEditHistory,
  canUndoEditHistory,
  createEditHistory,
  currentEditState,
  EDIT_HISTORY_LIMIT,
  type EditHistoryStack,
  jumpEditHistory,
  pushEditHistory,
  redoEditHistory,
  undoEditHistory,
} from "../editHistory";

/** テスト用ラベル（studio のラベル構造に依存させない） */
type Label = string;

const create = (state: string): EditHistoryStack<string, Label> =>
  createEditHistory(state, "load", 1000);

const push = (
  stack: EditHistoryStack<string, Label>,
  state: string,
  limit?: number,
): { stack: EditHistoryStack<string, Label>; evicted: string[] } =>
  pushEditHistory(stack, state, `op:${state}`, 2000, limit);

describe("editHistory 基本操作", () => {
  it("初期状態は baseline のみで undo / redo とも不可", () => {
    const stack = create("a");
    expect(stack.nodes).toHaveLength(1);
    expect(currentEditState(stack)).toBe("a");
    expect(canUndoEditHistory(stack)).toBe(false);
    expect(canRedoEditHistory(stack)).toBe(false);
  });

  it("push で積まれ undo / redo で行き来できる", () => {
    let { stack } = push(create("a"), "b");
    ({ stack } = push(stack, "c"));
    expect(currentEditState(stack)).toBe("c");

    stack = undoEditHistory(stack);
    expect(currentEditState(stack)).toBe("b");
    expect(canRedoEditHistory(stack)).toBe(true);

    stack = undoEditHistory(stack);
    expect(currentEditState(stack)).toBe("a");
    expect(canUndoEditHistory(stack)).toBe(false);

    stack = redoEditHistory(stack);
    expect(currentEditState(stack)).toBe("b");
  });

  it("undo / redo 不可のときは同じ参照を返す", () => {
    const stack = create("a");
    expect(undoEditHistory(stack)).toBe(stack);
    expect(redoEditHistory(stack)).toBe(stack);
  });

  it("ノードにはラベルとタイムスタンプが残る", () => {
    const { stack } = push(create("a"), "b");
    expect(stack.nodes[0].label).toBe("load");
    expect(stack.nodes[0].timestamp).toBe(1000);
    expect(stack.nodes[1].label).toBe("op:b");
    expect(stack.nodes[1].timestamp).toBe(2000);
  });
});

describe("editHistory ジャンプ（任意時点への復帰）", () => {
  const build = (): EditHistoryStack<string, Label> => {
    let { stack } = push(create("a"), "b");
    ({ stack } = push(stack, "c"));
    ({ stack } = push(stack, "d"));
    return stack;
  };

  it("任意のノードへ移動でき、後方は破棄されず redo できる", () => {
    let stack = jumpEditHistory(build(), 1);
    expect(currentEditState(stack)).toBe("b");
    expect(stack.nodes).toHaveLength(4);
    expect(canRedoEditHistory(stack)).toBe(true);

    stack = redoEditHistory(stack);
    expect(currentEditState(stack)).toBe("c");
    stack = redoEditHistory(stack);
    expect(currentEditState(stack)).toBe("d");
  });

  it("範囲外・非整数・現在位置と同じ場合は同じ参照を返す", () => {
    const stack = build();
    expect(jumpEditHistory(stack, -1)).toBe(stack);
    expect(jumpEditHistory(stack, 4)).toBe(stack);
    expect(jumpEditHistory(stack, 1.5)).toBe(stack);
    expect(jumpEditHistory(stack, stack.index)).toBe(stack);
  });

  it("戻った位置から push すると後方（分岐）が破棄され evicted で返る", () => {
    const jumped = jumpEditHistory(build(), 1);
    const { stack, evicted } = push(jumped, "e");
    expect(currentEditState(stack)).toBe("e");
    expect(stack.nodes.map((node) => node.state)).toEqual(["a", "b", "e"]);
    expect(canRedoEditHistory(stack)).toBe(false);
    expect(evicted).toEqual(["c", "d"]);
  });
});

describe("editHistory 上限（baseline は pin）", () => {
  it("上限超過で baseline 直後から間引かれ evicted で返る", () => {
    let stack = create("s0");
    let allEvicted: string[] = [];
    for (let i = 1; i <= EDIT_HISTORY_LIMIT + 3; i++) {
      const result = push(stack, `s${i}`);
      stack = result.stack;
      allEvicted = [...allEvicted, ...result.evicted];
    }
    // baseline + 上限ぶんの後続ノード
    expect(stack.nodes).toHaveLength(EDIT_HISTORY_LIMIT + 1);
    expect(stack.nodes[0].state).toBe("s0");
    expect(allEvicted).toEqual(["s1", "s2", "s3"]);
    // 先頭（baseline）まで undo できる
    let cursor = stack;
    while (canUndoEditHistory(cursor)) {
      cursor = undoEditHistory(cursor);
    }
    expect(currentEditState(cursor)).toBe("s0");
  });

  it("カスタム上限を指定できる", () => {
    let { stack } = push(create("a"), "b", 1);
    const result = push(stack, "c", 1);
    stack = result.stack;
    expect(result.evicted).toEqual(["b"]);
    expect(stack.nodes.map((node) => node.state)).toEqual(["a", "c"]);
  });

  it("limit に 0 以下を渡しても push 直後の新規ノードは間引かれない", () => {
    const { stack, evicted } = push(create("a"), "b", 0);
    expect(currentEditState(stack)).toBe("b");
    expect(stack.nodes.map((node) => node.state)).toEqual(["a", "b"]);
    expect(evicted).toEqual([]);
  });
});
