import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { LauncherStats } from "../config/balanceSchema";
import { MUZZLE_OFFSET_M, TICK_RATE_HZ } from "../config/constants";
import { lobBlockT, segmentBoxEntryT } from "./cover";
import { createExplosionSpec, explode } from "./explosion";
import { playerWeaponDamage, weaponIds, type WeaponId } from "./weapons";
import { consumableAt, consumableStatsAt } from "../economy/consumables";
import { igniteMolotov } from "../hazards/molotov";

/**
 * Story 5.5: lobbed rounds (the Grenade Launcher; 5.12's hand grenades and molotovs reuse the lob).
 *
 * Fairness rules (tests in `grenades.test.ts`):
 *
 * - **FR-A the round lands where you aimed:** the landing point is the aim point, `distM` along the
 *   raw aim from the muzzle, clamped to [`minLobM`, `lobRangeM`]. The aim vector's length carries the
 *   distance: `distM = |aim| × lobRangeM` (the client encodes it, `lobAimLength`). The client's
 *   landing ring is drawn at `lobTarget` too: one function for the sim, the marker and the own-shot copy.
 * - **FR-B only real buildings stop the round (designer 2026-11-23, replacing "no lob over cars"):**
 *   it flies a straight ground track from the shooter's centre through the muzzle to the landing
 *   point; if that track enters a building (`lobBlockT`: map walls flagged `building`), the round
 *   bursts at the entry point pulled back `faceBackoffM` toward the shooter (never behind the
 *   shooter's centre). It flies over cars, the bus, gas pumps, low walls, barriers, sandbags,
 *   barricades and turrets, and over zombies (the arc is cosmetic).
 * - **FR-B2 it never lands inside cover:** an aim point inside a shot blocker it flew over (a car
 *   roof) lands at that blocker's near face instead, pulled back the same way, so the blast's
 *   line-of-sight rule (FR-C, from the centre) still sees around it.
 * - **FR-E/F:** it bursts on the server's landing tick (`landTick`), on the zombies where they are
 *   then (no rewind), through `explode` (one hit per body). Nothing per tick goes on the wire: the
 *   launch is one `grenade.launched` (start, landing point, landing tick), the burst one
 *   `explosion.happened`.
 *
 * The pool is struct-of-arrays, pre-allocated to `combat.json › explosion.maxLiveRounds`, dense
 * (freeing swaps the last round into the hole). A round whose owner left keeps flying and bursts
 * with no credit (its player damage already at the friendly-fire share). Cleared at every build
 * start and at the run's end. No allocation after creation.
 */
/** Story 5.12: what `lobTarget` / `lobAimLength` read (a launcher's stats, or a throwable consumable's). */
export type LobRange = Pick<LauncherStats, "minLobM" | "lobRangeM">;
/** Story 5.12: what `lobFlightTicks` reads. */
export type LobFlight = Pick<LauncherStats, "lobSpeedMps" | "minFlightS">;

export interface GrenadePool {
  readonly capacity: number;
  readonly x0: Float64Array;
  readonly y0: Float64Array;
  readonly tx: Float64Array;
  readonly ty: Float64Array;
  /** The server tick it bursts on (`world.tick` during that tick's combat system). */
  readonly landTick: Int32Array;
  /** The shooter (references; null = none). */
  readonly owner: (string | null)[];
  /** Index into `weaponIds(balance)`. */
  readonly weapon: Uint8Array;
  /** The weapon's upgrade level at launch (5.1: an upgrade bought later doesn't change a round in flight). */
  readonly level: Uint8Array;
  /** u8 id (1–255, wraps; never 0 = "no round"). */
  readonly id: Uint8Array;
  /** Story 5.12: 0 = a weapon's round; k = a thrown consumable (index k − 1 in `consumables.json`). */
  readonly item: Uint8Array;
  count: number;
  nextId: number;
}

export function createGrenadePool(capacity: number): GrenadePool {
  return {
    capacity,
    x0: new Float64Array(capacity),
    y0: new Float64Array(capacity),
    tx: new Float64Array(capacity),
    ty: new Float64Array(capacity),
    landTick: new Int32Array(capacity),
    owner: new Array<string | null>(capacity).fill(null),
    weapon: new Uint8Array(capacity),
    level: new Uint8Array(capacity),
    id: new Uint8Array(capacity),
    item: new Uint8Array(capacity),
    count: 0,
    nextId: 1,
  };
}

