import type { Balance } from "../config/balance";
import { ZOMBIE_HISTORY_TICKS, ZOMBIE_POOL_CAPACITY } from "../config/constants";
import type { World } from "../core/world";
import { MAX_PLAYERS } from "../net/messages";
import type { PlayerState } from "../player/player";

/**
 * Story 6.5: the Behemoth's record (DD1: a separate record, not a zombie type). One per World,
 * preallocated in `createWorld`, never allocated per tick. Server truth: server and solo run
 * `updateBoss`; the client's mirror copies the synced fields from the room state (`boss` schema);
 * the Predictor reads its position for the body push (D1).
 */
export const BOSS_STATE = {
  NONE: 0,
  WARNING: 1,
  WALK: 2,
  TELEGRAPH: 3,
  RUSH: 4, // Story 6.6
  RECOVER: 5,
  STUN: 6, // Story 6.6
  ROAR: 7, // Story 6.7
  DEAD: 8,
} as const;
export type BossStateId = (typeof BOSS_STATE)[keyof typeof BOSS_STATE];

export const BOSS_ATTACK = { NONE: 0, SLAM: 1, CHARGE: 2, THROW: 3 } as const;
export type BossAttackKind = (typeof BOSS_ATTACK)[keyof typeof BOSS_ATTACK];

/** DD7: threat buckets per player slot (10 × 0.5 s = the 5 s window). */
export const THREAT_BUCKETS = 10;
/** Ticks per threat bucket (0.5 s at 20 Hz). */
export const THREAT_BUCKET_TICKS = 10;
/** `boss.hit` accumulator slot for damage without a player (turret shots, owner-less blasts). */
export const BOSS_HIT_NO_PLAYER = MAX_PLAYERS;

/** The current telegraph (F2: every zone number is fixed when it starts; DD3). */
export interface BossAttack {
  /** Counts up per attack (u16 on the wire). */
  id: number;
  kind: BossAttackKind;
  startTick: number;
  hitTick: number;
  cx: number;
  cy: number;
  radiusM: number;
  // Story 6.6 (charge lane / throw).
  /** Charge: the lane's unit direction (fixed at the start, F1). */
  dirX: number;
  dirY: number;
  /** Charge: how far its centre travels (the sweep's stop, F1). */
  lenM: number;
  /** Charge: the drawn lane's width. */
  widthM: number;
  /** Charge: the lane ends on hard cover: it crashes there (F2). */
  crash: boolean;
  /** Throw (D7, visual only): 0 road, 1 rubble, 2 burnt car, and where the chunk comes from. */
  src: number;
  srcX: number;
  srcY: number;
  /** DD4: the attack has not resolved yet (telegraph, rush, chunk in flight): no other attack may start (F5). */
  live: boolean;
  /** Charge: metres travelled in the rush. Throw: 1 once the chunk is released. */
  travelled: number;
  /** Charge: bit per player slot already hit by this charge (F4: once per charge). */
  hitMask: number;
}

export const BOSS_THROW_SRC = { ROAD: 0, RUBBLE: 1, CAR: 2 } as const;

export interface BossState {
  state: BossStateId;
  x: number;
  y: number;
  /** Radians in the sim (`quantizeHeading` on the wire). */
  facing: number;
  hp: number;
  maxHp: number;
  /** Behemoths this run (1 in wave 10; 6.12 counts endless ones). */
  number: number;
  /** Look index 0–3 (BH1–BH4, D7). */
  look: number;
  /** The wave it came in (it comes once per boss wave). 0 = none yet. */
  wave: number;
  /** Ticks in the current state. */
  stateTicks: number;
  /** Ticks before it may start the next attack (F5). */
  gapTicks: number;
  readonly cooldown: { slam: number; charge: number; throw: number };
  targetId: string | null;
  lastSwitchTick: number;
  /** Threat ring per player slot (`MAX_PLAYERS × THREAT_BUCKETS`, DD7). */
  readonly threat: Float32Array;
  /** Index of the current bucket. */
  threatHead: number;
  readonly attack: BossAttack;
  readonly entry: { x: number; y: number; name: string };
  /** Story 6.7 sets it (after the roar). */
  enraged: boolean;
  /** Story 6.7: ticks to the next Crawler off its back while enraged. */
  crawlerTicks: number;
  /** Story 6.6 review N2: per zombie slot, the charge that trampled it (attack id; −1 none) and the slot's generation then. */
  readonly trampleId: Int32Array;
  readonly trampleGen: Uint8Array;
  /** The body overlapped a player building this tick (it pushes through at `buildingSlowPct`). */
  pushing: boolean;
  /** Review H1: `bossChase.rebuilds` last evaluated, and where / since when the fallback holds. */
  fieldChecked: number;
  farX: number;
  farY: number;
  farSinceTick: number;
  /** D3: boss positions of the last ticks (shots rewind to it). Row = tick % rows. */
  readonly histX: Float32Array;
  readonly histY: Float32Array;
  readonly histTick: Int32Array;
  /** DD9: damage taken this tick per player slot (+ one "no player" slot) and the last weapon. */
  readonly hitAcc: Float32Array;
  readonly hitWeapon: string[];
  /** Story 5.4 rule for the boss: its flame pulse clock per flame slot. */
  readonly flameClock: Uint8Array;
  /** Diagnostics for tests and the fuzz liveness checks (not simulation state; never snapshotted). */
}

