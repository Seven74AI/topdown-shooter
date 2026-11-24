import { TICK_DT_S } from "../config/constants";
import type { World } from "../core/world";
import { queryRadius } from "../core/spatialGrid";
import { type Building, damageBuilding } from "../buildings/buildings";
import { circleOverlapsBox, pushOutOfBuildings, pushed } from "../buildings/collision";
import { applyZombieDamage, damagePlayerBy } from "../combat/damage";
import { zombieCandidates as candidates } from "../combat/scratch";
import type { MapBox } from "../map/districtMap";
import { knockPlayerDir } from "../player/knockback";
import type { PlayerState } from "../player/player";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { MAX_PLAYERS } from "../net/messages";
import { bossSlotOf } from "./target";
import { bossStats } from "./telegraph";

/**
 * Story 6.6 (F1–F6, DD1–DD3): the Behemoth's charge.
 *
 * - The lane is swept ONCE, at the telegraph's start (`sweepChargeLane`): its 2 m body steps
 *   `sweepStepM` along the direction against `world.obstacles.solids` (every map box bodies collide
 *   with: walls, cars, the bus, pumps, sandbags, police barriers, the dumpster, 6.2's rubble — the
 *   generic list, no object types named here) and the map edge. Player buildings are not in it (F2,
 *   F6: it smashes them). The first step that overlaps ends the lane at the previous step with
 *   `crash = true`; a clean `distM` gives `crash = false`.
 * - The rush moves its centre `speedMps × dt` (0.6 m) per tick along the fixed lane to `lenM`; the
 *   map solids only change at build starts, so the swept path stays clear (no push-out; the fuzz
 *   asserts it). Each tick it smashes every player building its body touches (no refund; mines and
 *   traps don't go off), tramples zombies it newly overlaps, and hits each standing player once
 *   whose centre is within `laneWidthM / 2 − edgeGraceM` of the segment it moved this tick (DD3: no
 *   tunnelling) and inside the drawn length; the hit shoves them sideways (DD2), never along.
 */

/** `sweepChargeLane` result (reused). */
export interface ChargeLane {
  lenM: number;
  crash: boolean;
}

export const chargeLane: ChargeLane = { lenM: 0, crash: false };

/** The circle (x, y, r) overlaps a map solid or crosses the map edge. */
function bodyBlocked(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const { widthM, heightM } = world.map;
  if (x - r < 0 || y - r < 0 || x + r > widthM || y + r > heightM) return true;
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as MapBox;
    if (circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}

/**
 * AC 2: sweeps the 2 m body from (x, y) along the unit (dirX, dirY), `sweepStepM` at a time up to
 * `distM`. Writes `out` (allocation-free). Steps are counted in whole steps so every rush position
 * (0.6 m = 6 steps) is a swept sample.
 */
export function sweepChargeLane(world: Readonly<World>, x: number, y: number, dirX: number, dirY: number, out: ChargeLane = chargeLane): ChargeLane {
  const c = world.balance.boss.charge;
  const r = world.balance.boss.radiusM;
  const stepM = c.sweepStepM;
  const steps = Math.round(c.distM / stepM);
  out.crash = false;
  out.lenM = 0;
  if (bodyBlocked(world, x, y, r)) {
    out.crash = true; // already touching: a 0 m lane (never picked: minLaneM)
    return out;
  }
  for (let k = 1; k <= steps; k++) {
    const d = k * stepM;
    if (bodyBlocked(world, x + dirX * d, y + dirY * d, r)) {
      out.lenM = (k - 1) * stepM;
      out.crash = true;
      return out;
    }
  }
  out.lenM = steps * stepM;
  return out;
}

/** Distance² from (px, py) to the segment (ax, ay)–(bx, by). */
function distToSegment2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + dx * t);
  const ey = py - (ay + dy * t);
  return ex * ex + ey * ey;
}

/**
 * F3 (brief 21c, DD3): a centre (px, py) is hit by this tick's rush segment (ax, ay)–(bx, by):
 * within `laneWidthM / 2 − edgeGraceM` (2.15 m) of the segment, and inside the drawn lane's length
 * (from the body's back at the start to its front at the stop, less the grace).
 */
