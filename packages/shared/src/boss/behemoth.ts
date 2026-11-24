import type { SystemFn } from "../core/systems";
import { TICK_DT_S } from "../config/constants";
import { streamSeed } from "../core/seedStreams";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { queryRadius } from "../core/spatialGrid";
import { type Building, damageBuilding } from "../buildings/buildings";
import { circleOverlapsBox, pushOutOfBuildings, pushed } from "../buildings/collision";
import { zombieCandidates as candidates } from "../combat/scratch";
import type { PlayerState } from "../player/player";
import { FLOW_UNREACHED, flowCellAt, flowCellCenterX, flowCellCenterY, flowNearestReachedCell, flowNextCell } from "../zombies/flowField";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { BOSS_ATTACK, BOSS_STATE, bossBodyOn, bossMaxHp, isBossWave, resetBoss } from "./bossState";
import { flushBossHits } from "./bossDamage";
import { bossStats, createAttackZone, startBossAttack, updateBossAttack } from "./telegraph";
import { planCharge } from "./charge";
import { pickThrowTarget, throwSource, updateThrowFlight } from "./throw";
import { checkEnrage, updateCrawlerDrops, updateRoar } from "./enrage";
import { advanceThreat, pickBossTarget } from "./target";

/**
 * Story 6.5 (FR33): the Behemoth's system (the `boss` slot of `SYSTEM_ORDER`, after `zombies`,
 * before `waves`; server and solo only: the mirror and the Predictor never run it).
 *
 * - Arrival: in a boss wave (`isBossWave`), once `round(size × arriveAtFraction)` of its zombies have
 *   spawned, it picks its entry (D2) and WARNs for `warningS` (F1: 80 ticks), then walks in.
 * - WALK: steers by its own field toward its target (F7), pushes through player buildings at 25 %
 *   speed dealing `buildingDps` (D8), shoves zombies out of its body; when the gap is over it may
 *   start an attack (`pickBossAttack`).
 * - TELEGRAPH / RECOVER: `boss/telegraph.ts`.
 * - At a build start the record returns to NONE (6.7 owns what happens at death).
 */

/** The Behemoth's four looks (BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot cop). */
export const BEHEMOTH_LOOKS = 4;

/**
 * D7: the look of Behemoth `number` of the run, from the named stream `look:behemoth:<number>` of the
 * run seed; a later Behemoth never repeats the previous one's look (endless, 6.12).
 */
export function behemothLookIndex(runSeed: number, number: number, previousLook: number): number {
  const h = streamSeed(runSeed >>> 0, `look:behemoth:${number}`);
  if (number <= 1 || previousLook < 0) return h % BEHEMOTH_LOOKS;
  return (previousLook + 1 + (h % (BEHEMOTH_LOOKS - 1))) % BEHEMOTH_LOOKS;
}

/** `pickBossEntry` result (reused). */
export const bossEntry = { x: 0, y: 0, name: "" };

