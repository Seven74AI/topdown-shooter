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