export function chargeHitsPoint(world: Readonly<World>, px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const a = world.boss.attack;
  const bal = world.balance.boss;
  const half = a.widthM / 2 - bal.edgeGraceM;
  if (half <= 0) return false;
  const s = (px - a.cx) * a.dirX + (py - a.cy) * a.dirY; // along the lane from its start centre
  const R = bal.radiusM;
  if (s < -R + bal.edgeGraceM || s > a.lenM + R - bal.edgeGraceM) return false;
  return distToSegment2(px, py, ax, ay, bx, by) <= half * half;
}

/**
 * F3: the body already overlaps a survivor whose centre is inside the 2.15 m band (and the drawn
 * length): hit now. Without it the body's push-out (D1) would move a survivor at 2.14 m aside a tick
 * before this tick's segment comes within 2.15 m of them (the body is 2.4 m wide with them).
 */
function bodyReachesInLane(world: Readonly<World>, p: Readonly<PlayerState>): boolean {
  const b = world.boss;
  const a = b.attack;
  const bal = world.balance.boss;
  const min = bal.radiusM + p.radiusM;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  if (dx * dx + dy * dy >= min * min) return false;
  const half = a.widthM / 2 - bal.edgeGraceM;
  const perp = -(p.x - a.cx) * a.dirY + (p.y - a.cy) * a.dirX;
  if (perp > half || perp < -half) return false;
  const s = (p.x - a.cx) * a.dirX + (p.y - a.cy) * a.dirY;
  return s >= -bal.radiusM + bal.edgeGraceM && s <= a.lenM + bal.radiusM - bal.edgeGraceM;
}

/** Rush pass state (synchronous, one record). */
const pass = { world: null as World | null, ax: 0, ay: 0, bx: 0, by: 0, i: 0 };

/** Bits of `attack.hitMask` (a 32-bit integer): player slots first, then slot-less players by their order. */
export const CHARGE_HIT_BITS = 31;

const hitPlayer = (p: PlayerState): void => {
  const world = pass.world as World;
  const order = pass.i++;
  if (p.status !== "alive") return; // F10: downed / out never hit or shoved
  const a = world.boss.attack;
  // Review L1: a player without a slot (a dev room, a failed claim) still gets a bit — after the
  // MAX_PLAYERS slot bits, by its order in the World — so F4 "once per charge" holds for everyone.
  // Past the 31 bits there is nothing to track it with: it is never hit (the safe side).
  const slot = bossSlotOf(world, p.id);
  const index = slot >= 0 ? slot : MAX_PLAYERS + order;
  if (index >= CHARGE_HIT_BITS) return;
  const bit = 1 << index;
  if ((a.hitMask & bit) !== 0) return; // F4: once per charge
  if (!chargeHitsPoint(world, p.x, p.y, pass.ax, pass.ay, pass.bx, pass.by) && !bodyReachesInLane(world, p)) return;
  a.hitMask |= bit;
  const c = world.balance.boss.charge;
  if (damagePlayerBy(world, p, c.damage, "boss", null) > 0) bossStats.chargePlayerHits++;
  // DD2: sideways, away from the lane's centre line; sign(0) = +1 (deterministic).
  const perp = -(p.x - a.cx) * a.dirY + (p.y - a.cy) * a.dirX;
  const sgn = perp >= 0 ? 1 : -1;
  knockPlayerDir(p, -a.dirY * sgn, a.dirX * sgn, c.shoveM, c.shoveS);
};

/**
 * D1: a standing survivor its body now overlaps is moved out sideways (perpendicular to the lane,
 * the shove's side), then out of the obstacles. Never along the lane (it never carries you).
 */
const clearPlayer = (p: PlayerState): void => {
  const world = pass.world as World;
  if (p.status !== "alive") return;
  const a = world.boss.attack;
  const b = world.boss;
  const min = world.balance.boss.radiusM + p.radiusM;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  if (dx * dx + dy * dy >= min * min) return;
  const along = dx * a.dirX + dy * a.dirY;
  let perp = -dx * a.dirY + dy * a.dirX;
  const sgn = perp >= 0 ? 1 : -1;
  // Sideways distance so the centre clears the body at this along-offset.
  const need = Math.sqrt(Math.max(0, min * min - along * along)) + 1e-4;
  perp = sgn * Math.max(Math.abs(perp), need);
  const wantX = b.x + a.dirX * along - a.dirY * perp;
  const wantY = b.y + a.dirY * along + a.dirX * perp;
  pushOutOfBuildings(world, wantX, wantY, p.radiusM, p.x, p.y);
  p.x = pushed.x;
  p.y = pushed.y;
};

