import type { RunEnding } from "@topdown/shared";

/**
 * Story 6.11 (DW1 / DW2, D6) + 6.12 (D7): the dawn before Results, pure.
 *
 * - Extract after wave 10 → DW1 warm sunrise for `evac.dawnS` (4 s), then the Results card.
 * - Extract in endless → DW2 blue hour for 4 s, then Results.
 * - "Lost in the city" (a wipe after Stay) → DW2 behind the card at once (no wait: you lost).
 * - A wipe before any vote → no dawn.
 *
 * A tap skips the dawn (D6). The dawn plays only when the extract was seen live: a phone that
 * slept across it (hidden tab) or started the Game scene later gets Results straight away — the
 * dawn's end is a wall-clock time set when the extract was seen, so a late wake is past it.
 */
export type DawnLook = "none" | "dw1" | "dw2";

export function dawnLookFor(ending: RunEnding | string, endless: boolean): DawnLook {
  if (ending === "extracted") return endless ? "dw2" : "dw1";
  if (ending === "lost") return "dw2";
  return "none";
}

/** The 4 s dawn plays before the card (an extract); "lost" only colours the card's backdrop. */
export function dawnPlaysFirst(ending: RunEnding | string): boolean {
  return ending === "extracted";
}

/**
 * When the dawn ends (ms, the caller's clock): `seenAtMs + dawnS` for an extract seen live
 * (`live`), else `seenAtMs` (no dawn: a late wake or a late scene start).
 */
export function dawnEndsAt(ending: RunEnding | string, live: boolean, seenAtMs: number, dawnS: number): number {
  return dawnPlaysFirst(ending) && live ? seenAtMs + dawnS * 1000 : seenAtMs;
}

/** 0 → 1 over the dawn (1 = over: the card shows). A skip ends it at once. */
export function dawnProgress(nowMs: number, endsAtMs: number, dawnS: number, skipped: boolean): number {
  if (skipped || dawnS <= 0 || nowMs >= endsAtMs) return 1;
  return Math.max(0, 1 - (endsAtMs - nowMs) / (dawnS * 1000));
}
