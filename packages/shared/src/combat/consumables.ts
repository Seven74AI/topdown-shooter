import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { PlayerInput } from "../net/input";
import { MIN_AIM_LEN, MUZZLE_OFFSET_M } from "../config/constants";
import { activeSlot } from "./loadout";
import { weaponStats } from "./weapons";
import { throwConsumable } from "./grenades";
import { lobBlockT } from "./cover";
import { aimMemoryTicks, consumableCooldownTicks, consumableIndex, consumableStats, throwStatsOf, type ThrowStats } from "../economy/consumables";

/**
 * Story 5.12: using the quick-use slot (FR8). Fairness rules (tests in `consumables.test.ts`):
 *
 * - **C-A one tap = at most one use:** a use happens only on the tick an input with the edge flag
 *   `consumable` is applied (the flag reaches one tick per seq: `applyInputs`, the hosts' latch, the
 *   server's carry of a dropped/skipped input), from the player's server position and that input's
 *   aim, and only if the player is alive, the slot holds ≥ 1, the use cooldown is over and the
 *   item's own rule allows it. Otherwise nothing is consumed (no count, no cooldown, no event).
 * - **C-B cooldown in applied ticks (D1, D7):** `useCooldownS` (10 ticks) from the last use; it
 *   counts down only on ticks the player's input was applied (a starved tick pauses it, like the
 *   weapon, 2.7): two taps 5 ticks apart use one item, 10 ticks apart two.
 * - **C-C medkit:** heals `healHp` at once, capped at max HP (armor included); not used at full HP;
 *   build and wave phases.
 * - **C-D throwables (grenades, molotovs): wave phase only (D3).** Thrown by 5.5's lob
 *   (`throwConsumable`): the landing point is the aim distance clamped to [`minThrowM`,
 *   `throwRangeM`]. The aim length carries the distance (D11): a fraction of the throw range; on the
 *   flagged input the client always encodes the throw's own range and drops `fire` (review L5), so
 *   a swap to or from the launcher never changes how a throw decodes. With no aim (touch, the aim
 *   stick released): the last aim direction (kept `aimMemoryS`), else the nearest zombie within
 *   reach, else facing (review M1: `throwDirection`).
 *   Only real buildings stop the throw (designer 2026-11-23, PR #5: it flies over cars, the bus,
 *   barricades, turrets; aimed onto a car roof it lands at the car's near face). A full round pool
 *   spends nothing.
 * - **C-E no weapon side effects (D6):** a use never touches firing, reload or swap timers.
 *
 * Runs at the start of the combat system (after the grid rebuild), players in id order, so a
 * thrown item lands on its own landing tick in `updateGrenades` like a launcher round. No
 * allocation per tick.
 */

/** Uses so far (tests, sims, liveness; not read by the sim). */
export const consumableCounters = { used: 0, heals: 0, throws: 0, refusedCooldown: 0, refusedRule: 0 };

let pass: World | null = null;

const usePlayer = (p: PlayerState): void => {
  const world = pass as World;
  // D7: the cooldown counts applied inputs only (a starved tick pauses it, like the weapon).
  if (p.weaponsPaused) return;
  if (p.consumableCooldownTicks > 0) p.consumableCooldownTicks--;
  const input = world.inputs.get(p.id);
  rememberAim(world, p, input);
  if (!input?.consumable) return;
  tryUseConsumable(world, p, input);
};

/** The combat system's first step (Story 5.12). Server and solo only (never predicted). */
export function useConsumables(world: World): void {
  pass = world;
  world.players.forEach(usePlayer);
  pass = null;
}

/**
 * Review M1: the last aim input, kept `aimMemoryS` worth of applied ticks. Written only from aim
 * input (never from movement), counted down on applied ticks without aim. Re-review L: the length
 * is kept in METRES, decoded the way the client encoded it — a flagged input with a throwable in the slot in the throw's range,
 * any other in the in-hand launcher's (else the slot's throw range) — and converted at the throw.
 */
export function rememberAim(world: Readonly<World>, p: PlayerState, input: Readonly<PlayerInput> | undefined): void {
  const len = input ? Math.hypot(input.aimX, input.aimY) : 0;
  if (input && len >= MIN_AIM_LEN) {
    p.lastAimX = input.aimX / len;
    p.lastAimY = input.aimY / len;
    const launcherM = input.consumable && throwStatsOf(world.balance, p.consumable) ? 0 : launcherRangeInHand(world, p);
    const rangeM = launcherM > 0 ? launcherM : (throwStatsOf(world.balance, p.consumable)?.lobRangeM ?? 0);
    p.lastAimM = rangeM > 0 ? Math.min(1, len) * rangeM : -1;
    p.lastAimTicks = aimMemoryTicks(world.balance);
  } else if (p.lastAimTicks > 0) p.lastAimTicks--;
}

/** Where a throw goes (`throwDirection`'s output; reuse one). */
export interface ThrowAim {
  dx: number;
  dy: number;
  /** The aim length handed to `lobTarget` (a fraction of the throw range). */
  len: number;
  /** Which rule picked it (tests, logs). */
  source: "aim" | "memory" | "zombie" | "facing";
}

export const createThrowAim = (): ThrowAim => ({ dx: 1, dy: 0, len: 1, source: "facing" });