/** Distance from (x, y) to the nearest standing player (Infinity: none). */
function nearestStandingDistance(world: Readonly<World>, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * D2 (F1): one of `boss.entryPoints` (the four street ends; a map without them: its street spawns,
 * else every spawn) — the one farthest from every standing player (the largest nearest-player
 * distance; ties: list order). That is ≥ `entryMinPlayerDistanceM` from everyone whenever any entry
 * is; else the farthest. Its centre is clamped `radiusM` inside the map and out of map solids.
 */
export function pickBossEntry(world: Readonly<World>): void {
  const names = world.balance.boss.entryPoints;
  const spawns = world.map.spawnPoints;
  let pool = 0; // 0: named entries, 1: street spawns, 2: every spawn
  if (!spawns.some((s) => names.includes(s.name))) pool = spawns.some((s) => s.kind === "street") ? 1 : 2;
  let best = -1;
  let bestD = -1;
  // An entry whose street opens only into a pocket its 4 m body can't leave (Downtown stage 1: the
  // west street's parked cars leave gaps under 4 m) is skipped while another entry is open.
  for (let pass = 0; pass < 2 && best < 0; pass++) {
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i] as (typeof spawns)[number];
      if (pool === 0 ? !names.includes(s.name) : pool === 1 ? s.kind !== "street" : false) continue;
      if (pass === 0 && !bossEntryOpen(world, s.x, s.y)) continue;
      const d = nearestStandingDistance(world, s.x, s.y);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  const r = world.balance.boss.radiusM;
  const { widthM, heightM } = world.map;
  const s = best >= 0 ? spawns[best] : undefined;
  const x = Math.min(widthM - r, Math.max(r, s ? s.x : widthM / 2));
  const y = Math.min(heightM - r, Math.max(r, s ? s.y : r));
  pushOutOfBuildings(world, x, y, r, x, y, false);
  bossEntry.x = pushed.x;
  bossEntry.y = pushed.y;
  bossEntry.name = s ? s.name : "";
}

/** Flood scratch for `bossEntryOpen` (sized to the boss grid on first use; arrivals only, never per tick). */
let floodSeen = new Uint8Array(0);
let floodQueue = new Int32Array(0);

/**
 * The boss grid around (x, y) is open: the free cells reached from the nearest free cell (within 6
 * cells) are at least a quarter of all free cells (not a pocket between the cars). True on a World
 * without pathing (the client copies) or a grid with no walls.
 */
export function bossEntryOpen(world: Readonly<World>, x: number, y: number): boolean {
  const nav = world.pathing.boss;
  if (nav.cells <= 1) return true;
  const { cols, rows, wallAt } = nav;
  let free = 0;
  for (let c = 0; c < nav.cells; c++) if (wallAt[c] === 0) free++;
  if (free === nav.cells || free === 0) return free > 0;
  const c0 = flowCellAt(nav, x, y);
  const cx0 = c0 % cols;
  const cy0 = (c0 - cx0) / cols;
  let start = -1;
  for (let r = 0; r <= 6 && start < 0; r++) {
    for (let cy = Math.max(0, cy0 - r); cy <= Math.min(rows - 1, cy0 + r) && start < 0; cy++) {
      for (let cx = Math.max(0, cx0 - r); cx <= Math.min(cols - 1, cx0 + r); cx++) {
        if (wallAt[cy * cols + cx] === 0) {
          start = cy * cols + cx;
          break;
        }
      }
    }
  }
  if (start < 0) return false;
  if (floodSeen.length !== nav.cells) {
    floodSeen = new Uint8Array(nav.cells);
    floodQueue = new Int32Array(nav.cells);
  }
  floodSeen.fill(0);
  let head = 0;
  let tail = 0;
  floodQueue[tail++] = start;
  floodSeen[start] = 1;
  while (head < tail) {
    const c = floodQueue[head++] as number;
    const cx = c % cols;
    const cy = (c - cx) / cols;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (floodSeen[n] === 1 || wallAt[n] !== 0) continue;
      floodSeen[n] = 1;
      floodQueue[tail++] = n;
    }
  }
  return tail * 4 >= free;
}

/** Starts the warning now (the arrival rule, or the dev cheat "Spawn Behemoth"). False outside a wave or with a boss present. */
export function startBossWarning(world: World): boolean {
  const b = world.boss;
  if (world.run.phase !== "wave" || (b.state !== BOSS_STATE.NONE && b.state !== BOSS_STATE.DEAD)) return false;
  if (b.state === BOSS_STATE.DEAD) resetBoss(b);
  pickBossEntry(world);
  b.entry.x = bossEntry.x;
  b.entry.y = bossEntry.y;
  b.entry.name = bossEntry.name;
  b.x = bossEntry.x;
  b.y = bossEntry.y;
  b.wave = world.waves.number;
  b.state = BOSS_STATE.WARNING;
  b.stateTicks = 0;
  world.events.emit({ type: "boss.warning", x: b.x, y: b.y, hitTick: world.tick + ticksFor(world.balance.boss.warningS) });
  return true;
}

