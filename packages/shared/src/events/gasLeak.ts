import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { HazardZone } from "../map/districtMap";
import { stageForWave } from "../decay/decayState";
import { blastResult, createExplosionSpec, explode } from "../combat/explosion";
import { segmentCircleT } from "../math/sweep";
import { EVENT_KINDS, EVENT_PHASE } from "./eventState";
import { type EventModule } from "./common";

/**
 * Story 6.9 (FR39, D1–D5, GL1): the gas leak.
 *
 * - Gate (F9): the map's `gas_leak` hazard zone is active at the wave's stage (`minStage`).
 * - The tank sits at the zone's centre (D1, `events.json › gasLeak.tankAt "zone_centre"`); it is NOT
 *   a blocker (DD3: not in `world.obstacles`, no nav or shot-list change).
 * - HISS 10 s, the 6 m ring drawn from the start (G1). For the first `armDelayS` (3 s) bullets pass
 *   over the tank (a floor cap); after that, the first PLAYER bullet that reaches the tank's circle
 *   blows it on that tick (G3, the 6.8 shot hook: turrets, melee, flames and blasts never do).
 * - The boom (one tick, G4: `hissS` after the start without a shot) is ONE `explode` (DD1): 6 m,
 *   `killDamage` to every zombie (all types die, D3), the full 60 to every standing player
 *   (`friendlyFire: false`, the Bloater rule, G2), 150 to buildings, the normal blast line of sight
 *   (cars, the bus, map boxes, buildings and rubble shield; brief 5). Kills credit the shooter (D4);
 *   a leak that blows by itself credits nobody. No fire afterwards (D5).
 * - Holds the wave while it hisses (6.8 F8 / D6).
 */

/** Credited on the blast's kills (the Bloater's credit-id pattern; not a shop weapon). */
export const GAS_LEAK_WEAPON = "gas_leak";

const GAS_LEAK = EVENT_KINDS.indexOf("gas_leak");

/** The map's gas-leak zone active at `stage`, or null. */
export function gasLeakZone(world: Readonly<World>, stage: number): HazardZone | null {
  const hz = world.map.hazards;
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i] as HazardZone;
    if (h.kind === "gas_leak" && h.minStage <= stage) return h;
  }
  return null;
}

/** The tank is shootable now (HISS, after `armDelayS`, not blown). */
export function gasTankArmed(world: Readonly<World>): boolean {
  const a = world.special.active;
  if (a.kind !== GAS_LEAK || a.phase !== EVENT_PHASE.HISS || world.special.gasLeak.blownTick >= 0) return false;
  return world.tick - a.phaseTick >= ticksFor(world.balance.events.gasLeak.armDelayS);
}

const spec = createExplosionSpec();

/** The boom (once): one blast at the tank, credited to `by` (null: the timer). */
function blow(world: World, by: string | null): void {
  const g = world.special.gasLeak;
  if (g.blownTick >= 0) return; // one blast only (two shots on one tick: the first)
  const cfg = world.balance.events.gasLeak;
  const a = world.special.active;
  g.blownTick = world.tick;
  g.shotBy = by;
  spec.x = a.x;
  spec.y = a.y;
  spec.radiusM = cfg.radiusM;
  spec.zombieDamage = cfg.killDamage;
  spec.playerDamage = cfg.playerDamage;
  spec.friendlyFire = false; // G2: the full 60 to everyone in it, whoever lit it
  spec.buildingDamage = cfg.buildingDamage;
  spec.pushM = 0;
  spec.kind = "gas_leak";
  spec.sourcePlayerId = by;
  spec.weapon = GAS_LEAK_WEAPON;
  spec.buildingId = 0;
  spec.quiet = true;
  spec.grenadeId = 0;
  spec.announce = true;
  spec.bossDamage = cfg.bossDamage; // review L4: not the zombies' kill damage
  explode(world, spec);
  const log = world.special.log;
  log.gasBooms++;
  log.gasKills += blastResult.zombiesKilled;
  log.gasShotBy = by;
}

/**
 * G3 (the 6.8 shot hook): a player's projectile step (x0, y0) → (x1, y1), stopped at `stopT` (−1: it
 * flies on), reaches the armed tank when it enters the tank's circle no later than where it stops.
 */
export function gasLeakShot(world: World, x0: number, y0: number, x1: number, y1: number, stopT: number, ownerId: string | null): number {
  if (ownerId === null) return -1;
  const a = world.special.active;
  const t = segmentCircleT(x0, y0, x1, y1, a.x, a.y, world.balance.events.gasLeak.tankRadiusM);
  if (t < 0 || (stopT >= 0 && t > stopT + 1e-9)) return -1;
  blow(world, ownerId);
  return t; // review L5: the bullet stops at the tank
}

export const gasLeakModule: EventModule = {
  kind: "gas_leak",
  fits(world, wave) {
    const stage = world.run.phase === "wave" && world.waves.number === wave ? world.decay.stage : stageForWave(world.balance, wave, world.debug.decayStageByWave);
    return gasLeakZone(world, stage) !== null;
  },
  start(world) {
    const z = gasLeakZone(world, world.decay.stage);
    if (!z) return false;
    const a = world.special.active;
    a.x = (z.minX + z.maxX) / 2; // D1: between the two pumps
    a.y = (z.minY + z.maxY) / 2;
    a.phase = EVENT_PHASE.HISS;
    const g = world.special.gasLeak;
    g.shotBy = null;
    g.blownTick = -1;
    return true;
  },
  update(world) {
    const g = world.special.gasLeak;
    if (g.blownTick >= 0) return "done"; // blown by a shot (this tick's combat): over
    const a = world.special.active;
    if (world.tick - a.phaseTick < ticksFor(world.balance.events.gasLeak.hissS)) return null;
    blow(world, null); // G4: on the tick the arc ends
    return "done";
  },
  end() {
    // The record stays (the last blast's tick and credit, for tests and the snapshot); `start` resets it.
  },
  holdsWave(world) {
    return world.special.gasLeak.blownTick < 0; // F8: a hissing tank holds the wave open
  },
};
