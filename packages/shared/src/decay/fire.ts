import { resetBearTraps } from "../buildings/bearTrap";
import { damageSurvivor, survivorTarget } from "../events/survivor";
import type { World } from "../core/world";
import { ticksFor } from "../core/time";
import { circleOverlapsBox } from "../buildings/collision";
import { buildingStats, damageBuilding, type Building } from "../buildings/buildings";
import { applyZombieDamageQuiet, damagePlayerBy } from "../combat/damage";
import { resetFlameClocks } from "../combat/flame";
import type { PlayerState } from "../player/player";
import { killZombie, zombieTypeOf } from "../zombies/zombiePool";
import { circleInFire, type FireRecord } from "./decayState";
import { DAMAGE_SOURCE_FIRE } from "../core/simEvents";
import { payKill } from "../economy/economy";
import { ageMolotovZones, molotovStats, molotovZoneAt } from "../hazards/molotov";
import { consumableAt, consumableStatsAt, molotovTicksAt } from "../economy/consumables";

/**
 * Story 4.8: car fires (FR57, FR53, FR61). The burning zones are `world.decay.fires` (written only
 * by the shared `applyDecayStage`); this module is what they do:
 *
 * - `updateFires` (the `decayTimers` system, last in the tick; server and solo only): per body, every
 *   `decay.json › fire.pulseS` spent inside a zone (its own burn clock, review L4) it takes
 *   `damagePerS × pulseS`, in build and wave phases: standing players
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

export { circleInFire } from "./decayState";

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
const pass = { world: null as World | null, amount: 0, pulse: 0, cars: false };

/**
 * Story 5.12 (M-B, the "single fire pass" option): one fire clock per body over car fires AND
 * molotov zones. A body inside any fire counts its clock; at its pulse it takes ONE fire hit: the
 * stronger of the car fire's (no credit, full to players) and the molotov's (credit to the
 * thrower, players the friendly-fire share). The pulse is the shorter of the two fires' pulses it
 * stands in. Zones and car fires never stack.
 */
function molotovPulseTicks(world: Readonly<World>, slot: number): number {
  return molotovTicksAt(world.balance, world.molotovs.item[slot] as number).pulseTicks;
}

/** The molotov's damage per pulse (whole; zombies full, players via the friendly-fire share). */
function molotovPulseDamage(world: Readonly<World>, slot: number): number {
  const s = consumableStatsAt(world.balance, world.molotovs.item[slot] as number);
  return s ? Math.round((s.damagePerS ?? 0) * (s.pulseS ?? 0)) : 0;
}

const burnPlayer = (p: PlayerState): void => {
  const world = pass.world as World;
  // D4: downed players keep their own countdown; out players are off the map; god mode (dev, ?stress).
  if (p.status !== "alive" || world.debug.godMode) return;
  const car = pass.cars && circleInFire(world.decay.fires, p.x, p.y, p.radiusM);
  const mol = molotovZoneAt(world, p.x, p.y, p.radiusM);
  if (!car && mol < 0) return;
  const pulse = mol < 0 ? pass.pulse : car ? Math.min(pass.pulse, molotovPulseTicks(world, mol)) : molotovPulseTicks(world, mol);
  if (++p.fireTicks < pulse) return;
  p.fireTicks = 0;
  firePulse.players++;
  if (mol >= 0) {
    const owner = world.molotovs.owner[mol] ?? null;
    const raw = molotovPulseDamage(world, mol);
    const ff = Math.round((raw * world.balance.combat.friendlyFire.pct) / 100);
    if (!car || ff > pass.amount) {
      molotovStats.playerHits++;
      // 5.4: a player's fire hurts players at the friendly-fire share; an owner who left: the share, no source.
      if (owner !== null && world.players.has(owner)) damagePlayerBy(world, p, raw, "fire", owner, DAMAGE_SOURCE_FIRE);
      else damagePlayerBy(world, p, ff, "fire", null, DAMAGE_SOURCE_FIRE);
      return;
    }
  }
  // Story 5.4 (D2): environment fire is no player's source: full damage, tagged `fire` for the cues.
  damagePlayerBy(world, p, pass.amount, "fire", null, DAMAGE_SOURCE_FIRE);
};

/** Fire hits so far (tests and logs; not read by the sim). */
export const firePulse = { players: 0, zombies: 0, zombiesKilled: 0, buildings: 0, pulses: 0 };

/**
 * The `decayTimers` system (Story 4.8): fire damage. Server and solo only (the client's Worlds run no
 * systems: HP and deaths come from the server). Review L4: every body has its own burn clock
 * (`fireTicks`), counted only while it is inside a zone and kept while it is outside; each time it
 * reaches `pulseS` worth of ticks the body takes `damagePerS × pulseS`. So a body takes exactly one
 * hit per `pulseS` spent in fire, however it steps in and out (no dodging on a shared pulse tick).
 * Review L6: nothing burns while the dev `waves.paused` switch holds the run.
 * Story 5.12: molotov zones burn in the same pass (one clock, one hit per pulse: see above); they
 * hurt no building (D4) and age after the damage pass (`ageMolotovZones`).
 */
