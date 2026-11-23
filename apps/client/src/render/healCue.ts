/**
 * Story 5.10 (AC 9, D6): the heal cue from state, never from events (0 B/s). A player's cue shows
 * for `HEAL_CUE_MS` after their drawn HP (synced `player.hp`; solo: the World's) ROSE while their
 * body touches a station's ring on this copy. A revive or the build heal outside a ring shows none.
 */
export const HEAL_CUE_MS = 450;

interface Seen {
  hp: number;
  untilMs: number;
}

export class HealCue {
  private readonly seen = new Map<string, Seen>();

  /** Feed one player's HP this frame; returns whether the cue shows. */
  update(id: string, hp: number, inRing: boolean, nowMs: number): boolean {
    let s = this.seen.get(id);
    if (!s) {
      s = { hp, untilMs: -1 };
      this.seen.set(id, s);
    }
    if (hp > s.hp && inRing) s.untilMs = nowMs + HEAL_CUE_MS;
    s.hp = hp;
    return nowMs < s.untilMs;
  }

  clear(): void {
    this.seen.clear();
  }
}