/** The warning is over: it walks in (F10: HP fixed now, by the players in the World). */
function arrive(world: World): void {
  const b = world.boss;
  const bal = world.balance.boss;
  b.number++;
  b.look = behemothLookIndex(world.seed, b.number, b.number > 1 ? b.look : -1);
  b.maxHp = bossMaxHp(world.balance, world.players.size, world.debug.bossHpScale);
  b.hp = b.maxHp;
  b.state = BOSS_STATE.WALK;
  b.stateTicks = 0;
  b.gapTicks = ticksFor(bal.firstGapS);
  b.cooldown.slam = 0;
  b.cooldown.charge = ticksFor(bal.charge.initialCooldownS); // Story 6.6 (AC 6)
  b.cooldown.throw = ticksFor(bal.throw.initialCooldownS);
  b.attack.live = false;
  b.attack.kind = BOSS_ATTACK.NONE;
  b.enraged = false;
  b.crawlerTicks = 0;
  b.targetId = null;
  b.lastSwitchTick = -1_000_000;
  b.threat.fill(0);
  resetBossField(world); // review H1: a new Behemoth starts with a clean field
  b.facing = Math.atan2(world.map.heightM / 2 - b.y, world.map.widthM / 2 - b.x);
  world.events.emit({ type: "boss.arrived", x: b.x, y: b.y, maxHp: b.maxHp, look: b.look });
}

/** The arrival rule (AC 3): a boss wave, half its zombies spawned (spawns, never alive zombies: Beat-the-rule 9). */
function arrivalDue(world: Readonly<World>): boolean {
  const w = world.waves;
  const b = world.boss;
  if (b.state !== BOSS_STATE.NONE || b.wave === w.number) return false;
  if (!isBossWave(world.balance, w.number, false, world.debug.bossWaves)) return false;
  return w.size - w.queued >= Math.round(w.size * world.balance.boss.arriveAtFraction);
}

/** F11 helper: this wave is a boss wave whose boss has not come yet (the wave can't end before it). */
export function bossPending(world: Readonly<World>): boolean {
  const b = world.boss;
  return b.wave !== world.waves.number && isBossWave(world.balance, world.waves.number, false, world.debug.bossWaves);
}

/** Any standing player's centre within `slam.triggerM` of the boss's centre. */
function slamTriggered(world: Readonly<World>): boolean {
  const b = world.boss;
  const t = world.balance.boss.slam.triggerM;
  const t2 = t * t;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    if (dx * dx + dy * dy <= t2) return true;
  }
  return false;
}

/** `pickBossAttack` zone (reused). */
const zone = createAttackZone();
const lane = { dirX: 0, dirY: 0, lenM: 0, crash: false };

function clearZone(): void {
  zone.dirX = 0;
  zone.dirY = 0;
  zone.lenM = 0;
  zone.crash = false;
  zone.src = 0;
}

/** Story 6.6 (AC 3): the charge's target rule: its target 5–12 m away and a lane ≥ `minLaneM`. */
function chargeZone(world: World): boolean {
  const b = world.boss;
  const c = world.balance.boss.charge;
  const t = b.targetId !== null ? world.players.get(b.targetId) : undefined;
  if (!t || t.status !== "alive") return false;
  const dx = t.x - b.x;
  const dy = t.y - b.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < c.minM * c.minM || d2 > c.maxM * c.maxM) return false;
  if (!planCharge(world, t.x, t.y, lane)) return false; // F1: toward its position at this tick (no lead)
  if (lane.lenM < c.minLaneM - 1e-9) return false;
  clearZone();
  zone.cx = b.x;
  zone.cy = b.y;
  zone.radiusM = 0;
  zone.dirX = lane.dirX;
  zone.dirY = lane.dirY;
  zone.lenM = lane.lenM;
  zone.crash = lane.crash;
  zone.srcX = b.x;
  zone.srcY = b.y;
  return true;
}

