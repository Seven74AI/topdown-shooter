import type { BearTrapStats } from "../config/balanceSchema";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { ticksFor } from "../core/time";
import { isZombieAlive, killZombie, zombieTypeOf } from "../zombies/zombiePool";
import { BEAR_TRAP_STATE, buildingStats, damageBuilding, type Building } from "./buildings";

/**
 * Story 5.14: bear traps (designer decisions D1–D12, all as recommended).
 *
 * Runs in the `buildings` slot after the spike traps (hold clock, release, re-arm, catch of bodies
 * already on a plate) and again at the end of the zombies system on their new positions (catch
 * only: the 5.9 review L1 rule, so "the tick a centre reaches the plate" is exact). Server and solo
 * only (zombies are never predicted). Fairness rules (story ACs F1–F10):
 *
 * - **Catch (F2, F3):** during a wave, an ARMED trap catches the lowest-id alive, not-held zombie
 *   whose CENTRE is strictly within `plateRadiusM` of the trap's centre: `snapDamage` (a kill is the
 *   trap's and its owner's, 3.6 M1), `bear_trap.snapped`, and the zombie is held for
 *   `ticksFor(holdS × trapHoldPct / 100)` of its own movement ticks (`zombies.holdTicks`, counted
 *   down in `updateZombies`; a Brute 50 %). One zombie per trap; never in a build phase.
 * - **Held (AC 3, F6):** `updateZombies` gives a held zombie no velocity, the crowd's hard overlap
 *   pass and the player push-out never move it, `knockbackShare` is 0 (no knockback or pushback); it
 *   still bites, swings, spits and swells at what is in reach.
 * - **Release (AC 4):** when its hold ticks are used up, or the held zombie died (or its slot was
 *   reused: generation), the trap is SPRUNG (harmless) and worn `wearPerCatch` HP (`damageBuilding`:
 *   removed at 0, `building.destroyed`; `wallVersion` never changes: floor).
 * - **Re-arm (AC 5, F7):** a SPRUNG trap re-arms when one standing ("alive") player's body has
 *   overlapped the plate circle (strict) for `rearmS` of ticks without a break (a break, or the
 *   player leaving, restarts it; another player on it starts their own count), in a build or wave
 *   phase, free. `resetBearTraps` re-arms every trap at each build start. Players are never caught.
 *
 * Every trap-state change bumps `buildings.version` (the schema sync and renderers follow it).
 * No allocation per tick (players by `forEach` with a module-level pass record).
 */

/** What the bear traps did, summed over every World (tests, sims, liveness asserts: reset it first). */
export const bearTrapCounters = { catches: 0, bruteCatches: 0, releases: 0, rearms: 0, kills: 0, wornOut: 0 };

export function resetBearTrapCounters(): void {
  bearTrapCounters.catches = 0;
  bearTrapCounters.bruteCatches = 0;
  bearTrapCounters.releases = 0;
  bearTrapCounters.rearms = 0;
  bearTrapCounters.kills = 0;
  bearTrapCounters.wornOut = 0;
}

function bearStats(world: Readonly<World>, b: Building): Readonly<BearTrapStats> | undefined {
  return b.solid ? undefined : buildingStats(world.balance, b.type)?.bearTrap;
}

/** The trap's centre (the plate). */
const cx = (b: Building): number => (b.minX + b.maxX) / 2;
const cy = (b: Building): number => (b.minY + b.maxY) / 2;

/** The lowest-id alive, not-held zombie whose centre is strictly within `r` of (x, y), or −1. */
function zombieOnPlate(world: World, x: number, y: number, r: number): number {
  const z = world.zombies;
  let best = -1;
  for (let k = 0; k < z.aliveCount; k++) {
    const id = z.aliveIds[k] as number;
    if ((z.holdTicks[id] as number) > 0 || (best >= 0 && id > best)) continue;
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    if (dx * dx + dy * dy < r * r) best = id;
  }
  return best;
}

/** How many movement ticks `t` holds zombie `id` (its type's `trapHoldPct`; at least 1). */
export function holdTicksFor(world: Readonly<World>, t: Readonly<BearTrapStats>, id: number): number {
  const pct = world.balance.zombies.types[zombieTypeOf(world.zombies, id)]?.trapHoldPct ?? 100;
  return ticksFor((t.holdS * pct) / 100);
}

function setState(world: World, b: Building, state: number): void {
  if (b.trapState === state) return;
  b.trapState = state;
  world.buildings.version++;
}

/** Jaws open → sprung, worn. Returns true when the wear removed the trap. */
function release(world: World, b: Building, t: Readonly<BearTrapStats>): boolean {
  b.heldZombie = -1;
  b.heldGen = 0;
  b.rearmTicks = 0;
  b.rearmPlayer = "";
  setState(world, b, BEAR_TRAP_STATE.SPRUNG);
  bearTrapCounters.releases++;
  if (t.wearPerCatch > 0 && damageBuilding(world, b, t.wearPerCatch)) {
    bearTrapCounters.wornOut++;
    return true;
  }
  return false;
}

