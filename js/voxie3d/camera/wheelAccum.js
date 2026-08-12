/**
 * Accumulate wheel deltas into integer ±1 steps (slice / grid snap).
 * Trackpads emit many small deltas; mouse notches are ~100.
 * Cap at ±1 step per event so a single huge delta never skips cells.
 */

export const DEFAULT_SLICE_WHEEL_THRESHOLD = 80;

/**
 * @param {number} [threshold]
 */
export function createWheelAccumulator(threshold = DEFAULT_SLICE_WHEEL_THRESHOLD) {
  let accum = 0;
  const thr = Math.max(1, Number(threshold) || DEFAULT_SLICE_WHEEL_THRESHOLD);

  /**
   * @param {number} deltaY
   * @returns {0|1|-1} step direction (scroll up → +1, down → -1), matching forge slice nudge
   */
  function push(deltaY) {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
    accum += deltaY;
    if (accum >= thr) {
      accum = 0;
      return -1;
    }
    if (accum <= -thr) {
      accum = 0;
      return 1;
    }
    return 0;
  }

  function reset() {
    accum = 0;
  }

  return { push, reset, get accum() { return accum; } };
}