/** No rounds (build start, run end). The id counter keeps counting (deterministic either way). */
export function clearGrenades(pool: GrenadePool): void {
  for (let i = 0; i < pool.count; i++) pool.owner[i] = null;
  pool.count = 0;
}

function freeGrenade(pool: GrenadePool, i: number): void {
  const last = pool.count - 1;
  if (i < 0 || i > last) return;
  if (i !== last) {
    pool.x0[i] = pool.x0[last] as number;
    pool.y0[i] = pool.y0[last] as number;
    pool.tx[i] = pool.tx[last] as number;
    pool.ty[i] = pool.ty[last] as number;
    pool.landTick[i] = pool.landTick[last] as number;
    pool.owner[i] = pool.owner[last] ?? null;
    pool.weapon[i] = pool.weapon[last] as number;
    pool.level[i] = pool.level[last] as number;
    pool.id[i] = pool.id[last] as number;
    pool.item[i] = pool.item[last] as number;
  }
  pool.owner[last] = null;
  pool.count--;
}

/** Counters summed over every World (tests, sims, liveness asserts: reset them first). */
export const grenadeCounters = { launched: 0, landed: 0, coverStops: 0, poolFull: 0, thrown: 0, handBlasts: 0, molotovsLanded: 0 };

/** Where a lob lands (`lobTarget`'s output; reuse one). */
export interface LobTarget {
  /** The muzzle (the round's start). */
  x0: number;
  y0: number;
  /** The landing point (the aim point, or in front of the first cover face on the track). */
  x: number;
  y: number;
  /** Muzzle → landing distance along the track (m; 0 when cover right at the muzzle stops it). */
  distM: number;
  /** A shot blocker stopped it (FR-B). */
  blocked: boolean;
}

export function createLobTarget(): LobTarget {
  return { x0: 0, y0: 0, x: 0, y: 0, distM: 0, blocked: false };
}

/**
 * FR-A + FR-B: where a round lobbed by a body of radius `radiusM` at (px, py) along the unit
 * (dirX, dirY) with aim length `aimLen` (0–1) lands. Pure (reads only the World's obstacle lists);
 * the server, solo, bots, the client's landing ring and the own-shot copy all call it.
 */
export function lobTarget(world: Readonly<World>, stats: Readonly<LobRange>, px: number, py: number, radiusM: number, dirX: number, dirY: number, aimLen: number, out: LobTarget): LobTarget {
  const offset = radiusM + MUZZLE_OFFSET_M;
  const mx = px + dirX * offset;
  const my = py + dirY * offset;
  const wanted = Math.min(stats.lobRangeM, Math.max(stats.minLobM, (Number.isFinite(aimLen) ? aimLen : 1) * stats.lobRangeM));
  const ex = mx + dirX * wanted;
  const ey = my + dirY * wanted;
  out.x0 = mx;
  out.y0 = my;
  // The track starts at the body's centre: a building pressed against the muzzle still stops it.
  const full = offset + wanted;
  const backoff = world.balance.combat.explosion.faceBackoffM;
  const t = lobBlockT(world, px, py, ex, ey);
  let along = t < 0 ? full : Math.max(0, t * full - backoff);
  let blocked = t >= 0;
  // FR-B2: never land inside cover (a few passes: a pulled-back point may sit in a box touching it).
  for (let pass = 0; pass < MAX_LAND_PASSES && along > 0; pass++) {
    const tIn = blockerEntryAt(world, px, py, ex, ey, px + dirX * along, py + dirY * along);
    if (tIn < 0) break;
    along = Math.max(0, tIn * full - backoff);
    blocked = true;
  }
  out.x = blocked ? px + dirX * along : ex;
  out.y = blocked ? py + dirY * along : ey;
  out.distM = blocked ? Math.max(0, along - offset) : wanted;
  out.blocked = blocked;
  return out;
}

/** Passes of FR-B2 (cars parked bumper to bumper: each pass moves to the next box's face). */
const MAX_LAND_PASSES = 8;

/**
 * FR-B2: the track's entry t (centre (px, py) → (ex, ey)) into the earliest shot blocker that
 * strictly contains the point (lx, ly), or -1 when the point is in none.
 */
