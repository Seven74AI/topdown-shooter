import type { PlayerStateView, RunPhase } from "@topdown/shared";

/**
 * Story 8.2 (J4, AC 4; Epic 8 D6): a late joiner who arrived during a wave or the evacuation vote is connected and
 * WATCHING — not in the World (no body, no target, no input), the camera on a teammate like an out player
 * (`spectateTarget`), with one plain line, and only ☰ (Leave) to press. They enter at the next build start.
 * Pure (tested); `NetSimHost.waiting` and the Game scene's status line read it.
 */
export const WAITING_TEXT = "Wave in progress, you'll join at the next build phase";
/** A build-phase joiner waits only while the server loads its unlocks and Training (≤ 2 s). */
export const JOINING_TEXT = "Joining…";

export interface WaitingView {
  /** I am watching: no body of mine, no controls but ☰, the camera on a teammate. */
  readonly waiting: boolean;
  /** The HUD status line while waiting ("" otherwise). */
  readonly line: string;
}

const NOT_WAITING: WaitingView = Object.freeze({ waiting: false, line: "" });
const WAITING: WaitingView = Object.freeze({ waiting: true, line: WAITING_TEXT });
const JOINING: WaitingView = Object.freeze({ waiting: true, line: JOINING_TEXT });

/** My schema entry (absent before it arrives) and the run phase → the waiting view. Never in the lobby or Results. */
export function waitingView(me: Pick<PlayerStateView, "waiting"> | undefined, phase: RunPhase | undefined): WaitingView {
  if (!me || me.waiting !== true) return NOT_WAITING;
  if (phase !== "build" && phase !== "wave" && phase !== "vote" && phase !== "extract") return NOT_WAITING; // Story 12.2
  return phase === "build" ? JOINING : WAITING; // build: the server's progress read (≤ 2 s), then the survivor enters

}