export function updateFires(world: World): void {
  const fires = world.decay.fires;
  const molotovs = world.molotovs.areas.count;
  if ((fires.length === 0 && molotovs === 0) || world.teamWiped || world.waves.paused) return;
  const phase = world.run.phase;
  if (phase !== "build" && phase !== "wave") return;
  const cars = fires.length > 0;
  if (cars) world.decay.burnTicks++;
  const pulse = ticksFor(world.balance.decay.fire.pulseS);
  const amount = firePulseDamage(world);
  // Players first (id order is the Map's insertion order, like every player pass).
  pass.world = world;
  pass.amount = amount;
  pass.pulse = pulse;
  pass.cars = cars;
  world.players.forEach(burnPlayer);
  pass.world = null;
  // Story 6.10 review L3 (D3 / S4): a car fire hurts the survivor on its own clock (it stops at fire
  // edges, so only a fire that starts under it can); molotov zones never do (players' fire).
  const npc = cars ? survivorTarget(world) : null;
  if (npc && circleInFire(fires, npc.x, npc.y, npc.radiusM) && ++npc.fireTicks >= pulse) {
    npc.fireTicks = 0;
    damageSurvivor(world, amount);
  }
  // Zombies, from the end: a kill swaps the last alive id into this position, which was already done
  // (review: forwards would skip the zombie moved into the freed slot).
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const zx = z.x[id] as number;
    const zy = z.y[id] as number;
    const car = cars && circleInFire(fires, zx, zy, r);
    const mol = molotovs > 0 ? molotovZoneAt(world, zx, zy, r) : -1;
    if (!car && mol < 0) continue;
    const zp = mol < 0 ? pulse : car ? Math.min(pulse, molotovPulseTicks(world, mol)) : molotovPulseTicks(world, mol);
    const t = (z.fireTicks[id] as number) + 1;
    if (t < zp) {
      z.fireTicks[id] = t;
      continue;
    }
    z.fireTicks[id] = 0;
    firePulse.zombies++;
    if (mol >= 0) {
      // The thrower's fire (credited: reward + assists like a weapon kill, D9), at least as strong as the car fire.
      const owner = world.molotovs.owner[mol] ?? null;
      const credit = owner !== null && world.players.has(owner) ? owner : null;
      const dmg = Math.max(car ? amount : 0, molotovPulseDamage(world, mol));
      molotovStats.zombieHits++;
      if (applyZombieDamageQuiet(world, id, dmg, 0, 0, 0, credit, consumableAt(world.balance, world.molotovs.item[mol] as number) ?? "")) {
        // D9: paid here (the economy system ran earlier this tick and never sees this kill's event).
        payKill(world, id, credit, 1);
        firePulse.zombiesKilled++;
        molotovStats.kills++;
      }
      continue;
    }
    z.hp[id] = (z.hp[id] as number) - amount;
    if ((z.hp[id] as number) <= 0) {
      killZombie(world, id, null, "fire"); // D5: credits nobody
      firePulse.zombiesKilled++;
    }
  }
  // Buildings and turrets (from the end: destruction removes from the list). Car fires only (5.12 D4).
  const list = world.buildings.list;
  for (let i = cars ? list.length - 1 : -1; i >= 0; i--) {
    const b = list[i] as Building;
    if (!boxInFire(fires, b)) continue;
    if (buildingStats(world.balance, b.type)?.mine) continue; // Story 5.9 DD5: mines are immune to fire (traps burn and wear)
    if (++b.fireTicks < pulse) continue;
    b.fireTicks = 0;
    damageBuilding(world, b, amount);
    firePulse.buildings++;
  }
  ageMolotovZones(world); // Story 5.12 (M-C): after the damage pass
}

/** Module-level callback (no closure per call). */
const coolPlayer = (p: PlayerState): void => {
  p.fireTicks = 0;
};

/**
 * Story 4.8 re-review L2: every body's burn clock restarts at each build start (players, every zombie
 * slot, buildings). Within a wave (and its build phase) the clock is kept while a body is outside, so
 * stepping out dodges nothing (review L4); across a build start the exposure never carries over, so
 * brushing a fire for 9 ticks in wave 3 doesn't make one tick in wave 5 cost a pulse. Runs in
 * `decayMutate` (server and solo; the client's Worlds run no systems). No allocation.
 */
export function resetBurnClocks(world: World): void {
  world.players.forEach(coolPlayer);
  world.zombies.fireTicks.fill(0);
  world.zombies.trapTicks.fill(0); // Story 5.9: the spike clock follows the same rule (4.8 D19)
  resetBearTraps(world); // Story 5.14 (D4): every bear trap re-arms at a build start, nothing held
  resetFlameClocks(world); // Story 5.4 (FR-C): the flame clocks and ignites follow it too
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) (list[i] as Building).fireTicks = 0;
}

/** Story 4.8 review M1/M2: the fires lit at this build start (filled by `newlyLitFires`; build starts only). */
export const newFires: FireRecord[] = [];

/** The burning fires that have no end wave yet, i.e. lit by the apply just done (call before `lightNewFires`). */
export function newlyLitFires(world: Readonly<World>): FireRecord[] {
  newFires.length = 0;
  const d = world.decay;
  for (let i = 0; i < d.fires.length; i++) {
    const f = d.fires[i] as FireRecord;
    if (d.fireEndWave[f.index] === 0) newFires.push(f);
  }
  return newFires;
}

/** The building's footprint overlaps one of `fires` (strict). */
export function buildingInFires(fires: readonly FireRecord[], b: Building): boolean {
  return boxInFire(fires, b);
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