/** F6 / D2: every player building (walls, turrets, traps, mines) the body touches is destroyed, no refund. */
function smashBuildings(world: World): void {
  const b = world.boss;
  const r = world.balance.boss.radiusM;
  const list = world.buildings.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const bd = list[i] as Building | undefined;
    if (!bd) continue;
    // Its body now, or halfway through this tick's 0.6 m step (a 4 m body never skips a building).
    const mx = (pass.ax + pass.bx) / 2;
    const my = (pass.ay + pass.by) / 2;
    if (!circleOverlapsBox(b.x, b.y, r, bd.minX, bd.minY, bd.maxX, bd.maxY) && !circleOverlapsBox(mx, my, r, bd.minX, bd.minY, bd.maxX, bd.maxY)) continue;
    if (damageBuilding(world, bd, bd.hp)) bossStats.chargeBuildingsSmashed++;
  }
}

/**
 * D3: every zombie its body sweeps over this tick (the capsule from the last step to this one) takes
 * `zombieDamage` (no pay), once per charge: review N2 — a per-slot mark (attack id + the slot's
 * generation) instead of "not overlapped at the last step", so a zombie that walks in under the body
 * between two steps is trampled too.
 */
function trampleZombies(world: World): void {
  const dmg = world.balance.boss.charge.zombieDamage;
  if (dmg <= 0) return;
  const R = world.balance.boss.radiusM;
  const z = world.zombies;
  const midX = (pass.ax + pass.bx) / 2;
  const midY = (pass.ay + pass.by) / 2;
  const half = Math.sqrt((pass.bx - pass.ax) ** 2 + (pass.by - pass.ay) ** 2) / 2;
  const n = queryRadius(world.zombieGrid, z.x, z.y, midX, midY, half + R + maxZombieRadius(world.balance), candidates);
  const a = world.boss.attack;
  for (let k = 0; k < n; k++) {
    const id = candidates[k] as number;
    if (!isZombieAlive(z, id)) continue;
    const zr = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const zx = z.x[id] as number;
    const zy = z.y[id] as number;
    const min = R + zr;
    if (distToSegment2(zx, zy, pass.ax, pass.ay, pass.bx, pass.by) >= min * min) continue;
    const b = world.boss;
    if (b.trampleId[id] === a.id && b.trampleGen[id] === z.generation[id]) continue; // once per charge
    b.trampleId[id] = a.id;
    b.trampleGen[id] = z.generation[id] as number;
    bossStats.chargeZombieHits++;
    const perp = -(zx - a.cx) * a.dirY + (zy - a.cy) * a.dirX;
    const sgn = perp >= 0 ? 1 : -1;
    applyZombieDamage(world, id, dmg, -a.dirY * sgn, a.dirX * sgn, 0, null, "boss");
  }
}

/** One rush tick. Returns true when it reached the lane's end this tick. */
export function rushStep(world: World): boolean {
  const b = world.boss;
  const a = b.attack;
  const c = world.balance.boss.charge;
  const first = a.travelled === 0;
  if (first) bossStats.charges++;
  const next = Math.min(a.lenM, a.travelled + c.speedMps * TICK_DT_S);
  pass.world = world;
  pass.ax = b.x;
  pass.ay = b.y;
  // From the fixed start, never accumulated (the positions are the swept samples).
  b.x = a.cx + a.dirX * next;
  b.y = a.cy + a.dirY * next;
  pass.bx = b.x;
  pass.by = b.y;
  a.travelled = next;
  smashBuildings(world);
  trampleZombies(world);
  pass.i = 0;
  world.players.forEach(hitPlayer);
  world.players.forEach(clearPlayer);
  pass.world = null;
  return next >= a.lenM - 1e-9;
}

/** Story 6.6 (AC 3): the charge zone toward (tx, ty) from the boss: fixed direction and the sweep. False if the target is on its centre. */
export function planCharge(world: Readonly<World>, tx: number, ty: number, out: { dirX: number; dirY: number; lenM: number; crash: boolean }): boolean {
  const b = world.boss;
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return false;
  out.dirX = dx / d;
  out.dirY = dy / d;
  sweepChargeLane(world, b.x, b.y, out.dirX, out.dirY);
  out.lenM = chargeLane.lenM;
  out.crash = chargeLane.crash;
  return true;
}