/** Story 6.6 (AC 5, F7): the throw's landing spot (the target's position now) and the chunk's source. */
function throwZone(world: World): boolean {
  const t = pickThrowTarget(world);
  if (!t) return false;
  clearZone();
  zone.cx = t.x;
  zone.cy = t.y;
  zone.radiusM = world.balance.boss.throw.radiusM;
  const src = throwSource(world);
  zone.src = src.src;
  zone.srcX = src.x;
  zone.srcY = src.y;
  return true;
}

/**
 * AC 9 (6.5) + 6.6 AC 6 (F9): when it walks, the gap is over and no attack is live (a chunk in
 * flight included): (1) slam if its cooldown is 0 and a standing player is within `slam.triggerM`;
 * (2) charge if its cooldown is 0, its target is 5–12 m away and the lane is ≥ 4 m; (3) throw if its
 * cooldown is 0 and a standing player qualifies; (4) else it walks. Returns the kind started (0: none).
 */
export function pickBossAttack(world: World): number {
  const b = world.boss;
  if (b.state !== BOSS_STATE.WALK || b.gapTicks !== 0 || b.attack.live) return BOSS_ATTACK.NONE;
  if (b.cooldown.slam === 0 && slamTriggered(world)) {
    clearZone();
    zone.cx = b.x; // F2: fixed now; the boss stands still while it winds up
    zone.cy = b.y;
    zone.radiusM = world.balance.boss.slam.radiusM;
    zone.srcX = b.x;
    zone.srcY = b.y;
    if (startBossAttack(world, BOSS_ATTACK.SLAM, zone)) return BOSS_ATTACK.SLAM;
  }
  if (b.cooldown.charge === 0 && chargeZone(world) && startBossAttack(world, BOSS_ATTACK.CHARGE, zone)) return BOSS_ATTACK.CHARGE;
  if (b.cooldown.throw === 0 && throwZone(world) && startBossAttack(world, BOSS_ATTACK.THROW, zone)) return BOSS_ATTACK.THROW;
  return BOSS_ATTACK.NONE;
}

/** Story 6.6 (F9): the attack it will pick next if it could now (the edge marker's icon; 0: none due). */
export function nextBossAttack(world: Readonly<World>): number {
  const b = world.boss;
  if (b.cooldown.slam === 0 && slamTriggered(world)) return BOSS_ATTACK.SLAM;
  if (b.cooldown.charge === 0) {
    const t = b.targetId !== null ? world.players.get(b.targetId) : undefined;
    const c = world.balance.boss.charge;
    if (t && t.status === "alive") {
      const d2 = (t.x - b.x) ** 2 + (t.y - b.y) ** 2;
      if (d2 >= c.minM * c.minM && d2 <= c.maxM * c.maxM) return BOSS_ATTACK.CHARGE;
    }
  }
  if (b.cooldown.throw === 0 && pickThrowTarget(world)) return BOSS_ATTACK.THROW;
  return BOSS_ATTACK.NONE;
}

/** Steering target (reused). */
const steer = { x: 0, y: 0, ok: false };

/** Where the boss heads this tick: the next cell of its field, else straight at the target. */
function steerPoint(world: World, target: PlayerState): void {
  const b = world.boss;
  const f = world.pathing.bossChase;
  const nav = world.pathing.boss;
  steer.ok = true;
  steer.x = target.x;
  steer.y = target.y;
  if (nav.cells <= 1 || f.sourceTick < 0 || f.seedOnly !== target.id) return; // no field yet: straight at it
  const own = flowCellAt(nav, b.x, b.y);
  const cell = flowNearestReachedCell(f, nav, own, 4);
  if (cell < 0 || (f.front[cell] as number) >= FLOW_UNREACHED) {
    steer.ok = false; // it can't walk to its target: it stands (6.6's throw handles it)
    return;
  }
  if (cell !== own) {
    steer.x = flowCellCenterX(nav, cell);
    steer.y = flowCellCenterY(nav, cell);
    return;
  }
  const next = flowNextCell(f, nav, cell);
  if (next < 0) return; // at the target's seed: straight at it (contact)
  steer.x = flowCellCenterX(nav, next);
  steer.y = flowCellCenterY(nav, next);
}

