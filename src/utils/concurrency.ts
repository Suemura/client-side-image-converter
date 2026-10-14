/**
 * 並行実行のスケジューリングを行う純粋ロジック群
 *
 * Web Worker / OffscreenCanvas / DOM に非依存（worker 関数を注入する形にして
 * happy-dom でも単体テスト可能にする）。ワーカープールのジョブ投入はここに集約する。
 */

/**
 * 同時実行数を決定する。
 *
 * `navigator.hardwareConcurrency` が undefined / 0 / NaN の環境向けに既定値へフォールバックし、
 * ファイル数を超えて worker を起動しないようにクランプする（下限 1）。
 *
 * @param hardwareConcurrency - `navigator.hardwareConcurrency`（不明な場合は undefined）
 * @param itemCount - 処理対象の件数
 * @param fallback - hardwareConcurrency 不明時の既定値（既定 4）
 */
export const resolveConcurrency = (
  hardwareConcurrency: number | undefined,
  itemCount: number,
  fallback = 4,
): number => {
  const hc =
    typeof hardwareConcurrency === "number" &&
    Number.isFinite(hardwareConcurrency) &&
    hardwareConcurrency >= 1
      ? Math.floor(hardwareConcurrency)
      : fallback;
  if (itemCount <= 0) {
    return 0;
  }
  return Math.max(1, Math.min(hc, itemCount));
};

/**
 * 各要素を非同期 worker 関数で処理する。同時実行数を `concurrency` に制限しつつ、
 * 結果は **入力順** で返す（完了順ではない）。ある要素が reject しても他を継続し、
 * 該当インデックスにエラーを記録する（continue-on-error）。
 *
 * `onSettled` は 1 件 settle するたびに `(completedCount, total)` で呼ばれる（進捗表示用）。
 *
 * @param items - 処理対象の配列
 * @param concurrency - 同時実行数（1 以上）
 * @param worker - 要素とインデックスを受け取り結果 Promise を返す関数
 * @param onSettled - 各 settle 後に呼ばれる進捗コールバック
 * @returns 入力順の結果配列（成功は `{ ok: true, value }`、失敗は `{ ok: false, error }`）
 */
export type SettledResult<R> =
  | { ok: true; value: R }
  | { ok: false; error: unknown };

export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onSettled?: (completed: number, total: number) => void,
): Promise<SettledResult<R>[]> => {
  const total = items.length;
  const results: SettledResult<R>[] = new Array(total);
  const limit = Math.max(1, Math.floor(concurrency));

  let nextIndex = 0;
  let completed = 0;

  // 1 本のワーカーレーン: キューが空になるまで次のインデックスを取り出して処理する
  const runLane = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) {
        return;
      }
      try {
        const value = await worker(items[index], index);
        results[index] = { ok: true, value };
      } catch (error) {
        results[index] = { ok: false, error };
      }
      completed += 1;
      onSettled?.(completed, total);
    }
  };

  if (total === 0) {
    return results;
  }

  const laneCount = Math.min(limit, total);
  await Promise.all(Array.from({ length: laneCount }, () => runLane()));

  return results;
};
