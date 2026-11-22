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

/**
 * Moves the circle (x, y, r) out of every building it overlaps, one pass in id order, along the
 * shortest way out: away from the box's closest point (so a circle pressing on a face slides along
 * it), or, with its centre inside the box, across the nearest face. Writes the result into `pushed`
 * and returns true when it moved. Buildings never overlap each other; in a tight inner corner the
 * second push can leave a sliver of overlap with the first box, which the next tick removes (each
 * tick moves a survivor ≤ 0.23 m, less than any radius, so nothing tunnels through a box).
 */
export function pushOutOfBuildings(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const list = world.buildings.list;
  let px = x;
  let py = y;
  let moved = false;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    const cx = Math.min(b.maxX, Math.max(b.minX, px));
    const cy = Math.min(b.maxY, Math.max(b.minY, py));
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    moved = true;
    if (d2 > INSIDE_EPS_M * INSIDE_EPS_M) {
      const d = Math.sqrt(d2);
      px = cx + (dx / d) * r;
      py = cy + (dy / d) * r;
      continue;
    }
    // Centre inside the box: out across the nearest face (ties: left, right, top, bottom).
    const left = px - b.minX;
    const right = b.maxX - px;
    const top = py - b.minY;
    const bottom = b.maxY - py;
    const m = Math.min(left, right, top, bottom);
    if (m === left) px = b.minX - r;
    else if (m === right) px = b.maxX + r;
    else if (m === top) py = b.minY - r;
    else py = b.maxY + r;
  }
  pushed.x = px;
  pushed.y = py;
  return moved;
}

/** The segment p0 + t·(dx, dy), t ∈ [0, 1], passes through the box's interior (slab test; touching is not a hit). */
export function segmentHitsBox(x0: number, y0: number, dx: number, dy: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (x0 <= minX || x0 >= maxX) return false;
  } else {
    let a = (minX - x0) / dx;
    let b = (maxX - x0) / dx;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 >= t1) return false;
  }
  if (dy === 0) return y0 > minY && y0 < maxY;
  let a = (minY - y0) / dy;
  let b = (maxY - y0) / dy;
  if (a > b) {
    const s = a;
    a = b;
    b = s;
  }
  t0 = Math.max(t0, a);
  t1 = Math.min(t1, b);
  return t0 < t1;
}

/**
 * Story 3.5: a circle of radius r moving in a straight line from (x0, y0) to (x1, y1) would hit a
 * building (each box grown by r on every side: conservative at the corners). Zombies walk straight
 * when this is false and follow the flow field otherwise.
 */
export function segmentHitsBuildings(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const list = world.buildings.list;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (segmentHitsBox(x0, y0, dx, dy, b.minX - r, b.minY - r, b.maxX + r, b.maxY + r)) return true;
  }
  return false;
}

/** Distance from (x, y) to the box (0 inside). */
export function distanceToBox(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number): number {
  const dx = x - Math.min(maxX, Math.max(minX, x));
  const dy = y - Math.min(maxY, Math.max(minY, y));
  return Math.sqrt(dx * dx + dy * dy);
}
