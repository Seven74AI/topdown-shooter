import type { World } from "../core/world";
import { AREA_KIND, clearAreas, createAreaPool, replaced, spawnArea, type AreaPool } from "./areaPool";
import { consumableStatsAt, molotovConeAt, molotovTicksAt } from "../economy/consumables";
import { shotBlockT } from "../combat/cover";
import { coneClipCm, coneDirX, coneDirY, coneHeading, coneScaleAt, sdMolotovZone, type MolotovConeShape } from "./molotovCone";

/**
 * Story 5.12: molotov fire zones on the ground (5.6's area pool, kind FIRE, for the slot, lifetime and
 * cap) with their thrower (kill credit, friendly fire) and the consumable they came from (damage, pulse).
 * Story 9.18 (MO-R): the zone is a teardrop along the throw (`hazards/molotovCone.ts`), growing from
 * `cone.reachStartM` to `cone.reachEndM` over `cone.growS` and cut at the first shot blocker ahead.
 * The pool's `radiusM` holds the cone's full-size bounding radius (the pool's own circle test is never
 * used for fire zones).
 *
 * Fairness rules (tests in `combat/consumables.test.ts`):
 * - **M-A the fire is exactly where it is drawn:** a body of radius r burns while the zone's signed
 *   distance at its centre is < r (strict): `sdMolotovZone` = max(sdCone(p / k)·k, u − clipM) in the
 *   zone's frame (u along the throw from the impact), k the growth scale at the zone's age in ticks.
 *   The client draws the same function from the same `molotov.ignited` event (impact, u8 heading, clip
 *   in cm, back-dated age; no per-tick state on the wire), and the sim stores the quantised direction
 *   and the centimetre clip so both hold the same numbers to the bit (B2).
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
  /** Story 9.18, per slot: the throw's u8 heading and its unit vector (quantised: B2). */
  readonly heading: Uint8Array;
  readonly dirX: Float64Array;
  readonly dirY: Float64Array;
  /** Story 9.18, per slot: the clip along the throw (m, whole cm: the first shot blocker ahead, else the full reach). */
  readonly clipM: Float64Array;
  /** Story 9.18, per slot: the item's cone constants (a reference into the balance table; null when free). */
  readonly cone: (MolotovConeShape | null)[];
  /** The next zone id (u16 on the wire; 1–65535, wraps; never 0). */
  nextId: number;
}

export function createMolotovZones(capacity: number): MolotovZones {
  return {
    areas: createAreaPool(capacity),
    owner: new Array<string | null>(capacity).fill(null),
    item: new Uint8Array(capacity),
    heading: new Uint8Array(capacity),
    dirX: new Float64Array(capacity),
    dirY: new Float64Array(capacity),
    clipM: new Float64Array(capacity),
    cone: new Array<MolotovConeShape | null>(capacity).fill(null),
    nextId: 1,
  };
}

/** Molotov zones so far (tests and liveness checks; not read by the sim). */
export const molotovStats = { ignited: 0, replaced: 0, zombieHits: 0, playerHits: 0, kills: 0 };

/**
 * Lights a zone of consumable `item` (index) at (x, y) for `owner`, pointing along (dirX, dirY) (the
 * throw: start → landing; quantised to the u8 heading, a zero vector reads as +x); emits
 * `molotov.ignited`. Returns the slot (-1: capacity 0 or not a molotov).
 */
export function igniteMolotov(world: World, item: number, x: number, y: number, owner: string | null, dirX = 1, dirY = 0): number {
  const m = world.molotovs;
  const s = consumableStatsAt(world.balance, item);
  const cone = molotovConeAt(world.balance, item);
  if (!s || s.kind !== "molotov" || !cone) return -1;
  const id = m.nextId;
  m.nextId = id >= 65535 ? 1 : id + 1;
  const slot = spawnArea(m.areas, world.balance.consumables.maxLiveMolotovZones, AREA_KIND.FIRE, id, x, y, cone.boundU + cone.boundR, molotovTicksAt(world.balance, item).durationTicks, world.tick);
  if (slot < 0) return -1;
  if (replaced.id >= 0) molotovStats.replaced++;
  const h = coneHeading(dirX, dirY);
  const ux = coneDirX(h);
  const uy = coneDirY(h);
  // AC 4: the free run ahead along the throw, to the first shot blocker (walls, cars, the bus, buildings).
  const reach = cone.reachEndM;
  const t = shotBlockT(world, x, y, x + ux * reach, y + uy * reach);
  const clipCm = coneClipCm(t < 0 ? reach : t * reach);
  m.owner[slot] = owner;
  m.item[slot] = item;
  m.heading[slot] = h;
  m.dirX[slot] = ux;
  m.dirY[slot] = uy;
  m.clipM[slot] = clipCm / 100;
  m.cone[slot] = cone;
  molotovStats.ignited++;
  world.events.emit({ type: "molotov.ignited", zoneId: id, item, x, y, playerId: owner, dirX: ux, dirY: uy, clipM: clipCm / 100 });
  return slot;
}

/**
 * The first live zone (lowest slot) that burns the circle (x, y, r), or -1: the teardrop at the zone's
 * age, cut at its clip, reaches the circle strictly (M-A, Story 9.18; a bounding-circle reject first,
 * B4) AND (M-D, main-session decision 2026-11-23, the 5.6 acid rule) no shot blocker
 * stands between the body's centre and the zone's centre — map walls, cars, the bus and buildings
 * shield it; barricades, sandbags, turrets and traps don't. A zone lit at a face (its centre pulled
 * back `faceBackoffM`) still burns that side: blocker entries within `fireFaceToleranceM` of the
 * centre are ignored. Deterministic (slot order), allocation-free.
 */
export function molotovZoneAt(world: Readonly<World>, x: number, y: number, r: number): number {
  const a = world.molotovs.areas;
  if (a.count === 0) return -1;
  const m = world.molotovs;
  const faceTol = world.balance.consumables.fireFaceToleranceM;
  for (let i = 0; i < a.capacity; i++) {
    if (a.active[i] !== 1) continue;
    const cone = m.cone[i];
    if (!cone) continue;
    const cx = a.x[i] as number;
    const cy = a.y[i] as number;
    const ux = m.dirX[i] as number;
    const uy = m.dirY[i] as number;
    const k = coneScaleAt(cone, world.tick - (a.bornTick[i] as number));
    const dx = x - cx;
    const dy = y - cy;
    // B4: the cheap reject (the bounding circle at this size).
    const bx = dx - ux * cone.boundU * k;
    const by = dy - uy * cone.boundU * k;
    const br = cone.boundR * k + r;
    if (bx * bx + by * by >= br * br) continue;
    const u = dx * ux + dy * uy;
    const v = dy * ux - dx * uy;
    if (sdMolotovZone(cone, k, m.clipM[i] as number, u, v) >= r) continue;
    const d2 = dx * dx + dy * dy;
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
      m.cone[i] = null;
    }
  }
}

/** Every build start and the run's end: no zones (D3: waves only). The id counter keeps counting. */
export function clearMolotovZones(world: World): void {
  const m = world.molotovs;
  clearAreas(m.areas);
  m.owner.fill(null);
  m.cone.fill(null);
}