/** An ARMED trap catches what is on its plate (waves only). Returns true when the trap was removed. */
function tryCatch(world: World, b: Building, t: Readonly<BearTrapStats>): boolean {
  const id = zombieOnPlate(world, cx(b), cy(b), t.plateRadiusM);
  if (id < 0) return false;
  const z = world.zombies;
  const ticks = holdTicksFor(world, t, id);
  z.holdTicks[id] = ticks;
  b.heldZombie = id;
  b.heldGen = z.generation[id] as number;
  setState(world, b, BEAR_TRAP_STATE.HOLDING);
  bearTrapCounters.catches++;
  if (world.balance.zombies.types[zombieTypeOf(z, id)]?.trapHoldPct !== 100) bearTrapCounters.bruteCatches++;
  world.events.emit({ type: "bear_trap.snapped", buildingId: b.id, x: cx(b), y: cy(b) });
  if (t.snapDamage > 0) {
    z.hp[id] = (z.hp[id] as number) - t.snapDamage;
    if ((z.hp[id] as number) <= 0) {
      killZombie(world, id, b.ownerId, b.type, b.id);
      bearTrapCounters.kills++;
      z.holdTicks[id] = 0;
      return release(world, b, t); // a snap kill: sprung at once (and worn: it was a catch)
    }
  }
  return false;
}

/** Module-level pass record for the re-arm scan (no closure per call). */
const scan = { b: null as Building | null, r: 0, onCurrent: false, first: "" };

function scanPlayer(p: PlayerState): void {
  const b = scan.b as Building;
  if (p.status !== "alive") return;
  const dx = p.x - cx(b);
  const dy = p.y - cy(b);
  const reach = scan.r + p.radiusM;
  if (dx * dx + dy * dy >= reach * reach) return;
  if (p.id === b.rearmPlayer) scan.onCurrent = true;
  else if (scan.first === "" || p.id < scan.first) scan.first = p.id;
}

function stepRearm(world: World, b: Building, t: Readonly<BearTrapStats>): void {
  scan.b = b;
  scan.r = t.plateRadiusM;
  scan.onCurrent = false;
  scan.first = "";
  world.players.forEach(scanPlayer);
  scan.b = null;
  if (scan.onCurrent) b.rearmTicks++;
  else if (scan.first !== "") {
    b.rearmPlayer = scan.first;
    b.rearmTicks = 1;
  } else {
    b.rearmPlayer = "";
    b.rearmTicks = 0;
  }
  if (b.rearmTicks < ticksFor(t.rearmS)) return;
  b.rearmTicks = 0;
  b.rearmPlayer = "";
  setState(world, b, BEAR_TRAP_STATE.ARMED);
  bearTrapCounters.rearms++;
}

/** The buildings-slot pass: hold/release, re-arm, then catch bodies already on a plate. */
export function updateBearTraps(world: World): void {
  const phase = world.run.phase;
  if (phase !== "wave" && phase !== "build") return;
  const list = world.buildings.list;
  const z = world.zombies;
  // From the end: wear can remove a trap from the list.
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    const t = bearStats(world, b);
    if (!t) continue;
    if (b.trapState === BEAR_TRAP_STATE.HOLDING) {
      const id = b.heldZombie;
      const gone = id < 0 || !isZombieAlive(z, id) || z.generation[id] !== b.heldGen;
      if (!gone && (z.holdTicks[id] as number) > 0) continue;
      if (!gone) z.holdTicks[id] = 0;
      if (release(world, b, t)) continue;
    }
    if (b.trapState === BEAR_TRAP_STATE.SPRUNG) {
      if (world.teamWiped) continue;
      stepRearm(world, b, t);
      if ((b.trapState as number) !== BEAR_TRAP_STATE.ARMED) continue;
    }
    if (phase === "wave" && z.aliveCount > 0) tryCatch(world, b, t);
  }
}

/** The end-of-zombies pass (5.9 review L1): ARMED traps catch on the bodies' new positions. */
export function catchOnBearTraps(world: World): void {
  if (world.run.phase !== "wave" || world.zombies.aliveCount === 0) return;
  const list = world.buildings.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    if (b.trapState !== BEAR_TRAP_STATE.ARMED) continue;
    const t = bearStats(world, b);
    if (t) tryCatch(world, b, t);
  }
}

/**
 * At each build start (with the burn clocks, 4.8 D19): every bear trap re-arms (D4) and no zombie is
 * held. Review M1: a trap still HOLDING (its zombie was the wave's last kill, so the wave ended
 * before the trap pass could see it go) is released first — the catch costs its wear like any
 * other (it may wear the trap out: from the end of the list).
 */
export function resetBearTraps(world: World): void {
  const list = world.buildings.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as Building;
    const t = bearStats(world, b);
    if (!t) continue;
    if (b.trapState === BEAR_TRAP_STATE.HOLDING && release(world, b, t)) continue; // worn out: removed
    b.heldZombie = -1;
    b.heldGen = 0;
    b.rearmTicks = 0;
    b.rearmPlayer = "";
    setState(world, b, BEAR_TRAP_STATE.ARMED);
  }
  world.zombies.holdTicks.fill(0);
}

/** Story 5.14: the plate ring the client draws (exactly the sim radius; F2). */
export function bearTrapPlateRadius(world: Readonly<World>, type: string): number {
  return buildingStats(world.balance, type)?.bearTrap?.plateRadiusM ?? 0;
}