function blockerEntryAt(world: Readonly<World>, px: number, py: number, ex: number, ey: number, lx: number, ly: number): number {
  const list = world.obstacles.shotBlockers;
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as { minX: number; minY: number; maxX: number; maxY: number };
    if (!(lx > b.minX && lx < b.maxX && ly > b.minY && ly < b.maxY)) continue;
    const tb = segmentBoxEntryT(px, py, ex - px, ey - py, b.minX, b.minY, b.maxX, b.maxY);
    if (tb >= 0 && (best < 0 || tb < best)) best = tb;
  }
  return best;
}

/**
 * The aim length a client sends for a lob of `distM` from the muzzle (FR-A, the inverse of
 * `lobTarget`'s distance): clamp(distM / lobRangeM, minLobM / lobRangeM, 1).
 */
export function lobAimLength(stats: Readonly<LobRange>, distM: number): number {
  const d = Number.isFinite(distM) ? distM : stats.lobRangeM;
  return Math.min(1, Math.max(stats.minLobM / stats.lobRangeM, d / stats.lobRangeM));
}

/** Flight time in ticks for a lob of `distM` (≥ 1): max(minFlightS, distM / lobSpeedMps), rounded to ticks. */
export function lobFlightTicks(stats: Readonly<LobFlight>, distM: number): number {
  return Math.max(1, Math.round(Math.max(stats.minFlightS, distM / stats.lobSpeedMps) * TICK_RATE_HZ));
}

const target = createLobTarget();

/**
 * Lobs one round for `p` (the launcher branch of `tryFire`). Returns false when the pool is full
 * (then nothing is spent: no ammo, no cooldown, no events; counted in `grenadeCounters.poolFull`).
 */
export function launchGrenade(world: World, p: PlayerState, weapon: WeaponId, level: number, stats: Readonly<LauncherStats>, dirX: number, dirY: number, aimLen: number, seq = 0): boolean {
  const pool = world.grenades;
  if (pool.count >= pool.capacity) {
    grenadeCounters.poolFull++;
    return false;
  }
  lobTarget(world, stats, p.x, p.y, p.radiusM, dirX, dirY, aimLen, target);
  const i = pool.count++;
  const id = pool.nextId;
  pool.nextId = id >= 255 ? 1 : id + 1;
  pool.x0[i] = target.x0;
  pool.y0[i] = target.y0;
  pool.tx[i] = target.x;
  pool.ty[i] = target.y;
  pool.landTick[i] = world.tick + lobFlightTicks(stats, target.distM);
  pool.owner[i] = p.id;
  pool.weapon[i] = Math.max(0, weaponIds(world.balance).indexOf(weapon));
  pool.level[i] = level;
  pool.id[i] = id;
  pool.item[i] = 0;
  grenadeCounters.launched++;
  if (target.blocked) grenadeCounters.coverStops++;
  world.events.emit({
    type: "grenade.launched",
    playerId: p.id,
    grenadeId: id,
    x: target.x0,
    y: target.y0,
    tx: target.x,
    ty: target.y,
    landTick: pool.landTick[i] as number,
    flightTicks: (pool.landTick[i] as number) - world.tick,
    seq: seq & 0xffff,
  });
  return true;
}

/**
 * Story 5.12: throws one consumable (`item` = its index) for `p` along the unit (dirX, dirY) with aim
 * length `aimLen` — the same lob as the launcher (FR-A clamp, FR-B only buildings stop it, FR-B2
 * never inside cover), with the item's own range and speed. Emits `grenade.launched` with `item`.
 * Returns false when the pool is full (nothing spent).
 */
export function throwConsumable(world: World, p: PlayerState, item: number, stats: Readonly<LobRange & LobFlight>, dirX: number, dirY: number, aimLen: number, seq = 0): boolean {
  const pool = world.grenades;
  if (pool.count >= pool.capacity) {
    grenadeCounters.poolFull++;
    return false;
  }
  lobTarget(world, stats, p.x, p.y, p.radiusM, dirX, dirY, aimLen, target);
  const i = pool.count++;
  const id = pool.nextId;
  pool.nextId = id >= 255 ? 1 : id + 1;
  pool.x0[i] = target.x0;
  pool.y0[i] = target.y0;
  pool.tx[i] = target.x;
  pool.ty[i] = target.y;
  pool.landTick[i] = world.tick + lobFlightTicks(stats, target.distM);
  pool.owner[i] = p.id;
  pool.weapon[i] = 0;
  pool.level[i] = 1;
  pool.id[i] = id;
  pool.item[i] = item + 1;
  grenadeCounters.thrown++;
  if (target.blocked) grenadeCounters.coverStops++;
  world.events.emit({
    type: "grenade.launched",
    playerId: p.id,
    grenadeId: id,
    x: target.x0,
    y: target.y0,
    tx: target.x,
    ty: target.y,
    landTick: pool.landTick[i] as number,
    flightTicks: (pool.landTick[i] as number) - world.tick,
    seq: seq & 0xffff,
    item: item + 1,
  });
  return true;
}

