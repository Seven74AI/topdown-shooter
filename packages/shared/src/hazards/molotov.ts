import type { World } from "../core/world";
import { AREA_KIND, clearAreas, createAreaPool, replaced, spawnArea, type AreaPool } from "./areaPool";
import { consumableStatsAt, molotovTicksAt } from "../economy/consumables";
import { shotBlockT } from "../combat/cover";

/**
 * Story 5.12: molotov fire zones — round fire areas on the ground (5.6's area pool, kind FIRE) with
 * their thrower (kill credit, friendly fire) and the consumable they came from (damage, pulse).
 *
 * Fairness rules (tests in `combat/consumables.test.ts`):
 * - **M-A the fire is exactly where it is drawn:** a body burns while its circle overlaps the zone
 *   circle (strict, the 4.8 D7/D16 ring rule); the client draws its ring at `radiusM` from the same
 *   `molotov.ignited` event (no per-tick state on the wire).
 * - **M-B per-body clock (4.8 D3):** the damage is in `decay/fire.ts › updateFires`, which counts ONE
 *   fire clock per body over car fires and molotov zones together: a pulse every `pulseS` spent in
 *   any fire, kept while outside (stepping out on the pulse tick dodges nothing), and never two fire
 *   hits for one pulse (zones and car fires don't stack).
 * - **M-D cover (main-session decision 2026-11-23, the 5.6 acid rule):** a body burns only with a
 *   clear line from the zone's centre (walls, cars, the bus, buildings block; barricades and
 *   sandbags don't): fire never reaches behind a car it was thrown against (`molotovZoneAt`).
 * - **M-C lifetime in ticks:** a zone is damage-eligible on exactly `durationS` worth of ticks (it
 *   counts down after the damage pass, like 5.6's puddles), then ends. At the cap
 *   (`consumables.json › maxLiveMolotovZones`) a new zone replaces the oldest. Every build start
 *   clears them (waves only, D3), and they never touch the nav grid (D4: zombies walk through and burn).
 *
 * Pre-allocated; spawning, burning and ending never allocate.
 */
export interface MolotovZones {
  readonly areas: AreaPool;
  /** Per slot: the thrower (null: nobody / left). */
  readonly owner: (string | null)[];
  /** Per slot: the consumable index it came from. */
  readonly item: Uint8Array;
  /** The next zone id (u16 on the wire; 1–65535, wraps; never 0). */
  nextId: number;
}

export function createMolotovZones(capacity: number): MolotovZones {
  return { areas: createAreaPool(capacity), owner: new Array<string | null>(capacity).fill(null), item: new Uint8Array(capacity), nextId: 1 };
}

/** Molotov zones so far (tests and liveness checks; not read by the sim). */
export const molotovStats = { ignited: 0, replaced: 0, zombieHits: 0, playerHits: 0, kills: 0 };

/**
 * Lights a zone of consumable `item` (index) at (x, y) for `owner`; emits `molotov.ignited`. Returns
 * the slot (-1: capacity 0).
 */
export function igniteMolotov(world: World, item: number, x: number, y: number, owner: string | null): number {
  const m = world.molotovs;
  const s = consumableStatsAt(world.balance, item);
  if (!s || s.kind !== "molotov") return -1;
  const id = m.nextId;
  m.nextId = id >= 65535 ? 1 : id + 1;
  const slot = spawnArea(m.areas, world.balance.consumables.maxLiveMolotovZones, AREA_KIND.FIRE, id, x, y, s.radiusM ?? 0, molotovTicksAt(world.balance, item).durationTicks, world.tick);
  if (slot < 0) return -1;
  if (replaced.id >= 0) molotovStats.replaced++;
  m.owner[slot] = owner;
  m.item[slot] = item;
  molotovStats.ignited++;
  world.events.emit({ type: "molotov.ignited", zoneId: id, item, x, y, playerId: owner });
  return slot;
}

/**
 * The first live zone (lowest slot) that burns the circle (x, y, r), or -1: the circle overlaps the
 * zone strictly AND (M-D, main-session decision 2026-11-23, the 5.6 acid rule) no shot blocker
 * stands between the body's centre and the zone's centre — map walls, cars, the bus and buildings
 * shield it; barricades, sandbags, turrets and traps don't. A zone lit at a face (its centre pulled
 * back `faceBackoffM`) still burns that side: blocker entries within `fireFaceToleranceM` of the
 * centre are ignored. Deterministic (slot order), allocation-free.
 */
export function molotovZoneAt(world: Readonly<World>, x: number, y: number, r: number): number {
  const a = world.molotovs.areas;
  if (a.count === 0) return -1;
  const faceTol = world.balance.consumables.fireFaceToleranceM;
  for (let i = 0; i < a.capacity; i++) {
    if (a.active[i] !== 1) continue;
    const cx = a.x[i] as number;
    const cy = a.y[i] as number;
    const dx = x - cx;
    const dy = y - cy;
    const rr = r + (a.radiusM[i] as number);
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const t = shotBlockT(world, x, y, cx, cy);
    if (t < 0 || (1 - t) * Math.sqrt(d2) <= faceTol) return i;
  }
  return -1;
}

/** M-C: every live zone counts down once (after the damage pass); at 0 it ends. */
export function ageMolotovZones(world: World): void {
  const m = world.molotovs;
  const a = m.areas;
  if (a.count === 0) return;
  for (let i = 0; i < a.capacity; i++) {
    if (a.active[i] !== 1) continue;
    const t = (a.ticksLeft[i] as number) - 1;
    a.ticksLeft[i] = t;
    if (t <= 0) {
      a.active[i] = 0;
      a.count--;
      m.owner[i] = null;
    }
  }
}

/** Every build start and the run's end: no zones (D3: waves only). The id counter keeps counting. */
export function clearMolotovZones(world: World): void {
  const m = world.molotovs;
  clearAreas(m.areas);
  m.owner.fill(null);
}
