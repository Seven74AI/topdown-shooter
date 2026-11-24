import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { queryRadius } from "../core/spatialGrid";
import { damagePlayerBy, applyZombieDamage } from "../combat/damage";
import { zombieCandidates as candidates } from "../combat/scratch";
import { knockPlayerBy } from "../player/knockback";
import type { PlayerState } from "../player/player";
import { isZombieAlive } from "../zombies/zombiePool";
import { BOSS_ATTACK, BOSS_STATE, type BossAttackKind } from "./bossState";

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

/** Ticks of a kind's telegraph (the one place it is read: F6). */
export function telegraphTicks(world: Readonly<World>, kind: BossAttackKind): number {
  if (kind === BOSS_ATTACK.SLAM) return ticksFor(world.balance.boss.slam.telegraphS);
  return 0; // 6.6: charge, throw
}

export interface SlamZone {
  cx: number;
  cy: number;
  radiusM: number;
}

/** Starts an attack (F5: one at a time). Returns false when the rule refuses it. */
export function startBossAttack(world: World, kind: BossAttackKind, zone: SlamZone): boolean {
  const b = world.boss;
  if (b.state !== BOSS_STATE.WALK || b.gapTicks !== 0) return false;
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
  a.dirX = 0;
  a.dirY = 0;
  a.lenM = 0;
  a.widthM = 0;
  b.state = BOSS_STATE.TELEGRAPH;
  b.stateTicks = 0;
  world.events.emit({ type: "boss.telegraph", attackId: a.id, kind, startTick: a.startTick, hitTick: a.hitTick, cx: a.cx, cy: a.cy, radiusM: a.radiusM });
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
export const bossStats = { slams: 0, slamPlayerHits: 0, slamZombieHits: 0, buildingDamage: 0, buildingsBroken: 0, targetSwitches: 0 };

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

/** TELEGRAPH and RECOVER, once per tick (the boss system). */
export function updateBossAttack(world: World): void {
  const b = world.boss;
  const a = b.attack;
  const slam = world.balance.boss.slam;
  if (b.state === BOSS_STATE.TELEGRAPH) {
    if (world.tick < a.hitTick) return;
    // Resolves once, on the tick the telegraph ends (brief 21: the fill ends on the hit).
    if (a.kind === BOSS_ATTACK.SLAM) {
      resolveSlam(world);
      b.cooldown.slam = ticksFor(slam.cooldownS); // the kind's cooldown starts at the hit tick
    }
    b.state = BOSS_STATE.RECOVER;
    b.stateTicks = 0;
    return;
  }
  if (b.state === BOSS_STATE.RECOVER) {
    const recover = a.kind === BOSS_ATTACK.SLAM ? ticksFor(slam.recoverS) : 1;
    if (b.stateTicks < recover) return;
    b.state = BOSS_STATE.WALK;
    b.stateTicks = 0;
    b.gapTicks = bossGapTicks(world);
  }
}

/** F5: the gap after an attack's recovery, by the players in the World (6.7: × 0.7 enraged). */
export function bossGapTicks(world: Readonly<World>): number {
  const gaps = world.balance.boss.gapS;
  const n = Math.min(gaps.length, Math.max(1, world.players.size));
  return ticksFor(gaps[n - 1] as number);
}