/** Restarts the boss field at its next round-robin slot (the current front keeps steering until it is replaced). */
function restartField(world: World): void {
  const f = world.pathing.bossChase;
  f.building = false;
  f.buildSourceTick = -1_000_000;
}

/**
 * Review H1: the unreachable-target fallback, decided per build, never latched. A finished NORMAL
 * build that doesn't reach the boss's cell switches the next build to the fallback (seeded by walking
 * distance round the target); while in the fallback the normal field is tried again as soon as the
 * target moves `pathing.fallbackMoveM` (1 m) from where the fallback began, or every `pathing.fallbackRetryS` — so a survivor
 * who steps into an alley and out again is chased properly within one rebuild.
 */
function updateFallback(world: World, target: PlayerState): void {
  const b = world.boss;
  const f = world.pathing.bossChase;
  if (f.rebuilds !== b.fieldChecked) {
    b.fieldChecked = f.rebuilds;
    if (!f.frontFar && !bossCellReached(world)) {
      f.seedFar = true;
      b.farX = target.x;
      b.farY = target.y;
      b.farSinceTick = world.tick;
      restartField(world);
      return;
    }
  }
  if (!f.seedFar) return;
  const dx = target.x - b.farX;
  const dy = target.y - b.farY;
  const move = world.balance.boss.pathing.fallbackMoveM;
  if (dx * dx + dy * dy >= move * move || world.tick - b.farSinceTick >= ticksFor(world.balance.boss.pathing.fallbackRetryS)) {
    f.seedFar = false; // try the normal field again (a new failure comes straight back here)
    b.farSinceTick = world.tick;
    restartField(world);
  }
}

/** The boss's cell (or one within 4 cells) has a value in the front field. */
function bossCellReached(world: Readonly<World>): boolean {
  const f = world.pathing.bossChase;
  const nav = world.pathing.boss;
  if (nav.cells <= 1 || f.sourceTick < 0) return true;
  const c = flowNearestReachedCell(f, nav, flowCellAt(nav, world.boss.x, world.boss.y), 4);
  return c >= 0 && (f.front[c] as number) < FLOW_UNREACHED;
}

/** Review H1: the boss field back to "no target" (a new Behemoth, a build start: nothing carried over). */
export function resetBossField(world: World): void {
  const f = world.pathing.bossChase;
  f.seedOnly = null;
  f.seedFar = false;
  f.frontFar = false;
  f.building = false;
  f.sourceTick = -1;
  f.buildSourceTick = -1_000_000;
  world.boss.fieldChecked = f.rebuilds;
}

