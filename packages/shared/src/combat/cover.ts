import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import type { Building } from "../buildings/buildings";

/**
 * Story 4.2: shots against cover (FR56, brief line 6).
 *
 * A projectile stops where its swept segment first enters a shot blocker (`world.obstacles.shotBlockers`:
 * the map's collision boxes and active cars and the bus); zombies further along are not hit. Used by
 * the server's projectiles (player, turret and rewound shots: one loop), the client's cosmetic
 * projectiles, aim assist and the turrets' target choice, so every copy agrees. Barriers, sandbags
 * and player barricades are not shot blockers. Only + − × ÷ min max: the same t in every engine.
 *
 * Cost (decision D5): Downtown has 14 shot blockers; each test rejects a box on the segment's
 * bounding box before the slab test, so a projectile step costs ~14 compares. No broadphase grid.
 */

/**
 * The parameter t ∈ [0, 1] at which the segment p0 + t·(dx, dy) enters the box's interior, or -1.
 * A start inside the box, or on a face moving in, is 0; touching a face or a corner (grazing) is no
 * entry; a start on a face moving out is no entry.
 */
export function segmentBoxEntryT(x0: number, y0: number, dx: number, dy: number, minX: number, minY: number, maxX: number, maxY: number): number {
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (x0 <= minX || x0 >= maxX) return -1;
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
    if (t0 >= t1) return -1;
  }
  if (dy === 0) {
    if (y0 <= minY || y0 >= maxY) return -1;
  } else {
    let a = (minY - y0) / dy;
    let b = (maxY - y0) / dy;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 >= t1) return -1;
  }
  return t0;
}

/**
 * The first t ∈ [0, 1] at which the segment (x0, y0) → (x1, y1) enters a shot blocker, or -1 if it
 * crosses none. Swept: a fast shot can't tunnel through a thin car between ticks.
 */
export function shotBlockT(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number): number {
  return firstEntryT(world.obstacles.shotBlockers, x0, y0, x1, y1);
}

/**
 * The first t ∈ [0, 1] at which a lobbed round's ground track (x0, y0) → (x1, y1) enters a real
 * building (`world.obstacles.lobBlockers`), or -1. The round flies over everything else.
 */
export function lobBlockT(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number): number {
  return firstEntryT(world.obstacles.lobBlockers, x0, y0, x1, y1);
}

function firstEntryT(list: readonly MapBox[], x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1);
  const hiY = Math.max(y0, y1);
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as MapBox;
    if (hiX < b.minX || loX > b.maxX || hiY < b.minY || loY > b.maxY) continue; // bounding boxes apart
    const t = segmentBoxEntryT(x0, y0, dx, dy, b.minX, b.minY, b.maxX, b.maxY);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/** No shot blocker between (x0, y0) and (x1, y1) (aim assist and turret targets: a shot there could land). */
export function shotLineClear(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number): boolean {
  return shotBlockT(world, x0, y0, x1, y1) < 0;
}

/**
 * Story 5.2 (designer decision, review round): melee can't hit through walls. True when the segment
 * from the wielder's centre (x0, y0) to the zombie's centre (x1, y1) enters no shot blocker (map
 * collision boxes, cars, the bus) and no WALL building (`solid`: barricades of every tier, turrets).
 * Low cover that bullets pass (barriers, sandbags) and floor buildings (spike traps, mines) don't
 * block. Grazing a face or a corner is clear (`segmentBoxEntryT`). Server, solo, and the client's
 * cosmetic cut feedback all call this one function. No allocation.
 */
export function meleeLineClear(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number): boolean {
  if (shotBlockT(world, x0, y0, x1, y1) >= 0) return false;
  const list = world.buildings.list;
  if (list.length === 0) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1);
  const hiY = Math.max(y0, y1);
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (!b.solid) continue;
    if (hiX < b.minX || loX > b.maxX || hiY < b.minY || loY > b.maxY) continue;
    if (segmentBoxEntryT(x0, y0, dx, dy, b.minX, b.minY, b.maxX, b.maxY) >= 0) return false;
  }
  return true;
}