export function createBossState(): BossState {
  return {
    state: BOSS_STATE.NONE,
    x: 0,
    y: 0,
    facing: 0,
    hp: 0,
    maxHp: 0,
    number: 0,
    look: 0,
    wave: 0,
    stateTicks: 0,
    gapTicks: 0,
    cooldown: { slam: 0, charge: 0, throw: 0 },
    targetId: null,
    lastSwitchTick: -1_000_000,
    threat: new Float32Array(MAX_PLAYERS * THREAT_BUCKETS),
    threatHead: 0,
    attack: { id: 0, kind: BOSS_ATTACK.NONE, startTick: 0, hitTick: 0, cx: 0, cy: 0, radiusM: 0, dirX: 0, dirY: 0, lenM: 0, widthM: 0, crash: false, src: 0, srcX: 0, srcY: 0, live: false, travelled: 0, hitMask: 0 },
    entry: { x: 0, y: 0, name: "" },
    enraged: false,
    crawlerTicks: 0,
    trampleId: new Int32Array(ZOMBIE_POOL_CAPACITY).fill(-1),
    trampleGen: new Uint8Array(ZOMBIE_POOL_CAPACITY),
    pushing: false,
    fieldChecked: 0,
    farX: 0,
    farY: 0,
    farSinceTick: 0,
    histX: new Float32Array(ZOMBIE_HISTORY_TICKS),
    histY: new Float32Array(ZOMBIE_HISTORY_TICKS),
    histTick: new Int32Array(ZOMBIE_HISTORY_TICKS).fill(-1),
    hitAcc: new Float32Array(MAX_PLAYERS + 1),
    hitWeapon: Array.from({ length: MAX_PLAYERS + 1 }, () => ""),
    flameClock: new Uint8Array(MAX_PLAYERS),
  };
}

/** Back to "no boss" (a build start, a new run). `number` (the run's count) and the attack id counter stay. */
export function resetBoss(b: BossState): void {
  b.state = BOSS_STATE.NONE;
  b.x = 0;
  b.y = 0;
  b.facing = 0;
  b.hp = 0;
  b.maxHp = 0;
  b.stateTicks = 0;
  b.gapTicks = 0;
  b.cooldown.slam = 0;
  b.cooldown.charge = 0;
  b.cooldown.throw = 0;
  b.targetId = null;
  b.lastSwitchTick = -1_000_000;
  b.threat.fill(0);
  b.threatHead = 0;
  b.attack.kind = BOSS_ATTACK.NONE;
  b.attack.startTick = 0;
  b.attack.hitTick = 0;
  b.attack.cx = 0;
  b.attack.cy = 0;
  b.attack.radiusM = 0;
  b.attack.dirX = 0;
  b.attack.dirY = 0;
  b.attack.lenM = 0;
  b.attack.widthM = 0;
  b.attack.crash = false;
  b.attack.src = 0;
  b.attack.srcX = 0;
  b.attack.srcY = 0;
  b.attack.live = false;
  b.attack.travelled = 0;
  b.attack.hitMask = 0;
  b.enraged = false;
  b.crawlerTicks = 0;
  b.trampleId.fill(-1);
  b.trampleGen.fill(0);
  b.pushing = false;
  b.farX = 0;
  b.farY = 0;
  b.farSinceTick = 0;
  b.histTick.fill(-1);
  b.hitAcc.fill(0);
  b.flameClock.fill(0);
}

/**
 * The one helper that says whether wave `wave` is a boss wave (`boss.json › bossWaves`, or the dev
 * override `DEV_BOSS_WAVES` / `?bosswave=`). 6.12 extends it for endless (`endless` = true).
 */
export function isBossWave(balance: Balance, wave: number, endless = false, override: readonly number[] | null = null): boolean {
  void endless; // Story 6.12
  const list = override ?? balance.boss.bossWaves;
  return list.includes(wave);
}

