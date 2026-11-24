import { TICK_RATE_HZ } from "../config/constants";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { queryRadius } from "../core/spatialGrid";
import { damagePlayerBy, applyZombieDamage } from "../combat/damage";
import { zombieCandidates as candidates } from "../combat/scratch";
import { knockPlayerBy } from "../player/knockback";
import type { PlayerState } from "../player/player";
import { isZombieAlive } from "../zombies/zombiePool";
import { BOSS_ATTACK, BOSS_STATE, type BossAttackKind } from "./bossState";
import { rushStep } from "./charge";
import { releaseThrow } from "./throw";

/**
 * Story 6.5 (F2–F6, F8, F9; DD3, DD4): the telegraph framework every boss attack uses.
 *
 * - `startBossAttack` is the only way an attack begins: WALK, no gap left, the kind's cooldown at 0.
 *   It fixes the zone (centre, radius; 6.6 adds the lane) and `hitTick = startTick +
 *   ticksFor(<kind>.telegraphS)` — read from `boss.json` now and never scaled (F6: not by enrage,
 *   endless, player count or lag).
 * - On `world.tick === hitTick` the kind's resolver runs once (brief line 6), reading only the
 *   attack's zone numbers (never the boss's live position, DD3), each player's newest server
 *   position (no rewind, F4), standing players only (F9), and no cover (F8: "the drawn zone is the
 *   promise"). Then RECOVER for `<kind>.recoverS`, then the per-player-count gap (F5), then WALK.
 */

/** Ticks from a kind's start to its hit (the one place it is read: F6, 6.7 F2: never scaled). Throw: lift + flight (the impact). */
export function telegraphTicks(world: Readonly<World>, kind: BossAttackKind): number {
  const bal = world.balance.boss;
  if (kind === BOSS_ATTACK.SLAM) return ticksFor(bal.slam.telegraphS);
  if (kind === BOSS_ATTACK.CHARGE) return ticksFor(bal.charge.telegraphS);
  if (kind === BOSS_ATTACK.THROW) return ticksFor(bal.throw.liftS) + ticksFor(bal.throw.flightS);
  return 0;
}

/** Story 6.6: ticks the boss stands in TELEGRAPH (a throw's lift; the chunk then flies while it recovers). */
export function windupTicks(world: Readonly<World>, kind: BossAttackKind): number {
  return kind === BOSS_ATTACK.THROW ? ticksFor(world.balance.boss.throw.liftS) : telegraphTicks(world, kind);
}

/** Recovery ticks after a kind (never scaled: 6.7 F3). */
export function recoverTicks(world: Readonly<World>, kind: BossAttackKind): number {
  const bal = world.balance.boss;
  if (kind === BOSS_ATTACK.SLAM) return ticksFor(bal.slam.recoverS);
  if (kind === BOSS_ATTACK.CHARGE) return ticksFor(bal.charge.recoverS);
  if (kind === BOSS_ATTACK.THROW) return ticksFor(bal.throw.recoverS);
  return 1;
}

/**
 * Story 6.7 (AC 3, DD2): the ONLY place the enraged multipliers apply — a cooldown or gap of
 * `seconds`, × `cooldownMult` / `gapMult` while enraged, rounded once when the timer is set.
 * Telegraphs, recoveries and the stun never call it (F2).
 */
export function bossTicks(world: Readonly<World>, seconds: number, kind: "cooldown" | "gap"): number {
  const b = world.boss;
  if (!b.enraged) return ticksFor(seconds);
  const e = world.balance.boss.enrage;
  return Math.round(seconds * TICK_RATE_HZ * (kind === "cooldown" ? e.cooldownMult : e.gapMult));
}

/** The zone fixed at an attack's start (F2 / 6.6 F1, F7). */
export interface AttackZone {
  cx: number;
  cy: number;
  radiusM: number;
  /** Charge: unit direction, travel length, crash at the end. Others: 0 / false. */
  dirX: number;
  dirY: number;
  lenM: number;
  crash: boolean;
  /** Throw: chunk source (visual). */
  src: number;
  srcX: number;
  srcY: number;
}

/** A zone record (callers reuse one). */
export function createAttackZone(): AttackZone {
  return { cx: 0, cy: 0, radiusM: 0, dirX: 0, dirY: 0, lenM: 0, crash: false, src: 0, srcX: 0, srcY: 0 };
}

