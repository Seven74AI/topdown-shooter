import type { SimEvent } from "@topdown/shared";

/**
 * Story 4.8: how long after the server's last fire hit (`player.damaged` with no zombie source) a
 * survivor still shows the hurt cue. A bit longer than the damage pulse (`decay.json › fire.pulseS`
 * 0.5 s), so a player standing in fire shows it without a gap.
 */
export const FIRE_CUE_MS = 700;

/** A `player.damaged` event that came from fire (Story 4.8: the only zombie-less damage source). */
export function isFireHit(e: SimEvent): e is Extract<SimEvent, { type: "player.damaged" }> {
  return e.type === "player.damaged" && e.sourceZombieId < 0;
}

/**
 * Story 4.8: the hurt cue for players in fire, driven only by the server's damage events (brief
 * line 12: the client shows server truth; solo: the same events). `hit` per fire event, `burning`
 * per frame (a Map lookup, no allocation).
 */
export class FireCue {
  private readonly lastHitMs = new Map<string, number>();

  hit(playerId: string, nowMs: number): void {
    this.lastHitMs.set(playerId, nowMs);
  }

  burning(playerId: string, nowMs: number): boolean {
    const t = this.lastHitMs.get(playerId);
    return t !== undefined && nowMs - t < FIRE_CUE_MS;
  }

  clear(): void {
    this.lastHitMs.clear();
  }
}
