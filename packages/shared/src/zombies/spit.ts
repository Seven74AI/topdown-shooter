import type { World } from "../core/world";
import { ticksFor } from "../core/time";
import { MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import type { SpitStats } from "../config/balanceSchema";
import type { Balance } from "../config/balance";
import { shotBlockT, shotLineClear } from "../combat/cover";
import { segmentCircleT } from "../math/sweep";
import { downPlayer } from "../player/downed";
import type { PlayerState } from "../player/player";
import { AREA_KIND, circleInArea, clearAreas, spawnArea } from "../hazards/areaPool";
import { freeSpit, clearSpits } from "./spitPool";
import { ZOMBIE_STATE, isRushState, isWindupState } from "./zombieTypes";
import { DAMAGE_SOURCE_ACID } from "../core/simEvents";

/**
 * Story 5.6: Spitters (FR23, FR84; fairness rules F1–F7 in the story file).
 *
 * - `spitterStep` (the zombies system, pass 1, for types with a `spit` block): stand off and spit.
 *   An alive player within `rangeM` (centre to centre) with a clear shot line (`shotLineClear`: no
 *   car, bus or building; barricades, turrets, sandbags and barriers don't count) → the Spitter
 *   stops and winds up (state WINDUP / RUSH_WINDUP, streamed: the telegraph) for `windupS`; at the
 *   end it re-checks range and line on the same target (F1: else no spit) and spits at the
 *   target's position at that moment (F2: no lead). `intervalS` runs from spit to spit, windup
 *   included. While cooling down it holds its spot as long as some player is in range and sight.
 * - `updateSpits` (zombies slot, after the AI): globs fly straight at `speedMps`; the first contact
 *   along the swept segment wins: a standing player's body (+ the glob radius) → `damage`, a shot
 *   blocker's face (4.2 cover) → stop there, else the aim point. Each leaves an acid puddle.
 * - `updateAcid` (zombies slot, last): per standing player, an acid clock (`acidTicks`, the 4.8 D3
 *   rule): every `puddlePulseS` spent inside any puddle costs `puddleDamagePerS × puddlePulseS`;
 *   kept while outside; puddles don't stack. Downed/out players, zombies and buildings take none.
 * - `clearAcid` (every build start): no spits, no puddles, every acid clock at 0 (DD4).
 *
 * Damage events use `sourceZombieId` = `DAMAGE_SOURCE_ACID` (−2), never −1 (fire). No randomness,
 * no allocation per tick (module scratch only).
 */

/** Spits and acid so far (tests and logs; not read by the sim). */
export const spitStats = { spits: 0, spitHits: 0, coverStops: 0, landed: 0, cancelled: 0, capped: 0, acidHits: 0, puddles: 0 };

/** Standing players this tick (refilled by `collectStanding`; no iterator allocation per Spitter). */
const standing: PlayerState[] = [];
const pushStanding = (p: PlayerState): void => {
  if (p.status === "alive") standing.push(p);
};

/** Refills the standing-player list (call once per tick before `spitterStep` / `updateSpits`). */
export function collectStanding(world: World): void {
  standing.length = 0;
  world.players.forEach(pushStanding);
}

/** Nearest alive player within `rangeM` of (x, y) with a clear shot line, or null (ties: insertion order). */
function spitTargetFor(world: World, x: number, y: number, rangeM: number): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD2 = rangeM * rangeM;
  for (let k = 0; k < standing.length; k++) {
    const p = standing[k] as PlayerState;
    if (p.status !== "alive") continue; // may go down mid-tick
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD2 || (best !== null && d2 === bestD2)) continue;
    if (!shotLineClear(world, x, y, p.x, p.y)) continue;
    best = p;
    bestD2 = d2;
  }
  return best;
}

/** The player can still be spat at from (x, y): alive, within range, clear line (F1 release check). */
function stillTargetable(world: World, p: PlayerState | undefined, x: number, y: number, rangeM: number): p is PlayerState {
  if (!p || p.status !== "alive") return false;
  const dx = p.x - x;
  const dy = p.y - y;
  return dx * dx + dy * dy <= rangeM * rangeM && shotLineClear(world, x, y, p.x, p.y);
}

/**
 * Pass 1 of the zombies system for a Spitter. Returns true when it stands still this tick (winding
 * up, or cooling down with a target in range and sight); false = walk as a Walker.
 */
