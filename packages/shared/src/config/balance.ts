import type { z } from "zod";
import { canonicalJson, fnv1a32 } from "../core/hash";
import { balanceFileSchemas, type BalanceFileName, type BuildingTypeStats } from "./balanceSchema";
import { ZOMBIE_TYPES } from "../zombies/zombieTypes";
import { THREAT_BUCKETS, THREAT_BUCKET_TICKS } from "../boss/bossState";
import { TICK_RATE_HZ } from "./constants";
import { MAX_PLAYERS } from "../net/messages";
import { MAX_FIXED_PER_WAVE, ZOMBIE_POOL_CAPACITY } from "./constants";

/** Story 6.8 (F2): never an event in this wave. */
export const EVENT_FORBIDDEN_WAVE = 5;
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
import gear from "./balance/gear.json" with { type: "json" };
import consumables from "./balance/consumables.json" with { type: "json" };
import boss from "./balance/boss.json" with { type: "json" };
import events from "./balance/events.json" with { type: "json" };

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

const BUNDLED: RawBalanceFiles = { weapons, zombies, waves, player, controls, economy, bots, buildings, shop, decay, combat, gear, consumables, boss, events };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Checks between files (each file is valid on its own). Story 5.13: the card shop excludes only known items. */
/** Largest zombie radius the flow field's pinch/vertex clearance rule supports (half a 0.5 m cell's diagonal, rounded down). */
export const MAX_PATHING_ZOMBIE_RADIUS_M = 0.35;

