import type { World } from "../core/world";
import { circleOverlapsSector } from "../math/sector";
import { segmentCircleT } from "../math/sweep";
import { BOSS_HIT_NO_PLAYER, BOSS_STATE, bossBodyOn, rewoundBoss, rewoundBossPos } from "./bossState";
import { bossSlotOf, recordBossThreat } from "./target";

/**
 * Story 6.5 (D3, D4, D6, DD9): every damage source that hurts zombies hurts the Behemoth through
 * this one helper — bullets and pellets, melee, both flamethrowers, explosions (grenades, mines,
 * Bloater blasts), turret shots. Not fire zones (car fires, molotov), acid, Bloater gas, spike or
 * bear traps: none of those call it. Records the threat (F7), accumulates the tick's `boss.hit`
 * per source (one event per player per tick, emitted by the boss system), and at 0 HP calls
 * `killBoss` (6.7 owns the death; here: `state = DEAD`).
 *
 * Returns the HP taken (0: no body, nothing happened).
 */
export function applyBossDamage(world: World, amount: number, playerId: string | null, weapon: string): number {
  const b = world.boss;
  if (!bossBodyOn(b) || !(amount > 0)) return 0;
  // 6.6: × charge.stunDamageMult while STUN.
  const taken = Math.min(amount, b.hp);
  b.hp -= taken;
  recordBossThreat(world, playerId, amount);
  const s = bossSlotOf(world, playerId);
  const slot = s < 0 ? BOSS_HIT_NO_PLAYER : s;
  b.hitAcc[slot] = (b.hitAcc[slot] as number) + amount;
  b.hitWeapon[slot] = weapon;
  bossDamageStats.total += taken;
  bossDamageStats.byWeapon.set(weapon, (bossDamageStats.byWeapon.get(weapon) ?? 0) + taken);
  if (b.hp <= 0) killBoss(world);
  return taken;
}

/** Diagnostics for the table test and the sims (not simulation state, never snapshotted). */
export const bossDamageStats = { total: 0, byWeapon: new Map<string, number>() };

/** Story 6.7 replaces this (death, pay, music). Until then: DEAD, nothing else. */
export function killBoss(world: World): void {
  const b = world.boss;
  b.hp = 0;
  b.state = BOSS_STATE.DEAD;
  b.stateTicks = 0;
  b.targetId = null;
}

/** DD9: one `boss.hit` per source per tick (end of the boss system). */
export function flushBossHits(world: World): void {
  const b = world.boss;
  const acc = b.hitAcc;
  for (let s = 0; s < acc.length; s++) {
    const amount = acc[s] as number;
    if (amount <= 0) continue;
    acc[s] = 0;
    const src = s === BOSS_HIT_NO_PLAYER ? null : (world.flameSlots[s] ?? null);
    world.events.emit({ type: "boss.hit", amount, weapon: b.hitWeapon[s] as string, sourceId: src });
  }
}

/**
 * Where a segment (x0,y0)→(x1,y1) first enters the boss's body (t ∈ [0, 1]), or -1. `rewindAt` ≥ 0
 * tests the body where it was at that (fractional) tick (D3: a player's rewound shot); -1 = now.
 */
export function bossCircleHitBySegment(world: World, x0: number, y0: number, x1: number, y1: number, rewindAt = -1): number {
  const b = world.boss;
  if (!bossBodyOn(b)) return -1;
  let bx = b.x;
  let by = b.y;
  if (rewindAt >= 0) {
    rewoundBossPos(world, rewindAt);
    bx = rewoundBoss.x;
    by = rewoundBoss.y;
  }
  return segmentCircleT(x0, y0, x1, y1, bx, by, world.balance.boss.radiusM);
}

/** The boss's body overlaps the arc / cone (melee, flames). `rewindAt` as above. */
export function bossInArc(world: World, ox: number, oy: number, dirX: number, dirY: number, reach: number, cosH: number, sinH: number, rewindAt = -1): boolean {
  const b = world.boss;
  if (!bossBodyOn(b)) return false;
  let bx = b.x;
  let by = b.y;
  if (rewindAt >= 0) {
    rewoundBossPos(world, rewindAt);
    bx = rewoundBoss.x;
    by = rewoundBoss.y;
  }
  return circleOverlapsSector(bx, by, world.balance.boss.radiusM, ox, oy, dirX, dirY, reach, cosH, sinH);
}

/** `bossNearestPoint` result (reused). */
export const bossNear = { x: 0, y: 0, d: 0 };

/**
 * The boss's body within `radiusM` of (x, y) (explosions: radius + its 2 m body). Writes the point
 * of its body nearest (x, y) into `bossNear` (the blast line of sight is tested to it).
 */
export function bossInCircle(world: World, x: number, y: number, radiusM: number): boolean {
  const b = world.boss;
  if (!bossBodyOn(b)) return false;
  const r = world.balance.boss.radiusM;
  const dx = b.x - x;
  const dy = b.y - y;
  const d = Math.sqrt(dx * dx + dy * dy);
  bossNear.d = Math.max(0, d - r);
  if (d <= r) {
    bossNear.x = x;
    bossNear.y = y;
  } else {
    bossNear.x = b.x - (dx / d) * r;
    bossNear.y = b.y - (dy / d) * r;
  }
  return d <= radiusM + r;
}
