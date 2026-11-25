import { INPUT_QUEUE_TARGET } from "@topdown/shared";
import { INPUT_SLOW_AFTER_PATCHES, INPUT_SLOW_STEP_RATE } from "./netConfig";

/**
 * Story 8.9 (decision 8.9 D5, AC 5): how fast my 50 ms input steps run. The server reports how
 * many of my inputs wait in its queue (`PlayerState.inputQueued`, the depth its own drain rule
 * reads, when its last tick started). Above INPUT_QUEUE_TARGET for INPUT_SLOW_AFTER_PATCHES patches
 * in a row, my steps run at 0.9× until a patch reports it back at the target, so a post-stall
 * backlog empties without the server skipping inputs. Never faster than 1×.
 *
 * Used by NetSimHost and the netsim harness (brief 20: one rule). A client that ignores it only
 * keeps its own backlog (the server's 2 s drain still empties it); one that slows more only
 * starves its own survivor (the server holds it still and pauses its weapon, Story 2.4).
 */
export class StepPacing {
  /** Step rate: 1 or INPUT_SLOW_STEP_RATE. */
  rate = 1;
  /** The last reported depth (overlay). */
  queued = 0;
  private overPatches = 0;

  /** A new patch reported `queued` of my inputs waiting on the server. */
  onPatch(queued: number): void {
    this.queued = queued;
    if (queued > INPUT_QUEUE_TARGET) {
      if (this.overPatches < INPUT_SLOW_AFTER_PATCHES) this.overPatches++;
      if (this.overPatches >= INPUT_SLOW_AFTER_PATCHES) this.rate = INPUT_SLOW_STEP_RATE;
    } else {
      this.overPatches = 0;
      this.rate = 1;
    }
  }

  /** The step rate for this frame (from the last report). */
  frame(): number {
    return this.rate;
  }

  reset(): void {
    this.rate = 1;
    this.queued = 0;
    this.overPatches = 0;
  }
}
