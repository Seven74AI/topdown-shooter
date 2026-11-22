import type { World } from "../core/world";
import { ticksFor } from "../core/time";
import { circleOverlapsBox } from "../buildings/collision";
import { damageBuilding, type Building } from "../buildings/buildings";
import { downPlayer } from "../player/downed";
import type { PlayerState } from "../player/player";
import { killZombie, zombieTypeOf } from "../zombies/zombiePool";
import type { FireRecord } from "./decayState";

/**
 * Story 4.8: car fires (FR57, FR53, FR61). The burning zones are `world.decay.fires` (written only
 * by the shared `applyDecayStage`); this module is what they do:
 *
 * - `updateFires` (the `decayTimers` system, last in the tick; server and solo only): every
 *   `decay.json › fire.pulseS` (ticks of `decay.burnTicks`, which runs while a fire burns in a build
 *   or wave phase) each body inside a zone takes `damagePerS × pulseS`: standing players
 *   (`player.damaged`, source −1; they can go down), zombies (no hit event; a death credits nobody),
 *   buildings and turrets (`damageBuilding`). Downed and out players are spared (their own timer).
 *   Inside = the body circle (a building's footprint) overlaps the zone circle, strictly. A body in
 *   two zones takes one pulse (zones don't stack).
 * - `fireExpiry` / `lightNewFires` (the DecaySystem, at a build start): which fires go out, and the
 *   end wave of the newly lit ones.
 * - `segmentHitsFire`: the zombies' line of sight (a line through fire means: follow the field).
 *
 * No allocation per tick (module-level callbacks and scratch only).
 */

/** The body circle overlaps a burning zone (strict). */
export function circleInFire(fires: readonly FireRecord[], x: number, y: number, r: number): boolean {
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i] as FireRecord;
    const dx = x - f.x;
    const dy = y - f.y;
    const rr = r + f.radiusM;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

function boxInFire(fires: readonly FireRecord[], b: Building): boolean {
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i] as FireRecord;
    if (circleOverlapsBox(f.x, f.y, f.radiusM, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}

/**
 * The segment (x0, y0)–(x1, y1) passes within `r` of a burning zone (segment vs the zone circle
 * grown by `r`, strict). For the zombies' straight-line check (Story 4.8: fire is a cost, so a
 * zombie with a line through fire follows the flow field).
 */
export function segmentHitsFire(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const fires = world.decay.fires;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i] as FireRecord;
    let t = len2 > 0 ? ((f.x - x0) * dx + (f.y - y0) * dy) / len2 : 0;
    t = Math.min(1, Math.max(0, t));
    const ex = x0 + dx * t - f.x;
    const ey = y0 + dy * t - f.y;
    const rr = r + f.radiusM;
    if (ex * ex + ey * ey < rr * rr) return true;
  }
  return false;
}

/** The damage of one pulse (whole, schema-checked). */
export function firePulseDamage(world: Readonly<World>): number {
  const f = world.balance.decay.fire;
  return Math.round(f.damagePerS * f.pulseS);
}

/** Scratch for the module-level player callback (no closure per tick). */
const pass = { world: null as World | null, amount: 0 };

const burnPlayer = (p: PlayerState): void => {
  const world = pass.world as World;
  // D4: downed players keep their own countdown; out players are off the map; god mode (dev, ?stress).
  if (p.status !== "alive" || world.debug.godMode) return;
  if (!circleInFire(world.decay.fires, p.x, p.y, p.radiusM)) return;
  p.hp = Math.max(0, p.hp - pass.amount);
  world.events.emit({ type: "player.damaged", playerId: p.id, amount: pass.amount, sourceZombieId: -1 });
  if (p.hp <= 0) downPlayer(world, p);
};

/** Pulse results of the last pulse (tests and logs; not read by the sim). */
export const firePulse = { players: 0, zombies: 0, zombiesKilled: 0, buildings: 0, pulses: 0 };

/**
 * The `decayTimers` system (Story 4.8): the fire damage pulse. Server and solo only (the client's
 * Worlds run no systems: HP and deaths come from the server).
 */
export function updateFires(world: World): void {
  const fires = world.decay.fires;
  if (fires.length === 0 || world.teamWiped) return;
  const phase = world.run.phase;
  if (phase !== "build" && phase !== "wave") return;
  world.decay.burnTicks++;
  if (world.decay.burnTicks % ticksFor(world.balance.decay.fire.pulseS) !== 0) return;
  const amount = firePulseDamage(world);
  firePulse.pulses++;
  // Players first (id order is the Map's insertion order, like every player pass).
  pass.world = world;
  pass.amount = amount;
  world.players.forEach(burnPlayer);
  pass.world = null;
  // Zombies (from the end: a kill swaps the last alive id into this slot).
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    if (!circleInFire(fires, z.x[id] as number, z.y[id] as number, r)) continue;
    z.hp[id] = (z.hp[id] as number) - amount;
    firePulse.zombies++;
    if ((z.hp[id] as number) <= 0) {
      killZombie(world, id, null, "fire"); // D5: credits nobody
      firePulse.zombiesKilled++;
    }
  }
  // Buildings and turrets (from the end: destruction removes from the list).
  const list = world.buildings.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    if (!boxInFire(fires, b)) continue;
    damageBuilding(world, b, amount);
    firePulse.buildings++;
  }
}

/**
 * At a build start (DecaySystem step 1): the `firesOut` mask after the fires whose end wave has come
 * go out (`comingWave` = the wave this build phase leads to). Fires of stages above `stage` (the dev
 * cheat going back) are forgotten: their bits clear. Reads only.
 */
export function fireExpiry(world: Readonly<World>, stage: number, comingWave: number): number {
  const d = world.decay;
  let out = d.firesOut;
  for (let i = 0; i < d.fireSlots.length; i++) {
    const f = d.fireSlots[i] as FireRecord;
    const bit = 1 << i;
    if (f.stage > stage) out &= ~bit;
    else {
      const end = d.fireEndWave[i] as number;
      if (end > 0 && comingWave >= end) out |= bit;
    }
  }
  return out >>> 0;
}

/**
 * After the apply: a burning fire with no end wave was lit at this build start and burns for
 * `fire.durationWaves` waves (it goes out at the build start before `comingWave + durationWaves`);
 * a fire of a stage above `stage` (the cheat going back) loses its end wave.
 */
export function lightNewFires(world: World, stage: number, comingWave: number): void {
  const d = world.decay;
  for (let i = 0; i < d.fireSlots.length; i++) if ((d.fireSlots[i] as FireRecord).stage > stage) d.fireEndWave[i] = 0;
  const dur = world.balance.decay.fire.durationWaves;
  for (let i = 0; i < d.fires.length; i++) {
    const f = d.fires[i] as FireRecord;
    if (d.fireEndWave[f.index] === 0) d.fireEndWave[f.index] = comingWave + dur;
  }
}
