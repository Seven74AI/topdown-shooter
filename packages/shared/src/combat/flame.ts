import { bossBodyOn } from "../boss/bossState";
import { applyBossDamage, bossInArc } from "../boss/bossDamage";
import type { FlameStats } from "../config/balanceSchema";
import { MUZZLE_OFFSET_M } from "../config/constants";
import { DAMAGE_SOURCE_FIRE } from "../core/simEvents";
import { queryRadius } from "../core/spatialGrid";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { circleOverlapsSector } from "../math/sector";
import { DEG_TO_RAD } from "../math/vec";
import { playerSlotOf } from "../net/netEvents";
import type { PlayerState } from "../player/player";
import { FLAME_SLOTS, isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { shotBlockT } from "./cover";
import { applyZombieDamageQuiet, damagePlayerBy } from "./damage";
import type { WeaponSlot } from "./loadout";
import type { ZombieView } from "./rewind";
import { zombieCandidates as candidates } from "./scratch";
import { weaponDamage, weaponIds, weaponStats } from "./weapons";

export { FLAME_SLOTS };

/**
 * Story 5.4: the Flamethrower and the Gas torch (round C: FT1 fuel jet 6 m × 20°, FT2 gas torch
 * 3 m × 60°). Shared sim code: server, solo, bots and replays run it through `firing.ts › tryFire`;
 * the client never decides flame damage.
 *
 * Fairness rules (story ACs, each a test in `flame.test.ts`):
 * - FR-A: a body takes flame damage when its circle overlaps the cone (from the muzzle, `rangeM`
 *   to the body's EDGE, `coneDeg` wide: `circleOverlapsSector`, the melee arc test). The cone points
 *   along the raw aim (no aim assist).
 * - FR-B: cars, the bus and buildings stop flames: a body is in the flame only if the line from the
 *   muzzle to its centre enters no shot blocker (`shotBlockT < 0`, Story 4.2), and nothing is in it
 *   when the muzzle itself is inside cover (the line from the flamer's centre to the muzzle is cut).
 *   Barriers, sandbags and player barricades don't stop it (the choke-point play, D7).
 * - FR-C: exposure is per (body, flamer): a zombie's clock pulses on its FIRST tick in the cone
 *   and then every `pulseS` of exposure; a teammate's pulses once a full `playerPulseS` of
 *   exposure has built up (brushing a friend for a tick does nothing). Clocks are kept while the
 *   body is outside the cone and restart at every build start (`resetFlameClocks`, from 4.8's
 *   `resetBurnClocks`). Two flamers have two clocks (they stack).
 * - FR-D/E: teammates take the pulse through `damagePlayerBy(tag "fire", source = flamer)`
 *   (50 %, can down, downed/out spared, god mode). Players are tested at their LIVE positions
 *   (rewind is for zombies only, 2.12); the flamer's own body is never in the cone.
 * - FR-G: a zombie pulse ignites it (`igniteS`, refreshed to full, never stacked; its own clock;
 *   credited to the last igniter; never spreads; players are never ignited).
 * - No `zombie.hit` per pulse (`applyZombieDamageQuiet`: assists and kills as usual).
 * Damage: 5.1's `weaponDamage` (`damage` = per second) × `pulseS` per zombie pulse (exact, like
 * every weapon: no rounding), the same level share for the ignite; the friendly-fire pulse is
 * rounded once per pulse in `damagePlayerBy` (whole at level I, schema-checked).
 *
 * Allocation-free (module-level scratch and callbacks only).
 */

/** Diagnostic counters (tests, sims, liveness asserts; not simulation state, never snapshotted). */
export const flameStats = { ticks: 0, zombiePulses: 0, zombieKills: 0, playerPulses: 0, ignites: 0, igniteKills: 0, ignitePulses: 0, muzzleBlocked: 0 };

/** No flame slot (more than FLAME_SLOTS players: that player's flames hurt nothing). */
export const NO_FLAME_SLOT = 255;

/**
 * Gives `p` a flame slot: its wire slot (`"p0"`–`"p3"`) when free, else the lowest free one, and
 * zeroes that slot's clocks on every body (a slot never inherits a departed player's exposure).
 */
export function claimFlameSlot(world: World, p: PlayerState): void {
  const slots = world.flameSlots;
  let s = playerSlotOf(p.id);
  if (!(s < FLAME_SLOTS) || slots[s] !== null) {
    s = NO_FLAME_SLOT;
    for (let i = 0; i < FLAME_SLOTS; i++) {
      if (slots[i] === null) {
        s = i;
        break;
      }
    }
  }
  p.flameSlot = s;
  if (s === NO_FLAME_SLOT) return;
  slots[s] = p.id;
  const z = world.zombies;
  for (let id = 0; id < z.capacity; id++) z.flameClock[id * FLAME_SLOTS + s] = 0;
  forgetIgniter(world, s);
  world.players.forEach((q) => {
    q.flameClock[s] = 0;
  });
}

/** Frees the flame slot of player `id` (it leaves). Its ignites keep burning, credited to nobody. */
export function releaseFlameSlot(world: World, id: string): void {
  const slots = world.flameSlots;
  for (let i = 0; i < FLAME_SLOTS; i++) {
    if (slots[i] !== id) continue;
    slots[i] = null;
    forgetIgniter(world, i);
  }
}

/**
 * Review L1: burns lit by slot `s` are credited to nobody once that slot is freed or reclaimed (a
 * newcomer taking the slot never collects a departed player's burn kills).
 */
function forgetIgniter(world: World, s: number): void {
  const z = world.zombies;
  for (let id = 0; id < z.capacity; id++) if (z.igniterSlot[id] === s) z.igniterSlot[id] = NO_FLAME_SLOT;
}

/** Module-level callback (no closure per call). */
const coolFlames = (p: PlayerState): void => {
  p.flameClock.fill(0);
};

/**
 * FR-C (4.8 D3/D19): every flame clock restarts at each build start; the ignites go out too (no burn
 * carries across a build start). Called from `decay/fire.ts › resetBurnClocks`.
 */
export function resetFlameClocks(world: World): void {
  const z = world.zombies;
  z.flameClock.fill(0);
  z.igniteTicks.fill(0);
  z.igniteClock.fill(0);
  z.igniterSlot.fill(NO_FLAME_SLOT);
  world.players.forEach(coolFlames);
}

/** Module-level state of the teammate pass (no closure per call). */
const pass = {
  world: null as World | null,
  flamer: null as PlayerState | null,
  ox: 0,
  oy: 0,
  dirX: 0,
  dirY: 0,
  reach: 0,
  cosH: 0,
  sinH: 0,
  pulse: 0,
  amount: 0,
};

const flamePlayer = (q: PlayerState): void => {
  const p = pass.flamer as PlayerState;
  if (q === p || q.status !== "alive") return; // the flamer's own body is behind the muzzle; downed/out spared (FR-E)
  if (!circleOverlapsSector(q.x, q.y, q.radiusM, pass.ox, pass.oy, pass.dirX, pass.dirY, pass.reach, pass.cosH, pass.sinH)) return;
  const world = pass.world as World;
  if (shotBlockT(world, pass.ox, pass.oy, q.x, q.y) >= 0) return; // FR-B
  const s = p.flameSlot;
  const c = (q.flameClock[s] as number) + 1;
  if (c < pass.pulse) {
    q.flameClock[s] = c;
    return;
  }
  q.flameClock[s] = 0;
  flameStats.playerPulses++;
  damagePlayerBy(world, q, pass.amount, "fire", p.id, DAMAGE_SOURCE_FIRE);
};

/**
 * One tick of flame from player `p` with weapon slot `slot` along the unit raw aim (dirX, dirY).
 * `view`: the rewound zombies the flamer saw (online, 2.12), or null for the live pool. The zombie
 * grid must be current (the combat system rebuilds it). Returns the zombies the cone touched.
 */
export function flameTick(world: World, p: PlayerState, slot: WeaponSlot, stats: FlameStats, dirX: number, dirY: number, view: ZombieView | null): number {
  flameStats.ticks++;
  const s = p.flameSlot;
  if (s === NO_FLAME_SLOT) return 0;
  const ox = p.x + dirX * (p.radiusM + MUZZLE_OFFSET_M);
  const oy = p.y + dirY * (p.radiusM + MUZZLE_OFFSET_M);
  if (shotBlockT(world, p.x, p.y, ox, oy) >= 0) {
    flameStats.muzzleBlocked++;
    return 0; // the nozzle is in a car: the flame splashes on its face (FR-B)
  }
  const reach = stats.rangeM;
  const half = (stats.coneDeg / 2) * DEG_TO_RAD;
  const cosH = Math.cos(half);
  const sinH = Math.sin(half);
  const perS = weaponDamage(world.balance, slot.weapon, slot.level); // 5.1: damage per second at this level
  const levelShare = perS / stats.damage;
  const zombiePulse = ticksFor(stats.pulseS);
  const zombieDmg = perS * stats.pulseS;
  const igniteTicks = stats.igniteS > 0 ? ticksFor(stats.igniteS) : 0;
  const igniteDmg = stats.igniteDamagePerS * stats.ignitePulseS * levelShare;
  const weaponIndex = weaponIds(world.balance).indexOf(slot.weapon);

  const z = world.zombies;
  const xs = view ? view.x : z.x;
  const ys = view ? view.y : z.y;
  const count = queryRadius(view ? view.grid : world.zombieGrid, xs, ys, ox, oy, reach + maxZombieRadius(world.balance), candidates);
  let touched = 0;
  for (let k = 0; k < count; k++) {
    const id = candidates[k] as number;
    if (!isZombieAlive(z, id)) continue; // killed earlier this tick
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const cx = xs[id] as number;
    const cy = ys[id] as number;
    if (!circleOverlapsSector(cx, cy, r, ox, oy, dirX, dirY, reach, cosH, sinH)) continue; // FR-A
    if (shotBlockT(world, ox, oy, cx, cy) >= 0) continue; // FR-B
    touched++;
    const ci = id * FLAME_SLOTS + s;
    const c = z.flameClock[ci] as number;
    z.flameClock[ci] = (c + 1) % zombiePulse;
    if (c !== 0) continue; // FR-C: a pulse on the first tick in the cone, then every pulseS of exposure
    flameStats.zombiePulses++;
    if (applyZombieDamageQuiet(world, id, zombieDmg, dirX, dirY, stats.hitPushbackM, p.id, slot.weapon)) {
      flameStats.zombieKills++;
      continue;
    }
    if (igniteTicks > 0) {
      // FR-G: refreshed to the full length, never stacked; the burn keeps its own pulse clock.
      if (z.igniteTicks[id] === 0) z.igniteClock[id] = 0;
      z.igniteTicks[id] = igniteTicks;
      z.igniterSlot[id] = s;
      z.igniteWeapon[id] = weaponIndex < 0 ? 0 : weaponIndex;
      z.igniteDamage[id] = igniteDmg;
      flameStats.ignites++;
    }
  }

  // Story 6.5 (D4): the Behemoth's body in the cone with a clear line to its centre: the normal flame
  // pulse on its own clock for this flame slot; it never catches fire (no ignite).
  const boss = world.boss;
  if (bossBodyOn(boss)) {
    if (bossInArc(world, ox, oy, dirX, dirY, reach, cosH, sinH) && shotBlockT(world, ox, oy, boss.x, boss.y) < 0) {
      touched++;
      const c = boss.flameClock[s] as number;
      boss.flameClock[s] = (c + 1) % zombiePulse;
      if (c === 0) applyBossDamage(world, zombieDmg, p.id, slot.weapon);
    } else boss.flameClock[s] = 0;
  }

  // FR-D/E: teammates in the cone (live positions), each on its own clock for this flamer.
  pass.world = world;
  pass.flamer = p;
  pass.ox = ox;
  pass.oy = oy;
  pass.dirX = dirX;
  pass.dirY = dirY;
  pass.reach = reach;
  pass.cosH = cosH;
  pass.sinH = sinH;
  pass.pulse = ticksFor(stats.playerPulseS);
  pass.amount = perS * stats.playerPulseS;
  world.players.forEach(flamePlayer);
  pass.world = null;
  pass.flamer = null;
  return touched;
}

/**
 * FR-G: burning zombies (the combat system, after the weapons and projectiles). Each counts its
 * burn down; every `ignitePulseS` of burning it takes its ignite damage, credited to the igniter's
 * player (`zombie.killed` with the igniting weapon). No `zombie.hit` (quiet). From the end of the
 * alive list (a kill swaps the last alive id into this place, already visited).
 */
export function updateIgnites(world: World): void {
  const z = world.zombies;
  const ids = weaponIds(world.balance);
  for (let i = z.aliveCount - 1; i >= 0; i--) {
    const id = z.aliveIds[i] as number;
    const left = z.igniteTicks[id] as number;
    if (left === 0) continue;
    z.igniteTicks[id] = left - 1;
    const weapon = ids[z.igniteWeapon[id] as number] ?? "";
    const w = world.balance.weapons[weapon];
    const pulse = w && w.kind === "flame" ? ticksFor(w.ignitePulseS) : 1;
    const c = (z.igniteClock[id] as number) + 1;
    if (c < pulse) {
      z.igniteClock[id] = c;
      continue;
    }
    z.igniteClock[id] = 0;
    flameStats.ignitePulses++;
    const slot = z.igniterSlot[id] as number;
    const killer = slot < FLAME_SLOTS ? (world.flameSlots[slot] ?? null) : null;
    if (applyZombieDamageQuiet(world, id, z.igniteDamage[id] as number, 0, 0, 0, killer, weapon)) flameStats.igniteKills++;
  }
}

/** The flame stats of a weapon id, or null when it is not a flame weapon. */
export function flameStatsOf(world: Readonly<World>, weapon: string): FlameStats | null {
  const w = weaponStats(world.balance, weapon);
  return w.kind === "flame" ? w : null;
}