/** WALK: one step toward the target (D8: 25 % speed while pushing through a building). */
function walk(world: World, target: PlayerState | null): void {
  const b = world.boss;
  const bal = world.balance.boss;
  const f = world.pathing.bossChase;
  // DD2: the field follows the target; a new target restarts the rebuild from it.
  const want = target ? target.id : null;
  if (f.seedOnly !== want) {
    f.seedOnly = want;
    f.seedRings = bal.pathing.seedRings;
    f.building = false;
    f.sourceTick = -1;
    f.buildSourceTick = -1_000_000; // rebuild from the new target at once
    f.seedFar = false;
    f.frontFar = false;
  }
  if (!target) return;
  updateFallback(world, target);
  const contact = bal.radiusM + target.radiusM;
  const tdx = target.x - b.x;
  const tdy = target.y - b.y;
  if (tdx * tdx + tdy * tdy <= contact * contact) return; // touching its target: no further
  steerPoint(world, target);
  if (!steer.ok) return; // a normal field that doesn't reach it: the fallback build is on its way
  const dx = steer.x - b.x;
  const dy = steer.y - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-6) return;
  const speed = bal.speedMps * (b.enraged ? bal.enrage.speedMult : 1) * (b.pushing ? bal.pathing.buildingSlowPct / 100 : 1); // 6.7 F3: × 1.3 enraged
  const step = Math.min(d, speed * TICK_DT_S);
  const nx = b.x + (dx / d) * step;
  const ny = b.y + (dy / d) * step;
  pushOutOfBuildings(world, nx, ny, bal.radiusM, b.x, b.y, false); // map solids only: buildings aren't solid to it
  b.facing = Math.atan2(dy, dx);
  // Review L6 / M-new-1: the player system runs before this one, so the body pushes the survivors it
  // walks into out this same tick (D1); the step is rolled back only if one is truly pinned against a
  // map box (it would end the tick inside the body). Survivors never stop it otherwise.
  const tx = pushed.x;
  const ty = pushed.y;
  if (!pushSurvivorsFromBody(world, tx, ty)) return;
  b.x = tx;
  b.y = ty;
}

/** Review M-new-1: survivor positions before the body push (restored when the step is rolled back). */
const pushBackupX = new Float64Array(8);
const pushBackupY = new Float64Array(8);

/**
 * D1 + review L6 / M-new-1: the body moves to (x, y) and pushes every standing survivor it overlaps out
 * along the centre line, then out of the obstacles (the same tick: the player system already ran).
 * Only + − × ÷ and sqrt. Returns false — and puts every survivor back — when one would still overlap
 * the body afterwards (truly pinned against a map box): the caller then rolls the step back.
 */
export function pushSurvivorsFromBody(world: World, x: number, y: number): boolean {
  const R = world.balance.boss.radiusM;
  let i = 0;
  let pinned = false;
  for (const p of world.players.values()) {
    if (i < pushBackupX.length) {
      pushBackupX[i] = p.x;
      pushBackupY[i] = p.y;
    }
    i++;
    if (p.status !== "alive") continue;
    const min = R + p.radiusM;
    let dx = p.x - x;
    let dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    if (d > 1e-9) {
      dx /= d;
      dy /= d;
    } else {
      dx = 1;
      dy = 0;
    }
    const fromX = p.x;
    const fromY = p.y;
    const wantX = x + dx * min;
    const wantY = y + dy * min;
    pushOutOfBuildings(world, wantX, wantY, p.radiusM, fromX, fromY);
    p.x = pushed.x;
    p.y = pushed.y;
    const ex = p.x - x;
    const ey = p.y - y;
    if (ex * ex + ey * ey < (min - 1e-6) * (min - 1e-6)) {
      pinned = true;
      // Review LOW-1 (D8): pinned against a PLAYER building, the boss crushes that building through
      // the survivor (buildingDps, as if its body touched it): a survivor in front of a barricade line
      // slows it, never holds it.
      crushBuildingsAt(world, wantX, wantY, p.radiusM);
    }
  }
  if (!pinned) return true;
  i = 0;
  for (const p of world.players.values()) {
    if (i < pushBackupX.length) {
      p.x = pushBackupX[i] as number;
      p.y = pushBackupY[i] as number;
    }
    i++;
  }
  return false;
}

/** Review LOW-1: every solid player building the circle (x, y, r) overlaps takes `buildingDps` × dt. */
function crushBuildingsAt(world: World, x: number, y: number, r: number): void {
  const dmg = world.balance.boss.buildingDps * TICK_DT_S;
  const list = world.buildings.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const bd = list[i] as Building | undefined;
    if (!bd || !bd.solid || !circleOverlapsBox(x, y, r, bd.minX, bd.minY, bd.maxX, bd.maxY)) continue;
    bossStats.buildingDamage += dmg;
    if (damageBuilding(world, bd, dmg)) bossStats.buildingsBroken++;
  }
}

