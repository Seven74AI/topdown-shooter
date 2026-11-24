import { BOSS_ATTACK, BOSS_STATE, headingToRad, playerIdOfSlot, type BossAttackKind, type BossStateId, type BossStateView, type World } from "@topdown/shared";

/**
 * Story 6.5 (brief line 2): the room state's boss record → a client World (the NetSimHost mirror and
 * the Predictor). The boss is server truth: the client never runs `updateBoss`. The Predictor reads
 * the newest position (DD6: its body push in `movePlayers` matches the server's within one tick);
 * the mirror also keeps the last two positions with their server ticks, so the view draws it at the
 * render tick (`bossRenderPos`), like the horde's snapshots.
 */
export function mirrorBoss(world: World, s: BossStateView | undefined): void {
  const b = world.boss;
  if (!s) {
    b.state = BOSS_STATE.NONE;
    return;
  }
  b.state = s.state as BossStateId;
  b.x = s.x;
  b.y = s.y;
  b.facing = headingToRad(s.heading);
  b.hp = s.hp;
  b.maxHp = s.maxHp;
  b.number = s.number;
  b.look = s.look;
  b.targetId = s.target === 255 ? null : playerIdOfSlot(s.target);
  b.enraged = s.enraged;
  const a = b.attack;
  a.id = s.atkId;
  a.kind = s.atkKind as BossAttackKind;
  a.startTick = s.atkStart;
  a.hitTick = s.atkHit;
  a.cx = s.atkX;
  a.cy = s.atkY;
  a.radiusM = s.atkR;
  // Story 6.6: the lane (direction and length from the exact stop point), CRASH, the chunk source.
  const dx = s.atkEndX - s.atkX;
  const dy = s.atkEndY - s.atkY;
  const len = Math.sqrt(dx * dx + dy * dy);
  a.lenM = len;
  a.dirX = len > 1e-6 ? dx / len : 0;
  a.dirY = len > 1e-6 ? dy / len : 0;
  a.crash = s.atkCrash;
  a.widthM = a.kind === BOSS_ATTACK.CHARGE ? world.balance.boss.charge.laneWidthM : 0;
  a.src = s.atkSrc;
  a.srcX = s.atkSrcX;
  a.srcY = s.atkSrcY;
  if (a.kind > BOSS_ATTACK.THROW) a.kind = BOSS_ATTACK.NONE;
}

/** Two boss positions with their server ticks (the view interpolates at the render tick). */
export interface BossTrack {
  x0: number;
  y0: number;
  t0: number;
  x1: number;
  y1: number;
  t1: number;
}

export function createBossTrack(): BossTrack {
  return { x0: 0, y0: 0, t0: -1, x1: 0, y1: 0, t1: -1 };
}

/** Records the patch's position at server tick `tick` (a repeated tick only updates it; a jump > 20 ticks restarts). */
export function trackBoss(track: BossTrack, x: number, y: number, tick: number): void {
  if (tick === track.t1) {
    track.x1 = x;
    track.y1 = y;
    return;
  }
  if (track.t1 < 0 || tick < track.t1 || tick - track.t1 > 20) {
    track.x0 = x;
    track.y0 = y;
    track.t0 = tick;
  } else {
    track.x0 = track.x1;
    track.y0 = track.y1;
    track.t0 = track.t1;
  }
  track.x1 = x;
  track.y1 = y;
  track.t1 = tick;
}

/** `bossRenderPos` result (reused). */
export const bossDrawAt = { x: 0, y: 0 };

/** The boss at `renderTick` (clamped between the two tracked positions; no extrapolation). */
export function bossRenderPos(track: BossTrack, renderTick: number): void {
  if (track.t1 <= track.t0) {
    bossDrawAt.x = track.x1;
    bossDrawAt.y = track.y1;
    return;
  }
  const f = Math.min(1, Math.max(0, (renderTick - track.t0) / (track.t1 - track.t0)));
  bossDrawAt.x = track.x0 + (track.x1 - track.x0) * f;
  bossDrawAt.y = track.y0 + (track.y1 - track.y0) * f;
}
