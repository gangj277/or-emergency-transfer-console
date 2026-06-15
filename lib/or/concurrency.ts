/**
 * Generic bounded-concurrency map. Runs `runItem` over `items` with at most
 * `concurrency` tasks in flight at once, preserving input order in the result.
 *
 * Extracted so both the gold E2E harness and the live-capacity cache share one
 * worker-pool implementation instead of each rolling their own.
 */

export function clampWorkerCount(value: number | null | undefined, maxWorkers = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(maxWorkers, Math.max(1, Math.floor(Number(value))));
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  runItem: (item: T, index: number, workerId: number) => Promise<R>,
  onSettled?: (result: R, index: number) => void | Promise<void>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const boundedWorkerCount = Math.min(items.length, clampWorkerCount(concurrency));
  let cursor = 0;

  async function runWorker(workerId: number) {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      const result = await runItem(items[index], index, workerId);
      results[index] = result;
      await onSettled?.(result, index);
    }
  }

  await Promise.all(Array.from({ length: boundedWorkerCount }, (_, index) => runWorker(index + 1)));
  return results;
}
