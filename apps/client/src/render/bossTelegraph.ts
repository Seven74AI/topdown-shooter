import { TICK_DT_S } from "@topdown/shared";

/**
 * Story 6.5 (F3, DD4, brief 21b): how far a boss telegraph's fill is, from the server's ticks — never
 * from when the message arrived. `nowServerTick` is the host's estimate of the server tick (online:
 * `ServerClock.estimateTick`; solo: `world.tick`). The fill reaches the edge exactly at `hitTick` (the
 * tick the server resolves the hit), then the ring fades for `TELEGRAPH_FADE_S`; past that it is not
 * drawn at all (a woken tab or a late Game scene never shows a finished telegraph).
 */
export const TELEGRAPH_FADE_S = 0.3;
const FADE_TICKS = TELEGRAPH_FADE_S / TICK_DT_S;

export interface TelegraphLook {
  /** Fill 0–1 (1 from the hit tick on). */
  progress: number;
  /** Drawn at all. */
  visible: boolean;
  /** Opacity: 1 until the hit, then fading to 0 over the fade. */
  alpha: number;
}

/** Writes the telegraph's look at `nowServerTick` into `out` (allocation-free). */
export function telegraphProgress(nowServerTick: number, startTick: number, hitTick: number, out: TelegraphLook): TelegraphLook {
  const len = hitTick - startTick;
  if (!(len > 0) || !(nowServerTick >= startTick - 1) || nowServerTick > hitTick + FADE_TICKS) {
    out.progress = 0;
    out.visible = false;
    out.alpha = 0;
    return out;
  }
  out.progress = Math.min(1, Math.max(0, (nowServerTick - startTick) / len));
  out.visible = true;
  out.alpha = nowServerTick <= hitTick ? 1 : Math.max(0, 1 - (nowServerTick - hitTick) / FADE_TICKS);
  return out;
}

/** The slam pose frame for a fill (arms rising: 3 frames). */
export function slamFrameIndex(progress: number): 0 | 1 | 2 {
  return progress < 1 / 3 ? 0 : progress < 2 / 3 ? 1 : 2;
}