/** Starts an attack (F5: one at a time, a chunk in flight included). Returns false when the rule refuses it. */
export function startBossAttack(world: World, kind: BossAttackKind, zone: Readonly<Pick<AttackZone, "cx" | "cy" | "radiusM">> & Partial<AttackZone>): boolean {
  const b = world.boss;
  if (b.state !== BOSS_STATE.WALK || b.gapTicks !== 0 || b.attack.live) return false;
  if (kind === BOSS_ATTACK.SLAM ? b.cooldown.slam !== 0 : kind === BOSS_ATTACK.CHARGE ? b.cooldown.charge !== 0 : b.cooldown.throw !== 0) return false;
  const ticks = telegraphTicks(world, kind);
  if (ticks <= 0) return false;
  const a = b.attack;
  a.id = (a.id + 1) & 0xffff;
  a.kind = kind;
  a.startTick = world.tick;
  a.hitTick = world.tick + ticks;
  a.cx = zone.cx;
  a.cy = zone.cy;
  a.radiusM = zone.radiusM;
  a.dirX = zone.dirX ?? 0;
  a.dirY = zone.dirY ?? 0;
  a.lenM = zone.lenM ?? 0;
  a.widthM = kind === BOSS_ATTACK.CHARGE ? world.balance.boss.charge.laneWidthM : 0;
  a.crash = zone.crash ?? false;
  a.src = zone.src ?? 0;
  a.srcX = zone.srcX ?? zone.cx;
  a.srcY = zone.srcY ?? zone.cy;
  a.live = true;
  a.travelled = 0;
  a.hitMask = 0;
  b.state = BOSS_STATE.TELEGRAPH;
  b.stateTicks = 0;
  if (kind === BOSS_ATTACK.CHARGE) b.facing = Math.atan2(a.dirY, a.dirX); // faces the lane, head down
  else if (kind === BOSS_ATTACK.THROW) b.facing = Math.atan2(a.cy - b.y, a.cx - b.x);
  world.events.emit({
    type: "boss.telegraph",
    attackId: a.id,
    kind,
    startTick: a.startTick,
    hitTick: a.hitTick,
    cx: a.cx,
    cy: a.cy,
    radiusM: a.radiusM,
    endX: a.cx + a.dirX * a.lenM,
    endY: a.cy + a.dirY * a.lenM,
    crash: a.crash,
    src: a.src,
    srcX: a.srcX,
    srcY: a.srcY,
  });
  return true;
}

/** F2 / brief 21c: the slam hits a centre only inside the ring less the edge grace (4.5 − 0.25 = 4.25 m). */
export function inSlamZone(world: Readonly<World>, x: number, y: number): boolean {
  const a = world.boss.attack;
  const r = a.radiusM - world.balance.boss.edgeGraceM;
  if (r <= 0) return false;
  const dx = x - a.cx;
  const dy = y - a.cy;
  return dx * dx + dy * dy <= r * r;
}

/** Diagnostics (tests and the fuzz liveness checks; not simulation state, never snapshotted). */
export const bossStats = {
  slams: 0,
  slamPlayerHits: 0,
  slamZombieHits: 0,
  buildingDamage: 0,
  buildingsBroken: 0,
  targetSwitches: 0,
  // Story 6.6
  charges: 0,
  crashes: 0,
  cleanCharges: 0,
  chargePlayerHits: 0,
  chargeZombieHits: 0,
  chargeBuildingsSmashed: 0,
  throws: 0,
  throwPlayerHits: 0,
  throwZombieHits: 0,
  // Story 6.7
  roars: 0,
  crawlersDropped: 0,
  crawlerDropsSkipped: 0,
  kills: 0,
};

const slamPass = { world: null as World | null };
const slamPlayer = (p: PlayerState): void => {
  const world = slamPass.world as World;
  if (p.status !== "alive") return; // F9
  if (!inSlamZone(world, p.x, p.y)) return; // F2: the newest server position (F4), through cover (F8)
  const s = world.balance.boss.slam;
  const a = world.boss.attack;
  if (damagePlayerBy(world, p, s.damage, "boss", null) > 0) bossStats.slamPlayerHits++;
  knockPlayerBy(p, a.cx, a.cy, s.pushM, s.pushS); // DD5 (a player downed by the hit is never pushed)
};