/**
 * C-D + review M1 (deterministic, shared; server and solo): the throw's direction and length. The
 * input's aim when it has one (L5: on the flagged input the client always encodes the THROW's
 * range, so the length is a fraction of `throwRangeM` whatever is in hand); else the last aim
 * direction while remembered (`aimMemoryS`); else the nearest alive zombie within reach (muzzle +
 * throw range; the first in pool order on a tie; none behind a building), at its distance; else the facing direction at full
 * range. Never the move direction by itself (a kiting touch player doesn't throw onto their own path).
 */
export function throwDirection(world: Readonly<World>, p: Readonly<PlayerState>, input: Readonly<PlayerInput>, stats: Readonly<ThrowStats>, out: ThrowAim): ThrowAim {
  const aimLen = Math.hypot(input.aimX, input.aimY);
  if (aimLen >= MIN_AIM_LEN) {
    out.dx = input.aimX / aimLen;
    out.dy = input.aimY / aimLen;
    out.len = Math.min(1, aimLen);
    out.source = "aim";
    return out;
  }
  if (p.lastAimTicks > 0) {
    out.dx = p.lastAimX;
    out.dy = p.lastAimY;
    out.len = p.lastAimM < 0 ? 1 : Math.min(1, p.lastAimM / stats.lobRangeM);
    out.source = "memory";
    return out;
  }
  const offset = p.radiusM + MUZZLE_OFFSET_M;
  const reach = offset + stats.lobRangeM;
  const z = world.zombies;
  let best = -1;
  let bestD2 = reach * reach;
  for (let k = 0; k < z.aliveCount; k++) {
    const id = z.aliveIds[k] as number;
    const dx = (z.x[id] as number) - p.x;
    const dy = (z.y[id] as number) - p.y;
    const d2 = dx * dx + dy * dy;
    // Re-review NIT: a zombie behind a building (the throw would stop at its face) never wins over a visible one.
    if (d2 < bestD2 && d2 > 1e-9 && lobBlockT(world, p.x, p.y, z.x[id] as number, z.y[id] as number) < 0) {
      bestD2 = d2;
      best = id;
    }
  }
  if (best >= 0) {
    const d = Math.sqrt(bestD2);
    out.dx = ((z.x[best] as number) - p.x) / d;
    out.dy = ((z.y[best] as number) - p.y) / d;
    out.len = Math.min(1, Math.max(0, (d - offset) / stats.lobRangeM));
    out.source = "zombie";
    return out;
  }
  out.dx = p.facingX;
  out.dy = p.facingY;
  out.len = 1;
  out.source = "facing";
  return out;
}

const aim = createThrowAim();

/** A launcher in `p`'s hands right now (alive, not swapping): its range scales the aim length. */
export function launcherRangeInHand(world: Readonly<World>, p: Readonly<PlayerState>): number {
  if (p.status !== "alive" || p.loadout.swapTicks > 0) return 0;
  const stats = weaponStats(world.balance, activeSlot(p.loadout).weapon);
  return stats.kind === "launcher" ? stats.lobRangeM : 0;
}

/**
 * The CLIENT's landing ring with a launcher in hand: the current (non-throw) input carries the
 * launcher's encoding, so the ring converts it to the throw's (same metres). The flagged input itself
 * always carries the throw's own range (review L5), which the server reads as is. No aim → 1.
 */
export function throwAimLength(stats: Readonly<ThrowStats>, aimLen: number, launcherRangeM: number): number {
  if (!(aimLen >= MIN_AIM_LEN)) return 1;
  return launcherRangeM > 0 ? (aimLen * launcherRangeM) / stats.lobRangeM : aimLen;
}

/** C-A … C-E for one flagged input. Returns true when an item was used. */
export function tryUseConsumable(world: World, p: PlayerState, input: Readonly<PlayerInput>): boolean {
  if (p.status !== "alive" || p.consumable === null || p.consumableCount <= 0) {
    consumableCounters.refusedRule++;
    return false;
  }
  if (p.consumableCooldownTicks > 0) {
    consumableCounters.refusedCooldown++;
    return false;
  }
  const s = consumableStats(world.balance, p.consumable);
  if (!s) return false;
  const phase = world.run.phase;
  const index = consumableIndex(world.balance, p.consumable);
  if (s.kind === "heal") {
    if ((phase !== "build" && phase !== "wave") || p.hp >= p.maxHp) {
      consumableCounters.refusedRule++;
      return false;
    }
    p.hp = Math.min(p.maxHp, p.hp + (s.healHp ?? 0));
    consumableCounters.heals++;
  } else {
    const stats = throwStatsOf(world.balance, p.consumable);
    if (phase !== "wave" || !stats) {
      consumableCounters.refusedRule++;
      return false;
    }
    throwDirection(world, p, input, stats, aim);
    if (!throwConsumable(world, p, index, stats, aim.dx, aim.dy, aim.len, input.seq)) return false;
    consumableCounters.throws++;
  }
  p.consumableCount--;
  if (p.consumableCount <= 0) {
    p.consumableCount = 0;
    p.consumable = null;
  }
  p.consumableCooldownTicks = consumableCooldownTicks(world.balance);
  consumableCounters.used++;
  world.events.emit({ type: "consumable.used", playerId: p.id, item: index });
  return true;
}

/**
 * Story 5.12 (cosmetic, D: "all three kept"): the look variant (0–2) of a throw / its fire zone,
 * from the landing point in whole centimetres (the wire's precision: every client and solo pick the
 * same one; no simulation stream is drawn, so the run's randomness is untouched).
 */
export function throwVariant(x: number, y: number, variants = 3): number {
  let h = Math.imul(Math.round(x * 100) | 0, 0x9e3779b1) ^ Math.imul(Math.round(y * 100) | 0, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % variants) | 0;
}
