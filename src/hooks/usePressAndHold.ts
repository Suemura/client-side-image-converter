"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 長押し成立までの既定時間（ms） */
export const PRESS_AND_HOLD_DELAY_MS = 300;
/** 成立前にこの距離（px）以上ポインタが動いたらキャンセル（パン・ドラッグ開始とみなす） */
export const PRESS_AND_HOLD_MOVE_TOLERANCE_PX = 8;

/** usePressAndHold のオプション */
export interface UsePressAndHoldOptions {
  /** 長押し成立までの時間（ms）。既定 300ms */
  delayMs?: number;
  /** 成立前の移動キャンセルしきい値（px）。既定 8px */
  moveTolerancePx?: number;
  /** true の間は長押しを開始しない（進行中・成立中の長押しも即キャンセルする） */
  disabled?: boolean;
}

/** 長押し対象の要素へスプレッドする Pointer Events ハンドラ群 */
export interface PressAndHoldBind {
  onPointerDown: (e: React.PointerEvent<Element>) => void;
  onPointerMove: (e: React.PointerEvent<Element>) => void;
  onPointerUp: (e: React.PointerEvent<Element>) => void;
  onPointerCancel: (e: React.PointerEvent<Element>) => void;
  onPointerLeave: (e: React.PointerEvent<Element>) => void;
  onContextMenu: (e: React.MouseEvent<Element>) => void;
}

/** usePressAndHold の返却値 */
export interface PressAndHold {
  /** 長押しが成立して押し続けている間 true */
  active: boolean;
  /** 対象要素へスプレッドするイベントハンドラ */
  bind: PressAndHoldBind;
  /** 外部要因（別ドラッグの開始等）で進行中・成立中の長押しを破棄する */
  cancel: () => void;
}

/**
 * 「長押し（press & hold）している間だけ有効」なジェスチャーを判定する共有フック（#146）。
 *
 * - プライマリポインタの左ボタン / シングルタッチのみ受け付ける
 * - 押下から delayMs 経過で成立（active = true）。離すと即座に解除される
 * - 成立前に moveTolerancePx 以上動いた場合はキャンセル（パン・領域ドラッグ等の
 *   ドラッグ操作と競合させない）。成立後の移動は許容する
 * - タッチの長押しによるコンテキストメニューは押下中のみ抑止する
 */
export function usePressAndHold(
  options: UsePressAndHoldOptions = {},
): PressAndHold {
  const {
    delayMs = PRESS_AND_HOLD_DELAY_MS,
    moveTolerancePx = PRESS_AND_HOLD_MOVE_TOLERANCE_PX,
    disabled = false,
  } = options;

  const [active, setActive] = useState(false);
  // 追跡中のポインタ（押下位置と id）。null は非追跡
  const pressRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pressRef.current = null;
    setActive(false);
  }, []);

  // 無効化されたら進行中・成立中の長押しを破棄する（比較モード切替・AI 処理開始等）
  useEffect(() => {
    if (disabled) {
      cancel();
    }
  }, [disabled, cancel]);

  // アンマウント時に未発火のタイマーを破棄する
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<Element>) => {
      if (disabled) {
        return;
      }
      // 多点タッチ・右 / 中ボタンでは開始しない。2 本目のタッチ（ピンチ等）が来たら
      // 進行中の長押しも破棄する
      if (!e.isPrimary || e.button !== 0) {
        cancel();
        return;
      }
      cancel();
      pressRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (pressRef.current !== null) {
          setActive(true);
        }
      }, delayMs);
    },
    [disabled, delayMs, cancel],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<Element>) => {
      const press = pressRef.current;
      if (press === null || e.pointerId !== press.pointerId) {
        return;
      }
      // 成立後の移動は許容する（押し続けている限り表示を維持）
      if (timerRef.current === null) {
        return;
      }
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (Math.hypot(dx, dy) >= moveTolerancePx) {
        // しきい値内の移動でキャンセル = ドラッグ / パンの開始とみなす
        cancel();
      }
    },
    [moveTolerancePx, cancel],
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<Element>) => {
      const press = pressRef.current;
      if (press === null || e.pointerId !== press.pointerId) {
        return;
      }
      cancel();
    },
    [cancel],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<Element>) => {
    // タッチの長押しで OS のコンテキストメニューが開くと押しっぱなし判定が
    // 中断されるため、追跡中のみ抑止する
    if (pressRef.current !== null) {
      e.preventDefault();
    }
  }, []);

  const bind = useMemo<PressAndHoldBind>(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onPointerLeave: handlePointerEnd,
      onContextMenu: handleContextMenu,
    }),
    [handlePointerDown, handlePointerMove, handlePointerEnd, handleContextMenu],
  );

  return { active, bind, cancel };
}
