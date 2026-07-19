import { describe, expect, it } from "vitest";
import {
  type ApplyScopeState,
  hasNonDefaultValue,
  migrateApplyScope,
  resolveScopedValueForIndex,
} from "../applyScope";

interface Value {
  amount: number;
}

const DEFAULT_VALUE: Value = { amount: 0 };
const isDefaultValue = (value: Value): boolean => value.amount === 0;

describe("resolveScopedValueForIndex", () => {
  it("一括モードでは全インデックスで共有値を返す", () => {
    const shared: Value = { amount: 10 };
    const state: ApplyScopeState<Value> = {
      applyToAll: true,
      shared,
      perImage: { 1: { amount: 99 } },
    };
    expect(resolveScopedValueForIndex(0, state, DEFAULT_VALUE)).toBe(shared);
    expect(resolveScopedValueForIndex(5, state, DEFAULT_VALUE)).toBe(shared);
  });

  it("画像ごとモードでは当該インデックスの値を返す", () => {
    const perImage: Record<number, Value> = {
      0: { amount: 1 },
      2: { amount: 2 },
    };
    const state: ApplyScopeState<Value> = {
      applyToAll: false,
      shared: { amount: 10 },
      perImage,
    };
    expect(resolveScopedValueForIndex(0, state, DEFAULT_VALUE)).toBe(
      perImage[0],
    );
    expect(resolveScopedValueForIndex(2, state, DEFAULT_VALUE)).toBe(
      perImage[2],
    );
  });

  it("画像ごとモードで未設定インデックスはデフォルト値を返す", () => {
    const state: ApplyScopeState<Value> = {
      applyToAll: false,
      shared: { amount: 10 },
      perImage: { 0: { amount: 1 } },
    };
    expect(resolveScopedValueForIndex(1, state, DEFAULT_VALUE)).toBe(
      DEFAULT_VALUE,
    );
  });

  it("デフォルトが null の値型（crop 領域相当）も解決できる", () => {
    const state: ApplyScopeState<Value | null> = {
      applyToAll: false,
      shared: { amount: 10 },
      perImage: { 0: null },
    };
    // 明示的に null が設定されたインデックスは ?? でデフォルト（null）へ落ちる
    expect(resolveScopedValueForIndex(0, state, null)).toBeNull();
    expect(resolveScopedValueForIndex(1, state, null)).toBeNull();
  });
});

describe("migrateApplyScope", () => {
  it("画像ごと→一括で現在表示中の値を共有値へ引き継ぐ", () => {
    const current: Value = { amount: 2 };
    const state: ApplyScopeState<Value> = {
      applyToAll: false,
      shared: { amount: 10 },
      perImage: { 1: current },
    };
    const next = migrateApplyScope(state, true, 1, DEFAULT_VALUE);
    expect(next.applyToAll).toBe(true);
    expect(next.shared).toBe(current);
    // 画像ごとの値は破棄せず保持する（再切替時に復元される）
    expect(next.perImage).toEqual({ 1: current });
  });

  it("画像ごと→一括で現在インデックスが未設定ならデフォルトを共有値にする", () => {
    const state: ApplyScopeState<Value> = {
      applyToAll: false,
      shared: { amount: 10 },
      perImage: { 0: { amount: 1 } },
    };
    const next = migrateApplyScope(state, true, 2, DEFAULT_VALUE);
    expect(next.shared).toBe(DEFAULT_VALUE);
  });

  it("一括→画像ごとで共有値を現在インデックスへ引き継ぎ、他インデックスは保持する", () => {
    const shared: Value = { amount: 10 };
    const other: Value = { amount: 5 };
    const state: ApplyScopeState<Value> = {
      applyToAll: true,
      shared,
      perImage: { 0: other },
    };
    const next = migrateApplyScope(state, false, 2, DEFAULT_VALUE);
    expect(next.applyToAll).toBe(false);
    expect(next.perImage[2]).toBe(shared);
    expect(next.perImage[0]).toBe(other);
    expect(next.shared).toBe(shared);
  });

  it("モードが変わらない場合は同じ状態オブジェクトをそのまま返す", () => {
    const state: ApplyScopeState<Value> = {
      applyToAll: true,
      shared: { amount: 10 },
      perImage: {},
    };
    expect(migrateApplyScope(state, true, 0, DEFAULT_VALUE)).toBe(state);
  });
});

describe("hasNonDefaultValue", () => {
  it("一括モードでは共有値のみで判定する", () => {
    expect(
      hasNonDefaultValue(
        { applyToAll: true, shared: { amount: 3 }, perImage: {} },
        isDefaultValue,
      ),
    ).toBe(true);
    expect(
      hasNonDefaultValue(
        {
          applyToAll: true,
          shared: DEFAULT_VALUE,
          perImage: { 0: { amount: 3 } },
        },
        isDefaultValue,
      ),
    ).toBe(false);
  });

  it("画像ごとモードではいずれかの画像に非デフォルト値があれば true", () => {
    expect(
      hasNonDefaultValue(
        {
          applyToAll: false,
          shared: { amount: 3 },
          perImage: { 0: DEFAULT_VALUE, 1: { amount: 1 } },
        },
        isDefaultValue,
      ),
    ).toBe(true);
    expect(
      hasNonDefaultValue(
        {
          applyToAll: false,
          shared: { amount: 3 },
          perImage: { 0: DEFAULT_VALUE },
        },
        isDefaultValue,
      ),
    ).toBe(false);
  });
});
