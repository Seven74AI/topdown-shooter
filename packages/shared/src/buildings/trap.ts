import type { TrapStats } from "../config/balanceSchema";
import type { World } from "../core/world";
import { ticksFor } from "../core/time";
import { killZombie, zombieTypeOf } from "../zombies/zombiePool";
import { circleOverlapsBox } from "./collision";
import { buildingStats, damageBuilding, type Building } from "./buildings";

/**
 * Story 5.9: spike traps (GDD › Buildings and Defenses: 4 damage/s, 40 % slow; FR52).
 *
 * Runs in the `buildings` slot (D4: after turrets, before combat and the zombies' movement), so the
 * slow written here is this tick's speed in `updateZombies`. Server and solo only (zombies are never
 * predicted). Fairness rules:
 *
 * - **F2 per body:** a zombie whose body circle overlaps a trap square (strict, `circleOverlapsBox`)
 *   moves `slowPct` % slower this tick and fills its OWN spike clock (`zombies.trapTicks`, one tick
 *   per tick on any trap); every `pulseS` of time on traps it takes `damagePerS × pulseS`. The clock
 *   is kept while off the trap (walking on and off never dodges, 4.8 D3) and zeroed at each build
 *   start (`resetBurnClocks`, 4.8 D19) and on spawn. Overlapping or touching traps never stack: one
 *   slow (the largest), one clock, one hit, charged to the lowest-id trap under the body.
 * - **F3 wear:** each spike hit costs that trap `wearPerHit` HP; at 0 it is removed like a broken
 *   barricade (`damageBuilding`: `building.destroyed`; `version` +1, `wallVersion` untouched).
 * - **Credit:** a spike kill is the trap's (`buildingId`) and its owner's (`killerId`), paid like a
 *   turret kill (3.6 M1: the owner's own damage makes it their kill). No `zombie.hit` per pulse
 *   (the 4.8 D8 pattern: no event spam); kills are ordinary `zombie.killed` events.
 * - Players are never touched (they walk on traps unharmed and unslowed).
 *
 * Cost: ≤ 24 traps × alive zombies box tests per tick; no allocation (a module-level trap list).
 */

/** Trap buildings this tick, `nt` valid entries (refilled every tick; grows once to the building cap). */
const traps: Building[] = [];
const trapStatsOf: (Readonly<TrapStats> | undefined)[] = [];

/** What the trap system did, summed over every World (tests, sims, liveness asserts: reset it first). */
export const trapCounters = { pulses: 0, kills: 0, wornOut: 0 };

export function updateTraps(world: World): void {
  const z = world.zombies;
  const list = world.buildings.list;
  let nt = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid) continue;
    const t = buildingStats(world.balance, b.type)?.trap;
    if (!t) continue;
    traps[nt] = b;
    trapStatsOf[nt] = t;
    nt++;
  }
  // From the end: a kill swap-removes from `aliveIds`.
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    if (nt === 0) {
      z.slowPct[id] = 0;
      continue;
    }
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const x = z.x[id] as number;
    const y = z.y[id] as number;
    let slow = 0;
    let first = -1;
    for (let k = 0; k < nt; k++) {
      const b = traps[k] as Building;
      if (b.hp <= 0 || !circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) continue;
      const t = trapStatsOf[k] as Readonly<TrapStats>;
      if (t.slowPct > slow) slow = t.slowPct;
      if (first < 0) first = k; // list order = id order: the lowest id under the body
    }
    z.slowPct[id] = slow;
    if (first < 0) continue;
    const trap = traps[first] as Building;
    const t = trapStatsOf[first] as Readonly<TrapStats>;
    const clock = (z.trapTicks[id] as number) + 1;
    if (clock < ticksFor(t.pulseS)) {
      z.trapTicks[id] = clock;
      continue;
    }
    z.trapTicks[id] = 0;
    trapCounters.pulses++;
    z.hp[id] = (z.hp[id] as number) - Math.round(t.damagePerS * t.pulseS);
    const owner = trap.ownerId;
    const trapId = trap.id;
    const type = trap.type;
    if (t.wearPerHit > 0 && damageBuilding(world, trap, t.wearPerHit)) trapCounters.wornOut++; // F3 (removed: hp 0, skipped above for later zombies)
    if ((z.hp[id] as number) <= 0) {
      killZombie(world, id, owner, type, trapId);
      trapCounters.kills++;
    }
  }
}