function crossCheck(parsed: Record<string, unknown>, issues: string[]): void {
  const weapons = parsed.weapons as Record<string, unknown>;
  // Story 5.13: the ids kept out of the card shop are weapons or gear.
  const shop = parsed.shop as { excludeFromCards: readonly string[] };
  const gearItems = (parsed.gear as { items: Record<string, unknown> }).items;
  shop.excludeFromCards.forEach((id, i) => {
    if (!(id in weapons) && !(id in gearItems)) issues.push(`shop.json: excludeFromCards.${i}: unknown item ${id}`);
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
  // Story 6.12: the endless size cap and Brute cap fit.
  const wx = parsed.waves as {
    mix: readonly unknown[];
    evac: { everyWaves: number };
    endless: { maxZombiesPerWave: number; oddWaveMix: number; evenWaveMix: number; bossEveryWaves: number };
  };
  // Review L5: a vote after every endless Behemoth wave (6.11 F6 / 6.12 F4): the two cadences are one.
  if (wx.evac.everyWaves !== wx.endless.bossEveryWaves) issues.push(`waves.json: evac.everyWaves ${wx.evac.everyWaves} must equal endless.bossEveryWaves ${wx.endless.bossEveryWaves} (a vote opens after every endless Behemoth wave)`);
  // (No "≥ wave 10's size" check: tests shorten or lengthen the run with `runWaves` overrides; the cap only applies past runWaves.)
  if (Math.round(wx.endless.maxZombiesPerWave * Math.max(1, ...wv.playerCountScale)) > 65535) issues.push(`waves.json: endless.maxZombiesPerWave would hold more than the 65,535 a wave can count`);
  for (const k of ["oddWaveMix", "evenWaveMix"] as const) {
    if (wx.endless[k] > wx.mix.length) issues.push(`waves.json: endless.${k} ${wx.endless[k]} names a wave past the ${wx.mix.length} mix entries`);
  }
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
  // Story 6.1: every fixed zombie of a wave has a spawn point (`fixedAtFractions`, or the default) and a slot in the preallocated list.
  const fracs = (parsed.waves as { fixedAtFractions?: readonly number[] }).fixedAtFractions ?? [];
  const mostFixed = Math.max(0, ...fixedList.map((m) => Object.values(m).reduce((a, c) => a + c, 0)));
  if (mostFixed > MAX_FIXED_PER_WAVE) issues.push(`waves.json: a fixed entry holds ${mostFixed} zombies, more than the ${MAX_FIXED_PER_WAVE} a wave can place`);
  if (fracs.length > 0 && fracs.length < mostFixed) issues.push(`waves.json: fixedAtFractions has ${fracs.length} entries but a wave holds ${mostFixed} fixed zombies (list one point each, or leave it empty for fixedAtFraction)`);
  if (buildings.spawnClearM <= waves.spawnJitterM + maxRz) {
    issues.push(`buildings.json: spawnClearM ${buildings.spawnClearM} must exceed waves.spawnJitterM + the largest zombie radius (${waves.spawnJitterM + maxRz})`);
  }
  crossCheckBuildingTypes(parsed.buildings as { types: Record<string, BuildingTypeStats> }, issues);
  crossCheckFlames(parsed, issues);
  crossCheckBlackout(parsed, issues);
  crossCheckBoss(parsed, issues);
  crossCheckEvents(parsed, issues);
}

/**
 * Story 6.3 (F2): a zombie touching a survivor is always inside their glow (`glowM` > every zombie
 * radius + the player's radius). The lightPctByWave range (0–100) is the schema's.
 */
function crossCheckBlackout(parsed: Record<string, unknown>, issues: string[]): void {
  const glowM = (parsed.decay as { blackout: { glowM: number } }).blackout.glowM;
  const pr = (parsed.player as { radiusM: number }).radiusM;
  for (const [id, t] of Object.entries((parsed.zombies as { types: Record<string, { radiusM: number }> }).types)) {
    if (t.radiusM + pr >= glowM) issues.push(`decay.json: blackout.glowM ${glowM} m must exceed zombies.json types.${id}.radiusM ${t.radiusM} + player.radiusM ${pr} (F2: a zombie touching you is always lit)`);
  }
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
 * upgrade; `turret`, `trap`, `mine` (Story 5.10: `light`, `heal`) exclude each other; traps and mines are floor.
 */
/** Review L4: what a building type is, by its blocks (a type with none is a plain wall: a barricade). */
function buildingKind(t: BuildingTypeStats): "turret" | "trap" | "mine" | "light" | "heal" | "bearTrap" | "barricade" {
  return t.turret ? "turret" : t.trap ? "trap" : t.mine ? "mine" : t.light ? "light" : t.heal ? "heal" : t.bearTrap ? "bearTrap" : "barricade";
}

function crossCheckBuildingTypes(buildings: { types: Record<string, BuildingTypeStats> }, issues: string[]): void {
  const types = buildings.types;
  for (const [id, t] of Object.entries(types)) {
    const kinds = (t.turret ? 1 : 0) + (t.trap ? 1 : 0) + (t.mine ? 1 : 0) + (t.light ? 1 : 0) + (t.heal ? 1 : 0) + (t.bearTrap ? 1 : 0);
    if (kinds > 1) issues.push(`buildings.json: types.${id}: turret, trap, mine, light, heal and bearTrap exclude each other`);
    if (t.stopsBullets && !t.solid) issues.push(`buildings.json: types.${id}: stopsBullets needs a wall (solid: true)`);
    if (t.upgradesTo && types[t.upgradesTo.type] && types[t.upgradesTo.type]?.stopsBullets !== t.stopsBullets) issues.push(`buildings.json: types.${id}: an upgrade must keep stopsBullets`);
    if ((t.trap || t.mine || t.bearTrap) && t.solid) issues.push(`buildings.json: types.${id}: a trap or mine must be floor (solid: false)`);
    // Story 5.14: the plate fits inside the footprint (a catch is always on the drawn trap).
    if (t.bearTrap && t.bearTrap.plateRadiusM * 2 > Math.min(t.widthM, t.depthM)) issues.push(`buildings.json: types.${id}.bearTrap.plateRadiusM must fit inside the footprint`);
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

/**
 * Story 6.5: the boss fits the run. Its alive cap is at most the normal one, its body paths on its
 * own grid (boxes grown so 0.35 m + inflateM covers its radius). The entry names are checked against
 * the Downtown map in `boss/behemoth.test.ts` (the balance knows no map).
 */
function crossCheckBoss(parsed: Record<string, unknown>, issues: string[]): void {
  const boss = parsed.boss as { aliveCap: number; radiusM: number; pathing: { inflateM: number }; target: { threatWindowS: number } };
  // Review L4: the threat ring is preallocated (THREAT_BUCKETS × THREAT_BUCKET_TICKS); the window must match it.
  const ringS = (THREAT_BUCKETS * THREAT_BUCKET_TICKS) / TICK_RATE_HZ;
  if (Math.abs(boss.target.threatWindowS - ringS) > 1e-9) issues.push(`boss.json: target.threatWindowS ${boss.target.threatWindowS} must be ${ringS} (the threat ring: ${THREAT_BUCKETS} buckets of ${THREAT_BUCKET_TICKS} ticks)`);
  // Stories 6.6 / 6.7 (AC 1).
  const b2 = parsed.boss as {
    charge: { laneWidthM: number; minLaneM: number; distM: number; minM: number; maxM: number };
    throw: { minM: number; unreachableMinM: number };
    enrage: { crawlerEveryS: number[] };
  };
  const edge = (parsed.boss as { edgeGraceM: number }).edgeGraceM;
  if (!(b2.charge.laneWidthM / 2 - edge > 0)) issues.push(`boss.json: charge.laneWidthM / 2 must exceed edgeGraceM ${edge}`);
  if (b2.charge.minLaneM > b2.charge.distM) issues.push(`boss.json: charge.minLaneM ${b2.charge.minLaneM} exceeds distM ${b2.charge.distM}`);
  if (b2.charge.minM > b2.charge.maxM) issues.push(`boss.json: charge.minM exceeds maxM`);
  if (b2.throw.unreachableMinM > b2.throw.minM) issues.push(`boss.json: throw.unreachableMinM exceeds minM`);
  // Review L2: the Predictor tells the charge's shove from every other knock by its mm per tick
  // (it slides in up to PREDICTION_CHARGE_SNAP_M); no other knock may share that step.
  const step = (m: number, s: number): number => {
    const t = Math.max(1, Math.round(s * TICK_RATE_HZ));
    return Math.round((m * 1000) / t);
  };
  const bk = parsed.boss as { charge: { shoveM: number; shoveS: number }; slam: { pushM: number; pushS: number }; enrage: { roarPushM: number; roarPushS: number } };
  const chargeStep = step(bk.charge.shoveM, bk.charge.shoveS);
  const others: [string, number][] = [
    ["slam push", step(bk.slam.pushM, bk.slam.pushS)],
    ["roar push", step(bk.enrage.roarPushM, bk.enrage.roarPushS)],
  ];
  const ztypes = (parsed.zombies as { types: Record<string, { hitKnockbackM?: number; knockbackS?: number }> }).types;
  for (const [id, t] of Object.entries(ztypes)) if ((t.hitKnockbackM ?? 0) > 0) others.push([`${id} knockback`, step(t.hitKnockbackM ?? 0, t.knockbackS ?? 0.2)]);
  for (const [name, st] of others) if (st === chargeStep) issues.push(`boss.json: charge shove step ${chargeStep} mm/tick equals the ${name} step (the Predictor tells a charge knock by it)`);
  // Review L1: attack.hitMask is a 32-bit integer (slot bits, then slot-less players).
  if (MAX_PLAYERS > 31) issues.push(`MAX_PLAYERS ${MAX_PLAYERS} exceeds the charge hit mask's 31 bits`);
  const scaleLen = (parsed.waves as { playerCountScale: number[] }).playerCountScale.length;
  if (b2.enrage.crawlerEveryS.length !== scaleLen) issues.push(`boss.json: enrage.crawlerEveryS needs ${scaleLen} entries (one per player count)`);
  const maxAlive = (parsed.waves as { maxAlive: number }).maxAlive;
  if (boss.aliveCap > maxAlive) issues.push(`boss.json: aliveCap ${boss.aliveCap} exceeds waves.maxAlive ${maxAlive}`);
  if (MAX_PATHING_ZOMBIE_RADIUS_M + boss.pathing.inflateM + 1e-9 < boss.radiusM) {
    issues.push(`boss.json: pathing.inflateM ${boss.pathing.inflateM} + ${MAX_PATHING_ZOMBIE_RADIUS_M} m is less than radiusM ${boss.radiusM}`);
  }
}

/**
 * Story 6.8 (F2): the event waves are never wave 5 (waves past `waves.runWaves` are skipped by the scheduler), and hold at least one allowed pair
 * (two waves that are not neighbours); the stampede's over-cap allowance fits the zombie pool.
 */
function crossCheckEvents(parsed: Record<string, unknown>, issues: string[]): void {
  const ev = parsed.events as { perRun: number; waves: readonly number[]; stampede: { overCap: number; countByPlayers: readonly number[] }; banners: Record<string, string> };
  const maxAlive = (parsed.waves as { maxAlive: number }).maxAlive;
  for (const w of ev.waves) {
    if (w === EVENT_FORBIDDEN_WAVE) issues.push(`events.json: waves: ${w} is never an event wave (F2)`);
  }
  if (ev.perRun >= 2) {
    let pair = false;
    for (const a of ev.waves) for (const b of ev.waves) if (b - a >= 2) pair = true;
    if (!pair) issues.push("events.json: waves holds no two waves that are not neighbours (F2)");
  }
  // (a test balance whose maxAlive is the pool itself has nothing to check: the pool is the cap)
  if (maxAlive < ZOMBIE_POOL_CAPACITY && maxAlive + ev.stampede.overCap > ZOMBIE_POOL_CAPACITY) issues.push(`events.json: stampede.overCap ${ev.stampede.overCap} + waves.maxAlive ${maxAlive} exceeds the zombie pool (${ZOMBIE_POOL_CAPACITY})`);
  for (const k of ["car_alarm", "stampede", "gas_leak", "supply_drop", "power_failure", "survivor", "survivor_saved", "survivor_lost"]) if (!(k in ev.banners)) issues.push(`events.json: banners.${k} is missing`);
  // Stories 6.9 / 6.10: the crate's weapons exist and its level is a real level; the power failure's waves are event waves.
  const ext = parsed.events as { supplyDrop?: { weapons: readonly string[]; level: number }; powerFailure?: { waves: readonly number[] } };
  const weaponIds = Object.keys((parsed.weapons as { weapons?: Record<string, unknown> }).weapons ?? (parsed.weapons as Record<string, unknown>));
  const maxLevel = (parsed.shop as { upgrades?: { maxLevel: number } }).upgrades?.maxLevel ?? 1;
  if (ext.supplyDrop) {
    for (const w of ext.supplyDrop.weapons) if (!weaponIds.includes(w)) issues.push(`events.json: supplyDrop.weapons: ${w} is not a weapon`);
    if (ext.supplyDrop.level > maxLevel) issues.push(`events.json: supplyDrop.level ${ext.supplyDrop.level} exceeds shop upgrades.maxLevel ${maxLevel}`);
  }
  if (ext.powerFailure) for (const w of ext.powerFailure.waves) if (!ev.waves.includes(w)) issues.push(`events.json: powerFailure.waves: ${w} is not one of events.waves`);
}