/** The boss warns or lives (WARNING…ROAR): the alive cap is 110 (D6, D11) and the wave can't end (F11). */
export function bossActive(b: Readonly<BossState>): boolean {
  return b.state >= BOSS_STATE.WARNING && b.state <= BOSS_STATE.ROAR;
}

/** The boss has a body on the map (WALK…ROAR): it can be hit, it blocks, it attacks. */
export function bossBodyOn(b: Readonly<BossState>): boolean {
  return b.state >= BOSS_STATE.WALK && b.state <= BOSS_STATE.ROAR;
}

/**
 * HP for `players` players in the World when it arrives (F10): `hp × playerCountScale[n − 1]`,
 * solo × `soloHpScale` (0.4: designer 2026-11-24; the solo wave size has its own 0.35), and the dev
 * `?bosshp=` scale (tests only).
 */
export function bossMaxHp(balance: Balance, players: number, devScale = 1): number {
  const n = Math.min(4, Math.max(1, players));
  const scale = n === 1 ? balance.boss.soloHpScale : (balance.waves.playerCountScale[n - 1] as number);
  return Math.max(1, Math.round(balance.boss.hp * scale * devScale));
}

/** Records the boss position for this tick (`step()`, after the systems; row = `world.tick`). */
export function recordBossHistory(world: World): void {
  const b = world.boss;
  const row = world.tick % b.histTick.length;
  b.histX[row] = b.x;
  b.histY[row] = b.y;
  b.histTick[row] = bossBodyOn(b) ? world.tick : -1;
}

/** `rewoundBossPos` result (reused). */
export const rewoundBoss = { x: 0, y: 0 };

/**
 * D3: where the boss was at (fractional) tick `at` (a player's rewound shot; boss hits on players
 * never rewind, F4). Falls back to the live position when the rows are missing (solo, no history).
 */
export function rewoundBossPos(world: World, at: number): void {
  const b = world.boss;
  rewoundBoss.x = b.x;
  rewoundBoss.y = b.y;
  if (!world.zombieHistory.enabled || !(at < world.tick)) return;
  const rows = b.histTick.length;
  const t0 = Math.floor(at);
  const r0 = t0 % rows;
  if (b.histTick[r0] !== t0) return;
  const f = at - t0;
  let x1 = b.x;
  let y1 = b.y;
  if (t0 + 1 < world.tick) {
    const r1 = (t0 + 1) % rows;
    if (b.histTick[r1] !== t0 + 1) return;
    x1 = b.histX[r1] as number;
    y1 = b.histY[r1] as number;
  }
  const x0 = b.histX[r0] as number;
  const y0 = b.histY[r0] as number;
  rewoundBoss.x = x0 + (x1 - x0) * f;
  rewoundBoss.y = y0 + (y1 - y0) * f;
}

/** Plain-data view for `snapshotWorld` (all of it, incl. threat and history; brief line 8). */
export function snapshotBoss(b: Readonly<BossState>) {
  return {
    state: b.state,
    x: b.x,
    y: b.y,
    facing: b.facing,
    hp: b.hp,
    maxHp: b.maxHp,
    number: b.number,
    look: b.look,
    wave: b.wave,
    stateTicks: b.stateTicks,
    gapTicks: b.gapTicks,
    cooldown: { ...b.cooldown },
    targetId: b.targetId,
    lastSwitchTick: b.lastSwitchTick,
    threat: Array.from(b.threat),
    threatHead: b.threatHead,
    attack: { ...b.attack },
    entry: { ...b.entry },
    enraged: b.enraged,
    crawlerTicks: b.crawlerTicks,
    trample: [Array.from(b.trampleId), Array.from(b.trampleGen)],
    pushing: b.pushing,
    field: [b.fieldChecked, b.farX, b.farY, b.farSinceTick],
    hist: [Array.from(b.histX), Array.from(b.histY), Array.from(b.histTick)],
    hitAcc: Array.from(b.hitAcc),
    flameClock: Array.from(b.flameClock),
  };
}

/** `movePlayers` (shared with the Predictor; D1, DD6): a player overlapping the body is moved out along the centre line (sqrt only). */
export function pushPlayerOutOfBoss(world: Readonly<World>, p: PlayerState): boolean {
  const b = world.boss;
  if (!bossBodyOn(b) || !world.balance.boss.bodyPushPlayers) return false;
  const min = world.balance.boss.radiusM + p.radiusM;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  const ux = d > 1e-6 ? dx / d : 1;
  const uy = d > 1e-6 ? dy / d : 0;
  p.x = b.x + ux * min;
  p.y = b.y + uy * min;
  return true;
}
