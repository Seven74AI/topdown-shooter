import type { PlaceError, PlaceRequest, World } from "@topdown/shared";
import type { PendingPlacements } from "./pendingPlacements";

/** Story 5.18 (AC 7): a sent placement with no answer within `pendingTimeoutMs`. */
export const NO_ANSWER_TEXT = "No answer from the server";

/** What the pending frame needs from the sim host (`SimHost` has it all). */
export interface PendingFlowHost {
  readonly world: Readonly<World>;
  readonly localPlayerId: string;
  placeBuilding(req: PlaceRequest): void;
  takePlaceRefusal(): PlaceError | null;
  /** Review L1: refusals this host had to drop (its queue overflowed) since it started. */
  readonly placeRefusalsDropped: number;
}

/** The scene's side of one frame (one object, made once: no allocation per frame). */
export interface PendingFlowScene {
  /** Everything before the host steps: the placement step (may `add` boxes), the bar, Ready, the input. */
  beforeHost(): void;
  /** The host's step (it applies the latest state online). */
  stepHost(): void;
  toast(text: string): void;
  refusalText(e: PlaceError): string;
}

/**
 * Story 5.18 (review M2): one frame of the pending placements, in the only order that keeps them
 * right — shared by GameScene and the netsim test:
 *
 * 1. `update` (no timeouts): the phase/wave clear and boxes that became buildings, so the step's
 *    pending-aware check counts only real pending;
 * 2. `scene.beforeHost()` (the placement step; a Place adds a box);
 * 3. `pump` (the next queued box goes out, ≤ 4/s) + `update` (solo built it at once);
 * 4. `scene.stepHost()`;
 * 5. `update` with timeouts: the state the host just applied may carry my buildings and their
 *    charge (matched in the same frame: no double subtraction), and a box only times out once that
 *    state is in (review M1); timeouts toast "No answer from the server";
 * 6. every refusal the host hands on → the oldest unanswered box; toasted unless its box had timed
 *    out already (D7). A refusal the host dropped switches pairing off (review L1).
 */
export function runPendingFrame(pending: PendingPlacements, host: PendingFlowHost, nowMs: number, scene: PendingFlowScene, send: (req: PlaceRequest) => void, dropped: { seen: number }): void {
  pending.update(host.world, host.localPlayerId, nowMs, false);
  scene.beforeHost();
  pending.pump(nowMs, send);
  pending.update(host.world, host.localPlayerId, nowMs, false);
  scene.stepHost();
  if (pending.update(host.world, host.localPlayerId, nowMs, true) > 0) scene.toast(NO_ANSWER_TEXT);
  if (host.placeRefusalsDropped !== dropped.seen) {
    dropped.seen = host.placeRefusalsDropped;
    pending.lost();
  }
  for (let r = host.takePlaceRefusal(); r !== null; r = host.takePlaceRefusal()) {
    if (pending.refuse(r, nowMs) !== "ghost") scene.toast(scene.refusalText(r));
  }
}
