import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { PlayerInput } from "../net/input";
import { MIN_AIM_LEN } from "../config/constants";
import { activeSlot } from "./loadout";
import { weaponStats } from "./weapons";
import { throwConsumable } from "./grenades";
import { consumableCooldownTicks, consumableIndex, consumableStats, throwStatsOf, type ThrowStats } from "../economy/consumables";

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
 *   `throwRangeM`]; with no aim (touch with the aim stick released) the facing direction at full
 *   range. The aim length carries the distance like the launcher's (D11): a fraction of the
 *   throw range, or — while a launcher is in hand, whose encoding the client then sends — of the
 *   launcher's range (`throwAimLength`, the one decoding the client's landing ring uses too).
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
  if (!input?.consumable) return;
  tryUseConsumable(world, p, input);
};

/** The combat system's first step (Story 5.12). Server and solo only (never predicted). */
export function useConsumables(world: World): void {
  pass = world;
  world.players.forEach(usePlayer);
  pass = null;
}

/** A launcher in `p`'s hands right now (alive, not swapping): its range scales the aim length. */
export function launcherRangeInHand(world: Readonly<World>, p: Readonly<PlayerState>): number {
  if (p.status !== "alive" || p.loadout.swapTicks > 0) return 0;
  const stats = weaponStats(world.balance, activeSlot(p.loadout).weapon);
  return stats.kind === "launcher" ? stats.lobRangeM : 0;
}

/**
 * The aim length to hand `lobTarget` for a throw with `stats`, from the input's aim length: the
 * client encodes the distance as `aimLen × range`, where range is the launcher's while one is in
 * hand (`launcherRangeM` > 0) and the throw's own otherwise. No aim → 1 (full range).
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
    const aimLen = Math.hypot(input.aimX, input.aimY);
    let dx: number;
    let dy: number;
    if (aimLen >= MIN_AIM_LEN) {
      dx = input.aimX / aimLen;
      dy = input.aimY / aimLen;
    } else {
      dx = p.facingX;
      dy = p.facingY;
    }
    if (!throwConsumable(world, p, index, stats, dx, dy, throwAimLength(stats, aimLen, launcherRangeInHand(world, p)), input.seq)) return false;
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