/** The slam's resolver (FR34, FR84): players in the ring, then zombies in the ring (D5: no pay). */
function resolveSlam(world: World): void {
  bossStats.slams++;
  slamPass.world = world;
  world.players.forEach(slamPlayer);
  slamPass.world = null;
  const a = world.boss.attack;
  const dmg = world.balance.boss.slam.zombieDamage;
  if (dmg > 0) {
    const z = world.zombies;
    const n = queryRadius(world.zombieGrid, z.x, z.y, a.cx, a.cy, a.radiusM, candidates);
    for (let k = 0; k < n; k++) {
      const id = candidates[k] as number;
      if (!isZombieAlive(z, id)) continue;
      const dx = (z.x[id] as number) - a.cx;
      const dy = (z.y[id] as number) - a.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > a.radiusM * a.radiusM) continue;
      const d = Math.sqrt(d2);
      bossStats.slamZombieHits++;
      applyZombieDamage(world, id, dmg, d > 1e-6 ? dx / d : 1, d > 1e-6 ? dy / d : 0, 0, null, "boss"); // DD8: no kill credit
    }
  }
  world.events.emit({ type: "boss.slammed", attackId: a.id, x: a.cx, y: a.cy });
}

/** Story 6.6: the boss goes to RECOVER for its kind's recovery. */
function toRecover(world: World): void {
  world.boss.state = BOSS_STATE.RECOVER;
  world.boss.stateTicks = 0;
}

/** WALK again after a recovery or the stun: the per-player-count gap (F5; 6.7: × 0.7 enraged). */
function toWalk(world: World): void {
  const b = world.boss;
  b.state = BOSS_STATE.WALK;
  b.stateTicks = 0;
  b.gapTicks = bossGapTicks(world);
}

/** TELEGRAPH, RUSH, STUN and RECOVER, once per tick (the boss system). */
export function updateBossAttack(world: World): void {
  const b = world.boss;
  const a = b.attack;
  const bal = world.balance.boss;
  if (b.state === BOSS_STATE.TELEGRAPH) {
    if (a.kind === BOSS_ATTACK.THROW) {
      if (world.tick < a.startTick + windupTicks(world, a.kind)) return;
      releaseThrow(world); // the chunk flies; it lands at hitTick (updateThrowFlight)
      b.cooldown.throw = bossTicks(world, bal.throw.cooldownS, "cooldown"); // from the release (AC 5)
      toRecover(world);
      return;
    }
    if (world.tick < a.hitTick) return;
    // Resolves once, on the tick the telegraph ends (brief 21: the fill ends on the hit).
    if (a.kind === BOSS_ATTACK.SLAM) {
      resolveSlam(world);
      a.live = false;
      b.cooldown.slam = bossTicks(world, bal.slam.cooldownS, "cooldown"); // the kind's cooldown starts at the hit tick
      toRecover(world);
      return;
    }
    if (a.kind === BOSS_ATTACK.CHARGE) {
      b.cooldown.charge = bossTicks(world, bal.charge.cooldownS, "cooldown");
      b.state = BOSS_STATE.RUSH;
      b.stateTicks = 0;
      // fall through: the first rush step is this tick
    } else {
      a.live = false;
      toRecover(world);
      return;
    }
  }
  if (b.state === BOSS_STATE.RUSH) {
    if (!rushStep(world)) return;
    a.live = false;
    if (a.crash) {
      b.state = BOSS_STATE.STUN;
      b.stateTicks = 0;
      bossStats.crashes++;
      world.events.emit({ type: "boss.crashed", attackId: a.id, x: b.x, y: b.y });
    } else {
      bossStats.cleanCharges++;
      toRecover(world);
    }
    return;
  }
  if (b.state === BOSS_STATE.STUN) {
    if (b.stateTicks < ticksFor(bal.charge.stunS)) return; // F5: 40 ticks, never scaled
    toWalk(world);
    return;
  }
  if (b.state === BOSS_STATE.RECOVER) {
    if (b.stateTicks < recoverTicks(world, a.kind)) return;
    toWalk(world);
  }
}

/** F5: the gap after an attack's recovery, by the players in the World (6.7: × 0.7 enraged, through `bossTicks`). */
export function bossGapTicks(world: Readonly<World>): number {
  const gaps = world.balance.boss.gapS;
  const n = Math.min(gaps.length, Math.max(1, world.players.size));
  return bossTicks(world, gaps[n - 1] as number, "gap");
}
