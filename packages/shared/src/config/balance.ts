import type { z } from "zod";
import { canonicalJson, fnv1a32 } from "../core/hash";
import { balanceFileSchemas, type BalanceFileName, type BuildingTypeStats } from "./balanceSchema";
import { ZOMBIE_TYPES } from "../zombies/zombieTypes";
import weapons from "./balance/weapons.json" with { type: "json" };
import zombies from "./balance/zombies.json" with { type: "json" };
import waves from "./balance/waves.json" with { type: "json" };
import player from "./balance/player.json" with { type: "json" };
import controls from "./balance/controls.json" with { type: "json" };
import economy from "./balance/economy.json" with { type: "json" };
import bots from "./balance/bots.json" with { type: "json" };
import buildings from "./balance/buildings.json" with { type: "json" };
import shop from "./balance/shop.json" with { type: "json" };
import decay from "./balance/decay.json" with { type: "json" };
import combat from "./balance/combat.json" with { type: "json" };

type Schemas = typeof balanceFileSchemas;

/** Raw (unvalidated) contents of every balance file. */
export type RawBalanceFiles = { [K in BalanceFileName]: unknown };

/** Every tunable gameplay number, validated and frozen. Systems read it via `world.balance`. */
export type Balance = { readonly version: string } & {
  readonly [K in BalanceFileName]: DeepReadonly<z.output<Schemas[K]>>;
};

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** Thrown when a balance file is invalid; the message names the file and the key. */
export class BalanceError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "BalanceError";
  }
}

const BUNDLED: RawBalanceFiles = { weapons, zombies, waves, player, controls, economy, bots, buildings, shop, decay, combat };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Checks between files (each file is valid on its own). Story 3.3: the shop sells only known weapons. */
/** Largest zombie radius the flow field's pinch/vertex clearance rule supports (half a 0.5 m cell's diagonal, rounded down). */
export const MAX_PATHING_ZOMBIE_RADIUS_M = 0.35;

function crossCheck(parsed: Record<string, unknown>, issues: string[]): void {
  const weapons = parsed.weapons as Record<string, unknown>;
  const shop = parsed.shop as { weapons: readonly string[] };
  shop.weapons.forEach((id, i) => {
    if (!(id in weapons)) issues.push(`shop.json: weapons.${i}: unknown weapon ${id}`);
  });
  // Story 5.1: every weapon can be upgraded and no upgrade is free (a 0 price is a balance bug).
  const share = (parsed.shop as { upgrades: { priceShare: number } }).upgrades.priceShare;
  for (const [id, w] of Object.entries(weapons as Record<string, { price: number; upgradeBasePrice?: number }>)) {
    if (Math.round(share * (w.upgradeBasePrice ?? w.price)) < 1) issues.push(`weapons.json: ${id}: its upgrade price is 0 (set upgradeBasePrice)`);
  }
  // 3.4 re-review: a zombie spawned with the largest jitter must still be clear of any building.
  const zombies = parsed.zombies as { types: Record<string, { radiusM: number }> };
  const waves = parsed.waves as { spawnJitterM: number };
  const buildings = parsed.buildings as { spawnClearM: number };
  // Story 3.10: every wave mix names zombie types that exist (and that the wire can carry).
  const mixes = (parsed.waves as { mix: readonly Record<string, number>[] }).mix;
  mixes.forEach((m, i) => {
    for (const id of Object.keys(m)) {
      if (!(id in zombies.types)) issues.push(`waves.json: mix.${i}: unknown zombie type ${id}`);
      else if (!(ZOMBIE_TYPES as readonly string[]).includes(id)) issues.push(`waves.json: mix.${i}: ${id} is not in ZOMBIE_TYPES`);
    }
  });
  // 3.10 review: the biggest wave (last wave, full party) must fit the Uint16 per-type counts.
  const wv = parsed.waves as { zombiesPerWave: number; runWaves: number; playerCountScale: readonly number[] };
  const biggest = Math.round(wv.runWaves * wv.zombiesPerWave * Math.max(1, ...wv.playerCountScale));
  if (biggest > 65535) issues.push(`waves.json: the last wave would hold ${biggest} zombies, more than the 65,535 a wave can count`);
  const maxRz = Math.max(0, ...Object.values(zombies.types).map((t) => t.radiusM));
  // 3.5 re-review: the flow field's pinch rule assumes a body fits a free cell diagonal (0.354 m
  // clearance past two corners). Story 5.7 (D1): a `wideBody` type paths on the wide grid, whose
  // boxes are grown by `pathing.wideInflateM`: there the limit is 0.35 m + that.
  const inflate = (parsed.zombies as { pathing: { wideInflateM: number } }).pathing.wideInflateM;
  for (const [id, t] of Object.entries(zombies.types as Record<string, { radiusM: number; wideBody: boolean }>)) {
    const limit = t.wideBody ? MAX_PATHING_ZOMBIE_RADIUS_M + inflate : MAX_PATHING_ZOMBIE_RADIUS_M;
    if (t.radiusM > limit + 1e-9) {
      issues.push(
        t.wideBody
          ? `zombies.json: types.${id}: a wide body of ${t.radiusM} m exceeds ${limit} m (${MAX_PATHING_ZOMBIE_RADIUS_M} m + pathing.wideInflateM), the largest the wide grid supports`
          : `zombies.json: types.${id}: a zombie radius of ${t.radiusM} m exceeds ${MAX_PATHING_ZOMBIE_RADIUS_M} m, the largest the flow field's clearance rule supports (set wideBody for a wider type)`,
      );
    }
  }
  // Story 5.7: fixed per-wave counts name known types and fit the smallest (solo) wave they are in.
  const fixedList = (parsed.waves as { fixed: readonly Record<string, number>[] }).fixed;
  const soloScale = Math.min(...wv.playerCountScale);
  fixedList.forEach((m, i) => {
    let sum = 0;
    for (const [id, c] of Object.entries(m)) {
      sum += c;
      if (!(id in zombies.types)) issues.push(`waves.json: fixed.${i}: unknown zombie type ${id}`);
      else if (!(ZOMBIE_TYPES as readonly string[]).includes(id)) issues.push(`waves.json: fixed.${i}: ${id} is not in ZOMBIE_TYPES`);
    }
    const smallest = Math.max(1, Math.round((i + 1) * wv.zombiesPerWave * soloScale));
    if (sum > smallest) issues.push(`waves.json: fixed.${i}: ${sum} fixed zombies exceed the smallest wave ${i + 1} (${smallest} solo)`);
  });
  if (buildings.spawnClearM <= waves.spawnJitterM + maxRz) {
    issues.push(`buildings.json: spawnClearM ${buildings.spawnClearM} must exceed waves.spawnJitterM + the largest zombie radius (${waves.spawnJitterM + maxRz})`);
  }
  crossCheckBuildingTypes(parsed.buildings as { types: Record<string, BuildingTypeStats> }, issues);
  crossCheckFlames(parsed, issues);
}