/** D8: every player building its body overlaps takes `buildingDps` × dt (5 HP a tick). */
function crushBuildings(world: World): void {
  const b = world.boss;
  const r = world.balance.boss.radiusM;
  const dmg = world.balance.boss.buildingDps * TICK_DT_S;
  const list = world.buildings.list;
  let any = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const bd = list[i] as Building | undefined;
    if (!bd || !bd.solid || !circleOverlapsBox(b.x, b.y, r, bd.minX, bd.minY, bd.maxX, bd.maxY)) continue;
    any = true;
    bossStats.buildingDamage += dmg;
    if (damageBuilding(world, bd, dmg)) bossStats.buildingsBroken++;
  }
  b.pushing = any;
}

/** Zombies overlapping its body are pushed out of it (the boss is never pushed). */
function shoveZombies(world: World): void {
  const b = world.boss;
  const R = world.balance.boss.radiusM;
  const z = world.zombies;
  const n = queryRadius(world.zombieGrid, z.x, z.y, b.x, b.y, R + maxZombieRadius(world.balance), candidates);
  for (let k = 0; k < n; k++) {
    const id = candidates[k] as number;
    if (!isZombieAlive(z, id)) continue;
    const zr = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const zx = z.x[id] as number;
    const zy = z.y[id] as number;
    const dx = zx - b.x;
    const dy = zy - b.y;
    const min = R + zr;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2);
    const ux = d > 1e-6 ? dx / d : 1;
    const uy = d > 1e-6 ? dy / d : 0;
    pushOutOfBuildings(world, b.x + ux * min, b.y + uy * min, zr, zx, zy);
    z.x[id] = pushed.x;
    z.y[id] = pushed.y;
  }
}

/** The `boss` system (server and solo). */
export const updateBoss: SystemFn = (world) => {
  const b = world.boss;
  if (world.run.phase === "build" || world.run.phase === "lobby") {
    if (b.state !== BOSS_STATE.NONE) {
      resetBoss(b); // a build start: no boss (6.7 owns the death itself)
      resetBossField(world);
    }
    return;
  }
  if (world.run.phase !== "wave") return;
  if (b.state === BOSS_STATE.NONE) {
    if (!arrivalDue(world)) return;
    startBossWarning(world);
    return; // the warning's first tick is this one
  }
  if (b.state === BOSS_STATE.DEAD) {
    flushBossHits(world); // the killing blow's hit flash
    return;
  }
  b.stateTicks++;
  if (b.state === BOSS_STATE.WARNING) {
    if (b.stateTicks >= ticksFor(world.balance.boss.warningS)) arrive(world);
    return;
  }
  if (!bossBodyOn(b)) return;
  advanceThreat(world);
  if (b.cooldown.slam > 0) b.cooldown.slam--;
  if (b.cooldown.charge > 0) b.cooldown.charge--;
  if (b.cooldown.throw > 0) b.cooldown.throw--;
  const target = pickBossTarget(world);
  updateThrowFlight(world); // Story 6.6: a chunk in flight lands on its hit tick, whatever the boss does
  updateCrawlerDrops(world); // Story 6.7: while enraged, every state
  if (b.state === BOSS_STATE.WALK) {
    // Story 6.7 (DD1): the roar only from WALK, before the gap counts down.
    if (!checkEnrage(world)) {
      if (b.gapTicks > 0) b.gapTicks--;
      if (pickBossAttack(world) === BOSS_ATTACK.NONE) walk(world, target);
    }
  } else if (b.state === BOSS_STATE.ROAR) updateRoar(world);
  else updateBossAttack(world);
  if (bossBodyOn(b)) {
    crushBuildings(world);
    if (world.balance.boss.bodyPushZombies) shoveZombies(world);
  }
  flushBossHits(world);
};