export function spitterStep(world: World, id: number, radiusM: number, spit: Readonly<SpitStats>): boolean {
  const z = world.zombies;
  const x = z.x[id] as number;
  const y = z.y[id] as number;
  const state = z.state[id] as number;
  if (isWindupState(state)) {
    const left = (z.spitTicks[id] as number) - 1;
    if (left > 0) {
      z.spitTicks[id] = left;
      return true; // F1: the windup always plays to the end (knockback / damage cancel nothing)
    }
    const rush = isRushState(state);
    z.state[id] = rush ? ZOMBIE_STATE.RUSH : ZOMBIE_STATE.CHASE;
    const targetId = z.spitTarget[id] ?? null;
    z.spitTarget[id] = null;
    const p = targetId === null ? undefined : world.players.get(targetId);
    if (!stillTargetable(world, p, x, y, spit.rangeM)) {
      z.spitTicks[id] = 0; // F1: out of sight or range at release → no spit; may wind up again
      spitStats.cancelled++;
      return false;
    }
    if (spawnSpit(world, id, x, y, p.x, p.y, radiusM, spit)) z.spitTicks[id] = ticksFor(spit.intervalS) - ticksFor(spit.windupS);
    else z.spitTicks[id] = 0; // AC 15: over the cap: no spit, it re-arms
    return true;
  }
  if ((z.spitTicks[id] as number) > 0) z.spitTicks[id] = (z.spitTicks[id] as number) - 1;
  const target = spitTargetFor(world, x, y, spit.rangeM);
  if (!target) return false; // F6: no line or out of range → walk (field) like a Walker
  if (z.spitTicks[id] === 0) {
    // Ready (3 s from spit to spit: the cooldown ends the tick the next windup starts).
    z.state[id] = isRushState(state) ? ZOMBIE_STATE.RUSH_WINDUP : ZOMBIE_STATE.WINDUP;
    z.spitTicks[id] = ticksFor(spit.windupS);
    z.spitTarget[id] = target.id;
  }
  return true; // winding up, or holding its spot while it cools down (target in range and sight)
}

/** Spawns a glob from the Spitter at (x, y) toward (tx, ty). False when the live cap is reached. */
export function spawnSpit(world: World, zombieId: number, x: number, y: number, tx: number, ty: number, radiusM: number, spit: Readonly<SpitStats>): boolean {
  const pool = world.spits;
  if (pool.count >= Math.min(pool.capacity, world.balance.zombies.spitCaps.maxLiveSpits)) {
    spitStats.capped++;
    return false;
  }
  let dx = tx - x;
  let dy = ty - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  const mouth = radiusM + MUZZLE_OFFSET_M;
  const sx = x + dx * mouth;
  const sy = y + dy * mouth;
  const range = Math.max(0, Math.min(d - mouth, spit.rangeM + spit.puddleRadiusM));
  const i = pool.count++;
  const sid = pool.nextId;
  pool.nextId = (pool.nextId + 1) & 0xffff;
  pool.x[i] = sx;
  pool.y[i] = sy;
  pool.dirX[i] = dx;
  pool.dirY[i] = dy;
  pool.rangeLeftM[i] = range;
  pool.speedMps[i] = spit.speedMps;
  pool.radiusM[i] = spit.radiusM;
  pool.damage[i] = spit.damage;
  pool.puddleRadiusM[i] = spit.puddleRadiusM;
  pool.puddleTicks[i] = ticksFor(spit.puddleS);
  pool.owner[i] = zombieId;
  pool.id[i] = sid;
  spitStats.spits++;
  world.events.emit({ type: "spitter.spat", zombieId, spitId: sid, x: sx, y: sy, toX: sx + dx * range, toY: sy + dy * range });
  return true;
}

/** Ends spit `i` at (x, y): a puddle there and `acid.splashed`. */
function splash(world: World, i: number, x: number, y: number, hitPlayerId: string | null): void {
  const s = world.spits;
  const id = s.id[i] as number;
  spawnArea(world.areas, world.balance.zombies.spitCaps.maxLivePuddles, AREA_KIND.ACID, id, x, y, s.puddleRadiusM[i] as number, s.puddleTicks[i] as number, world.tick);
  spitStats.puddles++;
  world.events.emit({ type: "acid.splashed", puddleId: id, x, y, hitPlayerId });
  freeSpit(s, i);
}

/** Acid damage to a standing player (spit or puddle): HP, `player.damaged` (source −2), down at 0. */
function acidDamage(world: World, p: PlayerState, amount: number): void {
  if (p.status !== "alive" || world.debug.godMode) return; // F5; god mode: dev cheat / ?stress
  p.hp = Math.max(0, p.hp - amount);
  world.events.emit({ type: "player.damaged", playerId: p.id, amount, sourceZombieId: DAMAGE_SOURCE_ACID });
  if (p.hp <= 0) downPlayer(world, p);
}

