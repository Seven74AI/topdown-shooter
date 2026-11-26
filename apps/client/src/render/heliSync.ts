import { DESCEND_S, type HeliPhase } from "./heliPose";
import { TICK_RATE_HZ } from "@topdown/shared";

/** What `syncHeliToRun` drives (`HeliView`; a fake in tests). */
export interface HeliLike {
  readonly phase: HeliPhase;
  readonly hasLeft: boolean;
  opened(nowS: number, ageS?: number): void;
  left(nowS: number, extract: boolean, flyS?: number): void;
  reset(): void;
}

/**
 * Story 12.2: the helicopter against the run, once per frame (after the vote's own `opened`). Pure apart from the calls.
 * - A build phase clears a helicopter that is still on the pad (a backlog that skipped the lift-off) or that already
 *   flew off (review L4: a Stay lift-off at wave 10 must not hide a later endless extraction's fly-out from a phone
 *   that wakes straight into it). A Stay lift-off still in the air plays out.
 * - During the extraction (and on Results after it) it waits on the pad, then leaves at the server's lift-off tick, so
 *   a phone that wakes late jumps into the right moment of the fly-out (or sees it gone).
 */
export function syncHeliToRun(h: HeliLike, runPhase: string, extractStarted: boolean, liftedAtTick: number, tick: number, nowS: number, flyS: number): void {
  if (runPhase === "build" && (h.phase === "landed" || (h.hasLeft && h.phase === "gone"))) h.reset();
  if ((runPhase === "extract" || extractStarted) && !h.hasLeft) {
    if (h.phase === "gone") h.opened(nowS, DESCEND_S);
    if (liftedAtTick >= 0) h.left(nowS - Math.max(0, tick - liftedAtTick) / TICK_RATE_HZ, true, flyS);
  }
}
