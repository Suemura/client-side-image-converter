import type React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESS_AND_HOLD_DELAY_MS,
  type UsePressAndHoldOptions,
  usePressAndHold,
} from "../usePressAndHold";

// React の act 警告を抑止するテスト環境フラグ
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** フックを装着したテスト用コンポーネント。active を data 属性へ反映する */
const Target: React.FC<{
  options?: UsePressAndHoldOptions;
  onCancelRef?: (cancel: () => void) => void;
}> = ({ options, onCancelRef }) => {
  const { active, bind, cancel } = usePressAndHold(options);
  onCancelRef?.(cancel);
  return (
    <div
      data-testid="target"
      data-active={active ? "true" : "false"}
      {...bind}
    />
  );
};

interface PointerInit {
  pointerId?: number;
  button?: number;
  isPrimary?: boolean;
  clientX?: number;
  clientY?: number;
}

/** happy-dom へ PointerEvent を dispatch する（React はルートで委譲して受け取る） */
const firePointer = (
  element: Element,
  type: string,
  init: PointerInit = {},
): void => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    isPrimary: init.isPrimary ?? true,
    clientX: init.clientX ?? 100,
    clientY: init.clientY ?? 100,
  });
  act(() => {
    element.dispatchEvent(event);
  });
};

describe("usePressAndHold", () => {
  let container: HTMLElement;
  let root: Root;

  const render = (
    options?: UsePressAndHoldOptions,
    onCancelRef?: (cancel: () => void) => void,
  ): HTMLElement => {
    act(() => {
      root.render(<Target options={options} onCancelRef={onCancelRef} />);
    });
    const target = container.querySelector('[data-testid="target"]');
    if (!(target instanceof HTMLElement)) {
      throw new Error("target not rendered");
    }
    return target;
  };

  const isActive = (): boolean =>
    container
      .querySelector('[data-testid="target"]')
      ?.getAttribute("data-active") === "true";

  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("しきい値時間の押下で成立し、離すと即解除される", () => {
    const target = render();
    firePointer(target, "pointerdown");
    expect(isActive()).toBe(false);
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
    firePointer(target, "pointerup");
    expect(isActive()).toBe(false);
  });

  it("しきい値時間前に離すと成立しない", () => {
    const target = render();
    firePointer(target, "pointerdown");
    advance(PRESS_AND_HOLD_DELAY_MS - 100);
    firePointer(target, "pointerup");
    advance(1000);
    expect(isActive()).toBe(false);
  });

  it("成立前にしきい値以上動くとキャンセルされる（ドラッグ開始とみなす）", () => {
    const target = render();
    firePointer(target, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(target, "pointermove", { clientX: 120, clientY: 100 });
    advance(1000);
    expect(isActive()).toBe(false);
  });

  it("しきい値未満の微小な移動では成立する", () => {
    const target = render();
    firePointer(target, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(target, "pointermove", { clientX: 103, clientY: 102 });
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
  });

  it("成立後の移動では解除されない（押し続けている限り維持）", () => {
    const target = render();
    firePointer(target, "pointerdown", { clientX: 100, clientY: 100 });
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
    firePointer(target, "pointermove", { clientX: 200, clientY: 200 });
    expect(isActive()).toBe(true);
    firePointer(target, "pointerup", { clientX: 200, clientY: 200 });
    expect(isActive()).toBe(false);
  });

  it("pointercancel（スクロール等のブラウザ介入）でキャンセルされる", () => {
    const target = render();
    firePointer(target, "pointerdown");
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
    firePointer(target, "pointercancel");
    expect(isActive()).toBe(false);
  });

  it("別ポインタの up では解除されない", () => {
    const target = render();
    firePointer(target, "pointerdown", { pointerId: 1 });
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
    firePointer(target, "pointerup", { pointerId: 9 });
    expect(isActive()).toBe(true);
    firePointer(target, "pointerup", { pointerId: 1 });
    expect(isActive()).toBe(false);
  });

  it("非プライマリポインタ（2 本目のタッチ）で進行中の長押しが破棄される", () => {
    const target = render();
    firePointer(target, "pointerdown", { pointerId: 1 });
    firePointer(target, "pointerdown", { pointerId: 2, isPrimary: false });
    advance(1000);
    expect(isActive()).toBe(false);
  });

  it("左ボタン以外の押下では開始しない", () => {
    const target = render();
    firePointer(target, "pointerdown", { button: 2 });
    advance(1000);
    expect(isActive()).toBe(false);
  });

  it("disabled のときは開始しない", () => {
    const target = render({ disabled: true });
    firePointer(target, "pointerdown");
    advance(1000);
    expect(isActive()).toBe(false);
  });

  it("成立中に disabled になると即解除される", () => {
    let target = render({ disabled: false });
    firePointer(target, "pointerdown");
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
    target = render({ disabled: true });
    expect(isActive()).toBe(false);
  });

  it("cancel() で外部から破棄できる（別ドラッグの開始等）", () => {
    let cancelFn: (() => void) | null = null;
    const target = render(undefined, (cancel) => {
      cancelFn = cancel;
    });
    firePointer(target, "pointerdown");
    advance(PRESS_AND_HOLD_DELAY_MS);
    expect(isActive()).toBe(true);
    act(() => {
      cancelFn?.();
    });
    expect(isActive()).toBe(false);
  });

  it("カスタム delayMs が反映される", () => {
    const target = render({ delayMs: 500 });
    firePointer(target, "pointerdown");
    advance(400);
    expect(isActive()).toBe(false);
    advance(100);
    expect(isActive()).toBe(true);
  });
});