/**
 * Story 5.4: a flame weapon's friendly-fire pulse at level I (`damage × playerPulseS × pct / 100`)
 * is whole (player HP stays whole; higher levels round per pulse in `damagePlayerBy`), and a mine's
 * `playerShare` equals the friendly-fire share (an owned mine's blast goes through the one rule).
 */
function crossCheckFlames(parsed: Record<string, unknown>, issues: string[]): void {
  const pct = (parsed.combat as { friendlyFire: { pct: number } }).friendlyFire.pct;
  for (const [id, w] of Object.entries(parsed.weapons as Record<string, { kind: string; damage: number; playerPulseS?: number }>)) {
    if (w.kind !== "flame") continue;
    const v = (w.damage * (w.playerPulseS ?? 0) * pct) / 100;
    if (Math.abs(v - Math.round(v)) > 1e-9) issues.push(`weapons.json: ${id}: damage × playerPulseS × friendlyFire.pct / 100 = ${v} must be a whole number (player HP is whole)`);
  }
  for (const [id, t] of Object.entries((parsed.buildings as { types: Record<string, BuildingTypeStats> }).types)) {
    if (t.mine && Math.abs(t.mine.playerShare * 100 - pct) > 1e-9) issues.push(`buildings.json: types.${id}.mine.playerShare ${t.mine.playerShare} must equal combat.json friendlyFire.pct / 100 (${pct / 100}): the blast uses the friendly-fire rule`);
  }
}

/**
 * Story 5.9: the upgrade ladder and the floor types. An `upgradesTo` names an existing upgrade-only
 * type (`forSale: false`) with the same footprint whose `price` is this price + the step (the
 * "total paid" rule: repairs and refunds use it, F9); no cycles; floor types (`solid: false`) never
 * upgrade; `turret`, `trap` and `mine` exclude each other; traps and mines are floor.
 */
/** Review L4: what a building type is, by its blocks (a type with none is a plain wall: a barricade). */
function buildingKind(t: BuildingTypeStats): "turret" | "trap" | "mine" | "barricade" {
  return t.turret ? "turret" : t.trap ? "trap" : t.mine ? "mine" : "barricade";
}

