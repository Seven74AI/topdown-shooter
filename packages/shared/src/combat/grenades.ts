import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { LauncherStats } from "../config/balanceSchema";
import { MUZZLE_OFFSET_M, TICK_RATE_HZ } from "../config/constants";
import { shotBlockT } from "./cover";
import { createExplosionSpec, explode } from "./explosion";
import { weaponDamage, weaponIds, type WeaponId } from "./weapons";

/**
 * Story 5.5: lobbed rounds (the Grenade Launcher; 5.12's hand grenades and molotovs reuse the lob).
 *
 * Fairness rules (tests in `grenades.test.ts`):
 *
 * - **FR-A the round lands where you aimed:** the landing point is the aim point, `distM` along the
 *   raw aim from the muzzle, clamped to [`minLobM`, `lobRangeM`]. The aim vector's length carries the
 *   distance: `distM = |aim| × lobRangeM` (the client encodes it, `lobAimLength`). The client's
 *   landing ring is drawn at `lobTarget` too: one function for the sim, the marker and the own-shot copy.
 * - **FR-B cars, the bus and buildings stop the round:** it flies a straight ground track from the
 *   shooter's centre through the muzzle to the landing point; if that track enters a shot blocker
 *   (4.2 `shotBlockT`), the round bursts at the entry point pulled back `faceBackoffM` toward the
 *   shooter (never behind the shooter's centre). Barriers, sandbags and barricades don't stop it.
 *   Zombies on the way are not hit: it flies over them (the arc is cosmetic).
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
  }
  pool.owner[last] = null;
  pool.count--;
}

/** Counters summed over every World (tests, sims, liveness asserts: reset them first). */
export const grenadeCounters = { launched: 0, landed: 0, coverStops: 0, poolFull: 0 };

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
 * (dirX, dirY) with aim length `aimLen` (0–1) lands. Pure (reads only the World's shot blockers);
 * the server, solo, bots, the client's landing ring and the own-shot copy all call it.
 */
export function lobTarget(world: Readonly<World>, stats: Readonly<LauncherStats>, px: number, py: number, radiusM: number, dirX: number, dirY: number, aimLen: number, out: LobTarget): LobTarget {
  const offset = radiusM + MUZZLE_OFFSET_M;
  const mx = px + dirX * offset;
  const my = py + dirY * offset;
  const wanted = Math.min(stats.lobRangeM, Math.max(stats.minLobM, (Number.isFinite(aimLen) ? aimLen : 1) * stats.lobRangeM));
  const ex = mx + dirX * wanted;
  const ey = my + dirY * wanted;
  out.x0 = mx;
  out.y0 = my;
  // The track starts at the body's centre: a car pressed against the muzzle still stops it.
  const t = shotBlockT(world, px, py, ex, ey);
  if (t < 0) {
    out.x = ex;
    out.y = ey;
    out.distM = wanted;
    out.blocked = false;
    return out;
  }
  const full = offset + wanted;
  const along = Math.max(0, t * full - world.balance.combat.explosion.faceBackoffM);
  out.x = px + dirX * along;
  out.y = py + dirY * along;
  out.distM = Math.max(0, along - offset);
  out.blocked = true;
  return out;
}

/**
 * The aim length a client sends for a lob of `distM` from the muzzle (FR-A, the inverse of
 * `lobTarget`'s distance): clamp(distM / lobRangeM, minLobM / lobRangeM, 1).
 */
export function lobAimLength(stats: Readonly<LauncherStats>, distM: number): number {
  const d = Number.isFinite(distM) ? distM : stats.lobRangeM;
  return Math.min(1, Math.max(stats.minLobM / stats.lobRangeM, d / stats.lobRangeM));
}

/** Flight time in ticks for a lob of `distM` (≥ 1): max(minFlightS, distM / lobSpeedMps), rounded to ticks. */
export function lobFlightTicks(stats: Readonly<LauncherStats>, distM: number): number {
  return Math.max(1, Math.round(Math.max(stats.minFlightS, distM / stats.lobSpeedMps) * TICK_RATE_HZ));
}

const target = createLobTarget();

/**
 * Lobs one round for `p` (the launcher branch of `tryFire`). Returns false when the pool is full
 * (then nothing is spent: no ammo, no cooldown, no events; counted in `grenadeCounters.poolFull`).
 */
export function launchGrenade(world: World, p: PlayerState, weapon: WeaponId, level: number, stats: Readonly<LauncherStats>, dirX: number, dirY: number, aimLen: number): boolean {
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
  });
  return true;
}

const spec = createExplosionSpec();

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
    freeGrenade(pool, i); // first: a blast never sees its own round
    if (!stats || stats.kind !== "launcher") continue;
    const dmg = weaponDamage(world.balance, weapon, level);
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
