import type { World } from "../core/world";
import type { Building } from "./buildings";

/**
 * Story 3.4: circles (players, zombies) against building boxes (FR53: neither passes a barricade).
 * `movePlayers` runs this on the server and in the client's prediction, so it uses only + − × ÷,
 * sqrt, min and max (the Story 2.6 rule: identical results in every JavaScript engine), visits the
 * buildings in id order, and allocates nothing.
 */

/** Below this centre-to-box distance the circle counts as inside the box (pushed out along the shortest axis). */
const INSIDE_EPS_M = 1e-9;

/** The circle (x, y, r) overlaps the box (strictly: touching is not an overlap). */
export function circleOverlapsBox(x: number, y: number, r: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  const cx = Math.min(maxX, Math.max(minX, x));
  const cy = Math.min(maxY, Math.max(minY, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/** The circle overlaps any building (`spotBlocked`, free-spot search). */
export function circleHitsBuilding(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}

/** `pushOutOfBuildings` result, reused by every caller (synchronous, so one record is enough). */
export const pushed = { x: 0, y: 0 };

/** `pushOutOfBuildings` outcomes. */
export const PUSH_NONE = 0;
export const PUSH_MOVED = 1;
/** No free spot was found near the target (a slot narrower than the body): stay at `from`. */
export const PUSH_STUCK = 2;
export type PushResult = typeof PUSH_NONE | typeof PUSH_MOVED | typeof PUSH_STUCK;

/** Passes over every building (and the map edge) before giving up (review H1: 2–4, bounded). */
const MAX_PASSES = 4;
/** Overlap left after the passes that still counts as "stuck" (float noise below it is fine). */
const STUCK_EPS_M = 1e-6;

/** One box's push on (px, py) into `pushed`; returns whether it moved. `fromX/fromY` picks the face when the centre is inside. */
function pushBox(b: Building, px: number, py: number, r: number, fromX: number, fromY: number): boolean {
  const cx = Math.min(b.maxX, Math.max(b.minX, px));
  const cy = Math.min(b.maxY, Math.max(b.minY, py));
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > INSIDE_EPS_M * INSIDE_EPS_M) {
    const d = Math.sqrt(d2);
    pushed.x = cx + (dx / d) * r;
    pushed.y = cy + (dy / d) * r;
    return true;
  }
  // Centre inside the box (review M1: a zombie shoved deep by a player): out across the face on the
  // side the circle came from, i.e. the face `from` lies beyond by the most; with `from` inside
  // too, the nearest face (ties: left, right, top, bottom).
  pushed.x = px;
  pushed.y = py;
  const outL = b.minX - fromX;
  const outR = fromX - b.maxX;
  const outT = b.minY - fromY;
  const outB = fromY - b.maxY;
  const out = Math.max(outL, outR, outT, outB);
  if (out > 0) {
    if (out === outL) pushed.x = b.minX - r;
    else if (out === outR) pushed.x = b.maxX + r;
    else if (out === outT) pushed.y = b.minY - r;
    else pushed.y = b.maxY + r;
    return true;
  }
  const left = px - b.minX;
  const right = b.maxX - px;
  const top = py - b.minY;
  const bottom = b.maxY - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pushed.x = b.minX - r;
  else if (m === right) pushed.x = b.maxX + r;
  else if (m === top) pushed.y = b.minY - r;
  else pushed.y = b.maxY + r;
  return true;
}

/**
 * Moves the circle (x, y, r) out of every building, keeping it inside the map: passes over all
 * buildings in id order, then the map clamp, until a pass moves nothing (at most MAX_PASSES). Each
 * push goes the shortest way out (away from the box's closest point, so a circle pressing on a face
 * slides along it); a centre that ended inside a box leaves on the side of `from` (where the circle
 * was before this move, outside every box). If the passes don't settle (a slot narrower than the
 * body, between two buildings or a building and the map edge) the result is PUSH_STUCK and `pushed`
 * is `from`: the circle doesn't move this tick (review H1). Writes `pushed` for every result.
 */
export function pushOutOfBuildings(
  world: Readonly<World>,
  x: number,
  y: number,
  r: number,
  fromX: number,
  fromY: number,
): PushResult {
  const list = world.buildings.list;
  const { widthM, heightM } = world.map;
  let px = x;
  let py = y;
  let moved = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let any = false;
    for (let i = 0; i < list.length; i++) {
      if (!pushBox(list[i] as Building, px, py, r, fromX, fromY)) continue;
      px = pushed.x;
      py = pushed.y;
      any = true;
    }
    const cx = Math.min(widthM - r, Math.max(r, px));
    const cy = Math.min(heightM - r, Math.max(r, py));
    if (cx !== px || cy !== py) {
      px = cx;
      py = cy;
      any = true;
    }
    if (!any) {
      pushed.x = px;
      pushed.y = py;
      return moved ? PUSH_MOVED : PUSH_NONE;
    }
    moved = true;
  }
  // Did the last pass leave it clear (within float noise)?
  const rr = r - STUCK_EPS_M;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (circleOverlapsBox(px, py, rr, b.minX, b.minY, b.maxX, b.maxY)) {
      pushed.x = fromX;
      pushed.y = fromY;
      return PUSH_STUCK;
    }
  }
  pushed.x = px;
  pushed.y = py;
  return PUSH_MOVED;
}