const spec = createExplosionSpec();

/**
 * Story 5.12: a thrown consumable lands at `spec.x, spec.y`: a hand grenade bursts (`explode`, the
 * EX2 `hand_grenade` look; zombies full, players the friendly-fire share, no building damage: 5.5
 * D4), a molotov lights a fire zone (`hazards/molotov.ts`).
 */
function landConsumable(world: World, item: number, owner: string | null, dirX: number, dirY: number): void {
  const s = consumableStatsAt(world.balance, item);
  if (!s) return;
  const present = owner !== null && world.players.has(owner);
  if (s.kind === "molotov") {
    grenadeCounters.molotovsLanded++;
    // Story 9.18 (AC 3): the cone points along the throw (start → landing), fixed at landing.
    igniteMolotov(world, item, spec.x, spec.y, present ? owner : null, dirX, dirY);
    return;
  }
  if (s.kind !== "grenade") return;
  const dmg = s.damage ?? 0;
  spec.radiusM = s.radiusM ?? 0;
  spec.zombieDamage = dmg;
  spec.playerDamage = present ? dmg : Math.round((dmg * world.balance.combat.friendlyFire.pct) / 100);
  spec.buildingDamage = 0;
  spec.pushM = 0;
  spec.kind = "hand_grenade";
  spec.sourcePlayerId = present ? owner : null;
  spec.weapon = consumableAt(world.balance, item) ?? "";
  spec.buildingId = 0;
  spec.quiet = true;
  grenadeCounters.handBlasts++;
  explode(world, spec);
}

/** Rounds whose landing tick has come burst (in the combat system, after the projectiles). */
export function updateGrenades(world: World): void {
  const pool = world.grenades;
  const ids = weaponIds(world.balance);
  for (let i = pool.count - 1; i >= 0; i--) {
    if (world.tick < (pool.landTick[i] as number)) continue;
    const weapon = ids[pool.weapon[i] as number] ?? "";
    const stats = world.balance.weapons[weapon];
    const owner = pool.owner[i] ?? null;
    spec.x = pool.tx[i] as number;
    spec.y = pool.ty[i] as number;
    spec.grenadeId = pool.id[i] as number;
    const level = pool.level[i] as number;
    const item = pool.item[i] as number;
    const dirX = spec.x - (pool.x0[i] as number);
    const dirY = spec.y - (pool.y0[i] as number);
    freeGrenade(pool, i); // first: a blast never sees its own round
    if (item > 0) {
      landConsumable(world, item - 1, owner, dirX, dirY);
      if (i > pool.count) i = pool.count;
      continue;
    }
    if (!stats || stats.kind !== "launcher") continue;
    // Story 7.5: the launcher round carries its owner's damage Training (an owner who left: Training 0).
    const dmg = playerWeaponDamage(world.balance, owner === null ? null : (world.players.get(owner) ?? null), weapon, level);
    // The owner left: no credit, and the friendly-fire share applied here (no player source to apply it).
    const present = owner !== null && world.players.has(owner);
    spec.radiusM = stats.blastRadiusM;
    spec.zombieDamage = dmg;
    spec.playerDamage = present ? dmg : Math.round((dmg * world.balance.combat.friendlyFire.pct) / 100);
    spec.buildingDamage = stats.blastBuildingDamage;
    spec.pushM = stats.blastPushM;
    spec.kind = "grenade";
    spec.sourcePlayerId = present ? owner : null;
    spec.weapon = weapon;
    spec.buildingId = 0;
    spec.quiet = true;
    grenadeCounters.landed++;
    explode(world, spec);
    if (i > pool.count) i = pool.count; // defensive: a blast never launches rounds
  }
}
