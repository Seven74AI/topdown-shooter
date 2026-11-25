/**
 * Stories 7.4 (AC 2) / 7.5 (AC 6): after the host taps Start, the server reads every member's progress (≤ 2 s) before
 * the run begins. The button says "Starting…" (and ignores taps) for that long, then falls back to "Start" if the
 * run didn't begin (a refused start: someone un-readied or left meanwhile). Pure (tested).
 */
export const STARTING_MS = 2500;

export const START_TEXT = { start: "Start", starting: "Starting…" } as const;

export function startButton(tappedAtMs: number | null, nowMs: number): { label: string; starting: boolean } {
  const starting = tappedAtMs !== null && nowMs - tappedAtMs < STARTING_MS;
  return { label: starting ? START_TEXT.starting : START_TEXT.start, starting };
}
