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
 * building-id order.
 *
 * Story 6.3: beside the derived list, four flags are STATE (brief 26, DD6): `blackoutPct` and
 * `halfDark` (synced: RunState, the mirror sets them; in `snapshotWorld`), `powerFailure` (6.10) and
 * `forcedPct` (dev) (server/solo only; in `snapshotWorld`). `refreshBlackout` is their only writer on
 * the server and in solo (DD4); the client never computes a level itself. Nothing in the sim reads
 * them for gameplay (F8): only the client's darkness layer does.
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
  /** Story 6.3 (synced): 0 = no blackout; 1–100 = the light (percent of normal) unlit ground keeps. */
  blackoutPct: number;
  /** Story 6.3 (synced): the darkness is drawn at `blackout.halfDarkK` strength (6.4: build phases at stage 5). */
  halfDark: boolean;
  /** Story 6.3 (server/solo; set by 6.10): the power is out this wave. */
  powerFailure: boolean;
  /** Story 6.3 (dev only): a forced blackout level, −1 = off. */
  forcedPct: number;
}

export function createLightState(): LightState {
  return { list: [], buildingsVersion: -1, firesKey: 0, firesCount: 0, rebuilds: 0, pool: [], blackoutPct: 0, halfDark: false, powerFailure: false, forcedPct: -1 };
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
    e.blackoutRadiusM = world.balance.decay.blackout.fireLightM; // Story 6.3 (F7): a burning car lights 4 m in a blackout
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

/** Story 6.3: a blackout is on (the darkness layer draws). */
export function isBlackout(world: World): boolean {
  return world.lights.blackoutPct > 0;
}

/**
 * Story 6.3: the darkness alpha over unlit ground: `(1 − blackoutPct / 100) × (halfDark ? halfDarkK : 1)`,
 * 0 when off. Quality settings never change it (F6).
 */
export function darknessAlpha(world: World): number {
  const s = world.lights;
  if (s.blackoutPct <= 0) return 0;
  const a = 1 - Math.min(100, s.blackoutPct) / 100;
  return s.halfDark ? a * world.balance.decay.blackout.halfDarkK : a;
}

/** Story 6.3 (F7): a light's radius now: `blackoutRadiusM` during a blackout, else `radiusM`. */
export function lightRadiusOf(world: World, l: Readonly<LightSource>): number {
  return isBlackout(world) ? l.blackoutRadiusM : l.radiusM;
}

/** `lightPctByWave` entry of wave `n` (1-based); 0 outside the table. */
function wavePct(world: World, n: number): number {
  const t = world.balance.decay.blackout.lightPctByWave;
  return n >= 1 && n <= t.length ? (t[n - 1] as number) : 0;
}

/** Darkness alpha of a level (pct 0 = none), at half strength or not. */
function alphaOf(pct: number, half: boolean, halfDarkK: number): number {
  if (pct <= 0) return 0;
  const a = 1 - Math.min(100, pct) / 100;
  return half ? a * halfDarkK : a;
}

/**
 * Story 6.3 (DD4): the ONLY writer of `blackoutPct` and `halfDark`. Called at the end of `startBuild`,
 * in `startWave`, in `endRun`, by the dev force switch and by any mid-wave change (6.10's power
 * failure). The rule: a wave whose `lightPctByWave` entry is > 0 → it; a power failure during a wave
 * → `powerFailureLightPct`; a build phase with `halfDarkInBuild` and the coming (else the last)
 * wave's entry > 0 → that entry at half strength; else 0. (6.12 adds the endless rule here.)
 * Review H1 (FR87): the dev `forcedPct` (cheat, `?blackout=`, `DEV_FORCE_BLACKOUT`) may only DARKEN:
 * it applies (never half) when its darkness is at least the rule's, else the rule stands. Results
 * are always lit (review L8).
 */
export function refreshBlackout(world: World): void {
  const s = world.lights;
  const b = world.balance.decay.blackout;
  const phase = world.run.phase;
  let pct = 0;
  let half = false;
  if (phase === "results") {
    // lit, whatever the inputs
  } else if (phase === "wave") {
    const w = wavePct(world, world.waves.number);
    if (w > 0) pct = w;
    else if (s.powerFailure) pct = b.powerFailureLightPct;
  } else if (phase === "build" && b.halfDarkInBuild) {
    const coming = wavePct(world, world.waves.number + 1);
    const last = wavePct(world, world.waves.number);
    pct = coming > 0 ? coming : last;
    half = pct > 0;
  }
  const forcedA = alphaOf(s.forcedPct, false, b.halfDarkK);
  if (phase !== "results" && forcedA > 0 && forcedA >= alphaOf(pct, half, b.halfDarkK)) {
    pct = s.forcedPct;
    half = false;
  }
  s.blackoutPct = pct;
  s.halfDark = half;
}

/** Story 6.3 dev switch (cheat panel, `?blackout=`, `DEV_FORCE_BLACKOUT`): force a level (−1 = off), any phase but Results; it can only darken (review H1). */
export function setForcedBlackout(world: World, pct: number): void {
  world.lights.forcedPct = pct < 0 ? -1 : Math.min(100, Math.round(pct));
  refreshBlackout(world);
}