function crossCheckBuildingTypes(buildings: { types: Record<string, BuildingTypeStats> }, issues: string[]): void {
  const types = buildings.types;
  for (const [id, t] of Object.entries(types)) {
    const kinds = (t.turret ? 1 : 0) + (t.trap ? 1 : 0) + (t.mine ? 1 : 0);
    if (kinds > 1) issues.push(`buildings.json: types.${id}: turret, trap and mine exclude each other`);
    if ((t.trap || t.mine) && t.solid) issues.push(`buildings.json: types.${id}: a trap or mine must be floor (solid: false)`);
    const up = t.upgradesTo;
    if (!up) continue;
    if (!t.solid) issues.push(`buildings.json: types.${id}: a floor type can't upgrade`);
    const next = Object.prototype.hasOwnProperty.call(types, up.type) ? types[up.type] : undefined;
    if (!next) {
      issues.push(`buildings.json: types.${id}.upgradesTo: unknown type ${up.type}`);
      continue;
    }
    if (next.forSale) issues.push(`buildings.json: types.${id}.upgradesTo: ${up.type} must be upgrade-only (forSale: false)`);
    if (next.widthM !== t.widthM || next.depthM !== t.depthM || next.solid !== t.solid) issues.push(`buildings.json: types.${id}.upgradesTo: ${up.type} must have the same footprint`);
    // Review L4: the same kind of building (a barricade stays a barricade: no turret, trap or mine block appears or goes).
    if (buildingKind(next) !== buildingKind(t)) issues.push(`buildings.json: types.${id}.upgradesTo: ${up.type} must be the same kind of building (${buildingKind(t)}, not ${buildingKind(next)})`);
    if (next.price !== t.price + up.price) issues.push(`buildings.json: types.${id}.upgradesTo: ${up.type}'s price must be ${t.price} + ${up.price} = ${t.price + up.price} (the total paid)`);
  }
  // No cycles: following upgradesTo from any type ends within the number of types.
  const n = Object.keys(types).length;
  for (const id of Object.keys(types)) {
    let cur: string | undefined = id;
    let steps = 0;
    while (cur !== undefined && steps <= n) {
      cur = types[cur]?.upgradesTo?.type;
      steps++;
    }
    if (steps > n) {
      issues.push(`buildings.json: types.${id}: the upgrade ladder loops`);
      break;
    }
  }
}

/**
 * Validates balance files into one typed, frozen `Balance` object.
 * With no argument it loads the JSON bundled with the package.
 */
export function loadBalance(raw: RawBalanceFiles = BUNDLED): Balance {
  const issues: string[] = [];
  const parsed: Record<string, unknown> = {};
  for (const name of Object.keys(balanceFileSchemas) as BalanceFileName[]) {
    if (!(name in raw) || raw[name] === undefined) {
      issues.push(`${name}.json: file missing`);
      continue;
    }
    const result = balanceFileSchemas[name].safeParse(raw[name]);
    if (result.success) {
      parsed[name] = result.data;
    } else {
      for (const issue of result.error.issues) {
        const path = issue.path.map(String).join(".") || "(root)";
        issues.push(`${name}.json: ${path}: ${issue.message}`);
      }
    }
  }
  if (issues.length === 0) crossCheck(parsed, issues);
  if (issues.length > 0) throw new BalanceError(issues);

  const version = fnv1a32(canonicalJson(parsed)).toString(16).padStart(8, "0");
  return deepFreeze({ version, ...parsed }) as Balance;
}

/** A deep copy of the balance files bundled with the package (to apply overrides to). */
export function bundledBalanceFiles(): RawBalanceFiles {
  return JSON.parse(JSON.stringify(BUNDLED)) as RawBalanceFiles;
}

/** One override: a value at a dotted path inside one balance file, e.g. `["weapons", "machete.arcDeg", 120]`. */
export type BalanceOverride = readonly [file: BalanceFileName, path: string, value: number];

/**
 * Returns a copy of `raw` with each override applied (Story 1.12 live tuning). Overrides of keys
 * that don't exist are ignored. The result still goes through `loadBalance()`, so an invalid value
 * fails validation like any balance edit.
 */
export function withOverrides(raw: RawBalanceFiles, overrides: readonly BalanceOverride[]): RawBalanceFiles {
  const out = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  for (const [file, path, value] of overrides) {
    const keys = path.split(".");
    let node = out[file] as Record<string, unknown> | undefined;
    for (let i = 0; node && i < keys.length - 1; i++) node = node[keys[i] as string] as Record<string, unknown> | undefined;
    const last = keys[keys.length - 1] as string;
    if (node && typeof node === "object" && last in node) node[last] = value;
  }
  return out as RawBalanceFiles;
}