/** Globs in flight: one swept step each (from the end: a splash moves the last spit into the hole). */
export function updateSpits(world: World): void {
  const s = world.spits;
  if (s.count === 0) return;
  collectStanding(world);
  for (let i = s.count - 1; i >= 0; i--) {
    const x0 = s.x[i] as number;
    const y0 = s.y[i] as number;
    const dx = s.dirX[i] as number;
    const dy = s.dirY[i] as number;
    const left = s.rangeLeftM[i] as number;
    const stepM = Math.min(left, (s.speedMps[i] as number) * TICK_DT_S);
    const x1 = x0 + dx * stepM;
    const y1 = y0 + dy * stepM;
    // F3: a car, the bus or a building stops it at its face (barricades, sandbags: no).
    let bestT = stepM > 0 ? shotBlockT(world, x0, y0, x1, y1) : -1;
    const blocked = bestT >= 0;
    let hit: PlayerState | null = null;
    const rs = s.radiusM[i] as number;
    for (let k = 0; k < standing.length; k++) {
      const p = standing[k] as PlayerState;
      if (p.status !== "alive") continue; // F5: over downed and out players (one may go down mid-tick)
      const t = segmentCircleT(x0, y0, x1, y1, p.x, p.y, p.radiusM + rs);
      if (t >= 0 && (bestT < 0 || t < bestT || (t === bestT && hit === null))) {
        bestT = t;
        hit = p;
      }
    }
    if (hit) {
      const hx = x0 + (x1 - x0) * bestT;
      const hy = y0 + (y1 - y0) * bestT;
      acidDamage(world, hit, s.damage[i] as number);
      spitStats.spitHits++;
      splash(world, i, hx, hy, hit.id);
    } else if (blocked) {
      spitStats.coverStops++;
      splash(world, i, x0 + (x1 - x0) * bestT, y0 + (y1 - y0) * bestT, null);
    } else if (stepM >= left) {
      spitStats.landed++;
      splash(world, i, x1, y1, null);
    } else {
      s.x[i] = x1;
      s.y[i] = y1;
      s.rangeLeftM[i] = left - stepM;
    }
  }
}

/** Scratch for the module-level player callback (no closure per tick). */
const acidPass = { world: null as World | null, amount: 0, pulse: 0 };

const acidPlayer = (p: PlayerState): void => {
  const world = acidPass.world as World;
  if (p.status !== "alive" || world.debug.godMode) return; // F5
  if (!circleInArea(world.areas, AREA_KIND.ACID, p.x, p.y, p.radiusM)) return;
  if (++p.acidTicks < acidPass.pulse) return;
  p.acidTicks = 0;
  spitStats.acidHits++;
  acidDamage(world, p, acidPass.amount);
};

const acidSpitCache = new WeakMap<object, Readonly<SpitStats> | null>();

/** The acid stats of the first zombie type with a spit block (all Spitter puddles share it). Cached per Balance. */
export function acidSpit(world: Readonly<World>): Readonly<SpitStats> | null {
  return acidSpitOf(world.balance);
}

/** The same, from a Balance (the client sizes its cosmetic pools and cues with it). */
export function acidSpitOf(b: Readonly<Balance>): Readonly<SpitStats> | null {
  let s = acidSpitCache.get(b);
  if (s === undefined) {
    s = null;
    for (const t of Object.values(b.zombies.types)) {
      if (t.spit) {
        s = t.spit;
        break;
      }
    }
    acidSpitCache.set(b, s);
  }
  return s;
}

/** Puddle damage (per-body clock, F4) and lifetime. Puddles that reach 0 ticks are freed after the damage pass. */
export function updateAcid(world: World): void {
  const a = world.areas;
  if (a.count === 0 || world.teamWiped) return;
  const spit = acidSpit(world);
  if (spit) {
    acidPass.world = world;
    acidPass.pulse = ticksFor(spit.puddlePulseS);
    acidPass.amount = Math.round(spit.puddleDamagePerS * spit.puddlePulseS);
    world.players.forEach(acidPlayer);
    acidPass.world = null;
  }
  for (let i = 0; i < a.capacity; i++) {
    if (a.active[i] !== 1 || a.kind[i] !== AREA_KIND.ACID || a.bornTick[i] === world.tick) continue; // a new puddle lives puddleS full ticks
    const t = (a.ticksLeft[i] as number) - 1;
    a.ticksLeft[i] = t;
    if (t <= 0) {
      a.active[i] = 0;
      a.count--;
    }
  }
}

const coolAcid = (p: PlayerState): void => {
  p.acidTicks = 0;
};

/** DD4: at every build start: no spits, no puddles, acid clocks at 0 (server and solo). */
export function clearAcid(world: World): void {
  clearSpits(world.spits);
  clearAreas(world.areas);
  world.players.forEach(coolAcid);
}

/** The circle (x, y, r) is inside a live acid puddle (strict overlap): the rule the client's ring draws. */
export function circleInAcid(world: Readonly<World>, x: number, y: number, r: number): boolean {
  return circleInArea(world.areas, AREA_KIND.ACID, x, y, r);
}
