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

/**
 * Story 6.6 (F1, F2, AC 8): the charge lane as drawn — from the back of its body at the start to the
 * front of its body at the stop (the sweep's `lenM` + 2 × radius), the fixed direction's angle, and
 * the front point at the stop (where the CRASH mark goes). Pure, allocation-free (writes `out`).
 */
export interface LaneLook {
  /** The lane's back edge centre (the body's back at the start). */
  x0: number;
  y0: number;
  /** Drawn length (m). */
  lengthM: number;
  angle: number;
  /** The body's front at the stop (the CRASH bar). */
  frontX: number;
  frontY: number;
}

export function chargeLaneLook(cx: number, cy: number, dirX: number, dirY: number, lenM: number, radiusM: number, out: LaneLook): LaneLook {
  out.x0 = cx - dirX * radiusM;
  out.y0 = cy - dirY * radiusM;
  out.lengthM = lenM + 2 * radiusM;
  out.angle = Math.atan2(dirY, dirX);
  out.frontX = cx + dirX * (lenM + radiusM);
  out.frontY = cy + dirY * (lenM + radiusM);
  return out;
}

/** The tick the rush reaches the stop (the last rush tick): `hitTick + ceil(lenM / step) − 1` (0.6 m per tick). */
export function chargeStopTick(hitTick: number, lenM: number, speedMps: number): number {
  const step = speedMps * TICK_DT_S;
  return hitTick + Math.max(1, Math.ceil(lenM / step - 1e-9)) - 1;
}

/**
 * The charge lane's look at `nowServerTick`: the fill grows from the back over the telegraph (start
 * tick keyed, F3 of 6.5), stays full through the rush, then fades `TELEGRAPH_FADE_S` after the stop.
 */
export function chargeLaneProgress(nowServerTick: number, startTick: number, hitTick: number, stopTick: number, out: TelegraphLook): TelegraphLook {
  const len = hitTick - startTick;
  if (!(len > 0) || !(nowServerTick >= startTick - 1) || nowServerTick > stopTick + FADE_TICKS) {
    out.progress = 0;
    out.visible = false;
    out.alpha = 0;
    return out;
  }
  out.progress = Math.min(1, Math.max(0, (nowServerTick - startTick) / len));
  out.visible = true;
  out.alpha = nowServerTick <= stopTick ? 1 : Math.max(0, 1 - (nowServerTick - stopTick) / FADE_TICKS);
  return out;
}

/** Story 6.6 (F7): the throw's white inner ring shrinks from the full radius to 0 at the impact. */
export function throwInnerRadius(progress: number, radiusM: number): number {
  return radiusM * (1 - Math.min(1, Math.max(0, progress)));
}

/** `throwChunkAt` result: where the flying chunk is drawn (cosmetic arc). */
export interface ChunkLook {
  visible: boolean;
  x: number;
  y: number;
  /** Height above the road (m) on the arc: drawn as a lift and a scale. */
  heightM: number;
  /** 0–1 through the flight. */
  f: number;
}

/** Peak of the chunk's arc (m). Cosmetic only. */
export const CHUNK_ARC_M = 3;

/**
 * Story 6.6 (AC 8): the chunk flies from the boss (`fromX/Y` at the release) to the landing spot
 * between `releaseTick` and `hitTick` (the impact). Not visible before the release (it is in the
 * pose's hands) or after the impact (a crater then).
 */
export function throwChunkAt(nowServerTick: number, releaseTick: number, hitTick: number, fromX: number, fromY: number, toX: number, toY: number, out: ChunkLook): ChunkLook {
  const len = hitTick - releaseTick;
  if (!(len > 0) || nowServerTick < releaseTick || nowServerTick > hitTick) {
    out.visible = false;
    return out;
  }
  const f = (nowServerTick - releaseTick) / len;
  out.visible = true;
  out.f = f;
  out.x = fromX + (toX - fromX) * f;
  out.y = fromY + (toY - fromY) * f;
  out.heightM = 4 * CHUNK_ARC_M * f * (1 - f);
  return out;
}

/** Story 6.7 (D6): the collapse frame (0–2) by seconds since its death over `collapseS`. */
export function deathFrameIndex(sinceS: number, collapseS: number): 0 | 1 | 2 {
  const k = collapseS > 0 ? sinceS / collapseS : 1;
  return k < 1 / 3 ? 0 : k < 2 / 3 ? 1 : 2;
}

/**
 * Story 9.15 (G2 A): how far a throw's lift is (0–1), from the start tick to the release (`releaseTick` = the impact
 * minus the flight), for the throw pose by progress. 0 outside the lift's ticks or for an empty lift.
 */
export function throwLiftProgress(nowServerTick: number, startTick: number, releaseTick: number): number {
  const len = releaseTick - startTick;
  if (!(len > 0) || !(nowServerTick >= startTick)) return 0;
  return Math.min(1, (nowServerTick - startTick) / len);
}

/** Story 9.15 (G2 A): the charge / throw warning pose by progress: the half-way frame (0), then the full pose (1). */
export function warningPoseIndex(progress: number): 0 | 1 {
  return progress < 0.5 ? 0 : 1;
}
