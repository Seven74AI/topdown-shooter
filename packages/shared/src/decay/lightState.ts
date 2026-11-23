import type { World } from "../core/world";
import type { Building } from "../buildings/buildings";
import type { FireRecord } from "./decayState";

/**
 * Story 5.10: the light-source list (architecture › Blackout Lighting: "the server owns the light
 * state … which light sources exist"). One entry per standing building whose type has a `light`
 * block (floodlights) plus one per burning decay fire (`world.decay.fires`).
 *
 * It is DERIVED on every copy of the World (server, solo, the client's NetSimHost mirror): never
 * synced and never in `snapshotWorld`. `updateLightState` rebuilds it only when `buildings.version`
 * or the burning-fire set changes (one compare per tick, reusing the entry objects; no allocation
 * after the list first reaches its size). Order: fires first (map order), then floodlights in
 * building-id order. No blackout flag yet: Story 6.3 adds it and reads this list.
 *
 * Review L2 — READ IT THROUGH `lightsOf(world)` (Story 6.3 too): the server's World refreshes the
 * list at the end of the `buildings` system, so after a floodlight is destroyed later in the same tick
 * (combat, a zombie hit, a fire pulse) `world.lights.list` lags one tick; `lightsOf` brings it up to
 * date first (one compare when nothing changed).
 */
export type LightKind = "floodlight" | "fire";

export interface LightSource {
  kind: LightKind;
  /** Centre (m). */
  x: number;
  y: number;
  /** The normal radius (m): a floodlight's `light.radiusM`, a fire's `radiusM`. */
  radiusM: number;
  /** Epic 6 D5: the radius during a blackout wave (a fire: its normal radius). */
  blackoutRadiusM: number;
  /** The floodlight's building id; 0 for fires. */
  buildingId: number;
}

export interface LightState {
  readonly list: LightSource[];
  /** `buildings.version` at the last rebuild (−1: never built). */
  buildingsVersion: number;
  /** Bit mask of the burning fires' indexes at the last rebuild. */
  firesKey: number;
  /** Fire count at the last rebuild (a key of 0 with fires is impossible, but keep both). */
  firesCount: number;
  /** Rebuilds so far (tests: "no rebuild when nothing changed"). */
  rebuilds: number;
  /** Entry objects kept across rebuilds (the list reuses them). */
  readonly pool: LightSource[];
}

export function createLightState(): LightState {
  return { list: [], buildingsVersion: -1, firesKey: 0, firesCount: 0, rebuilds: 0, pool: [] };
}

function firesKeyOf(fires: readonly FireRecord[]): number {
  let k = 0;
  for (let i = 0; i < fires.length; i++) k |= 1 << ((fires[i] as FireRecord).index & 31);
  return k >>> 0;
}

function entry(s: LightState, i: number): LightSource {
  let e = s.pool[i];
  if (!e) {
    e = { kind: "fire", x: 0, y: 0, radiusM: 0, blackoutRadiusM: 0, buildingId: 0 };
    s.pool.push(e);
  }
  return e;
}

/**
 * Brings `world.lights` up to date (returns whether it was rebuilt). Called at the end of the
 * `buildings` system (server, solo), after every `applyDecayStage` and after the mirror applies
 * buildings (client); `lightsOf` calls it too, so a reader always sees the current list.
 */
export function updateLightState(world: World): boolean {
  const s = world.lights;
  const fires = world.decay.fires;
  const key = firesKeyOf(fires);
  if (s.buildingsVersion === world.buildings.version && s.firesKey === key && s.firesCount === fires.length) return false;
  s.buildingsVersion = world.buildings.version;
  s.firesKey = key;
  s.firesCount = fires.length;
  s.rebuilds++;
  const list = s.list;
  list.length = 0;
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i] as FireRecord;
    const e = entry(s, list.length);
    e.kind = "fire";
    e.x = f.x;
    e.y = f.y;
    e.radiusM = f.radiusM;
    e.blackoutRadiusM = f.radiusM;
    e.buildingId = 0;
    list.push(e);
  }
  const types = world.balance.buildings.types;
  const bl = world.buildings.list;
  for (let i = 0; i < bl.length; i++) {
    const b = bl[i] as Building;
    const light = Object.prototype.hasOwnProperty.call(types, b.type) ? types[b.type]?.light : undefined;
    if (!light) continue;
    const e = entry(s, list.length);
    e.kind = "floodlight";
    e.x = (b.minX + b.maxX) / 2;
    e.y = (b.minY + b.maxY) / 2;
    e.radiusM = light.radiusM;
    e.blackoutRadiusM = light.blackoutRadiusM;
    e.buildingId = b.id;
    list.push(e);
  }
  return true;
}

/** The current light-source list (brought up to date first: one compare when nothing changed). */
export function lightsOf(world: World): readonly LightSource[] {
  updateLightState(world);
  return world.lights.list;
}
