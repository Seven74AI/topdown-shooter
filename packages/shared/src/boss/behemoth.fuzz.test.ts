import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { placeBuilding, type Building } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { createRng } from "../core/rng";
import { createWorld, type World } from "../core/world";
import { changeDecayStage } from "../decay/decaySystem";
import { masksForStage } from "../decay/masks.testkit";
import { applyDecayStage } from "../decay/applyDecayStage";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { flowCellAt, flowCellCenterX, flowCellCenterY } from "../zombies/flowField";
import { BOSS_STATE } from "./bossState";
import { bossStats } from "./telegraph";
import { pickBossEntry, bossEntry } from "./behemoth";
import { tickN } from "./testBoss";
import { applyBossDamage } from "./bossDamage";

/**
 * Story 6.5 (brief line 7): the Behemoth in random Downtown layouts × decay stages 1–5 (Story 6.2 review M2:
 * stages 4–5 with Ruins rubble, every collapsed alley) × variant masks × ≥ 3,000 ticks, with 110
 * zombies and 1–4 players (1e9 HP, not god mode: the slams really hit and push them) next to random
 * barricades and turrets. Every tick: the boss's centre never inside a map box (its true radius), no
 * player inside a box after a push, the boss grid's walls untouched mid-wave. Per layout: it reaches a
 * player or breaks a building within 30 s (no stall). Liveness over all layouts: slam hits, a broken
 * building, a target switch.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const R = balance.boss.radiusM;
const LAYOUTS = 15; // Story 6.2 review M2: 3 per stage (stages 4–5: masks 21, 28, 56, 63, 91, 98 = every collapsed alley)
const TICKS = 3000;
const NO_STALL_TICKS = 30 * 20;

/** Cells reachable on the boss grid from (x, y): a flood (test helper; allocation is fine here). */
function reachable(world: World, x: number, y: number): number[] {
  const nav = world.pathing.boss;
  let start = flowCellAt(nav, x, y);
  for (let r = 1; r <= 8 && nav.wallAt[start] !== 0; r++) {
    const c0 = flowCellAt(nav, x, y);
    const cx0 = c0 % nav.cols;
    const cy0 = (c0 - cx0) / nav.cols;
    for (let dy = -r; dy <= r && nav.wallAt[start] !== 0; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx0 + dx;
        const ny = cy0 + dy;
        if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
        if (nav.wallAt[ny * nav.cols + nx] === 0) {
          start = ny * nav.cols + nx;
          break;
        }
      }
  }
  const seen = new Uint8Array(nav.cells);
  const out: number[] = [];
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const c = q.pop() as number;
    if (nav.wallAt[c] !== 0) continue;
    out.push(c);
    const cx = c % nav.cols;
    const cy = (c - cx) / nav.cols;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
      const n = ny * nav.cols + nx;
      if (seen[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return out;
}

/** One random layout: the boss at an open entry, 1–4 survivors (1e9 HP) round random barricades / turrets / traps / mines, 110 zombies. */
/** Story 6.2 review M2: the collapsed alleys the stage-4/5 layouts ran (every one must). */
const alleys = new Set<number>();

function layoutWorld(layout: number, rng: ReturnType<typeof createRng>, withFloor = false): { w: World; nPlayers: number; walls0: string } {
  // Story 6.2 review M2: stages 1–5, each stage's gameplay masks (stages 4–5: × the 3 collapsed alleys).
  const stage = 1 + (layout % 5);
  const masks = masksForStage(map, stage);
  const w = createWorld({ balance, seed: 100 + layout, map, systems: { waves: () => {} } });
  applyDecayStage(w, 1, masks[(layout * 7) % masks.length] as number);
  if (stage >= 4) alleys.add([9, 10, 11].findIndex((b) => (w.decay.variants >>> b) & 1));
  if (stage > 1) changeDecayStage(w, stage);
  pickBossEntry(w);
  const ex = bossEntry.x;
  const ey = bossEntry.y;
  const cells = reachable(w, ex, ey);
  expect(cells.length).toBeGreaterThan(100);
  const nPlayers = 1 + (layout % 4);
  for (let i = 0; i < nPlayers; i++) {
    const c = cells[Math.floor(rng.next() * cells.length)] as number;
    const p = addPlayer(w, `p${i}`, flowCellCenterX(w.pathing.boss, c), flowCellCenterY(w.pathing.boss, c));
    p.hp = 1e9;
    p.maxHp = 1e9;
    p.wallet = 100_000;
  }
  // Barricades and turrets round the players (legal placements only); 6.6: traps and mines too.
  w.run.phase = "build";
  const types = withFloor ? ["wood_barricade", "metal_barricade", "auto_turret", "spike_trap", "mine"] : ["wood_barricade", "metal_barricade", "auto_turret"];
  for (let k = 0; k < (withFloor ? 16 : 10); k++) {
    const p = w.players.get(`p${k % nPlayers}`);
    if (!p) continue;
    const gx = Math.round((p.x + (rng.next() - 0.5) * 8) / BUILD_GRID_M);
    const gy = Math.round((p.y + (rng.next() - 0.5) * 8) / BUILD_GRID_M);
    placeBuilding(w, p.id, { type: types[k % types.length] as string, gx, gy, rot: (k % 2) as 0 | 1 });
  }
  w.run.phase = "wave";
  // 110 zombies from the street ends.
  for (let i = 0; i < 110; i++) {
    const sp = map.spawnPoints[i % map.spawnPoints.length];
    if (!sp || sp.minStage > stage) continue;
    spawnZombie(w, i % 3 === 0 ? "crawler" : "walker", Math.min(map.widthM - 1, Math.max(1, sp.x)), Math.min(map.heightM - 1, Math.max(1, sp.y)), true);
  }
  w.boss.state = BOSS_STATE.WALK;
  w.boss.x = ex;
  w.boss.y = ey;
  w.boss.hp = 1e9;
  w.boss.maxHp = 1e9;
  w.boss.wave = w.waves.number;
  w.boss.gapTicks = 20;
  w.boss.number = 1;
  return { w, nPlayers, walls0: Array.from(w.pathing.boss.wallAt).join("") };
}

type Box = { minX: number; minY: number; maxX: number; maxY: number; name?: string };
const boxesOf = (w: World): readonly Box[] => [...w.obstacles.solids, ...w.buildings.list.filter((b: Building) => b.solid)];

/** Every-tick spatial checks: the boss's centre never in a map box (true radius) nor off the map; (every `every` ticks) no player in a box. */
function spatialChecks(w: World, layout: number, t: number, every: number): void {
  const b = w.boss;
  if (b.state === BOSS_STATE.DEAD || b.state === BOSS_STATE.NONE) return;
  for (const s of w.obstacles.solids) expect(circleOverlapsBox(b.x, b.y, R - 1e-6, s.minX, s.minY, s.maxX, s.maxY), `layout ${layout} t ${t}: boss in ${s.name}`).toBe(false);
  expect(b.x >= R - 1e-6 && b.x <= map.widthM - R + 1e-6 && b.y >= R - 1e-6 && b.y <= map.heightM - R + 1e-6, `layout ${layout} t ${t}: boss off the map`).toBe(true);
  if (t % every === 0) {
    const bx = boxesOf(w);
    for (const p of w.players.values()) for (const s of bx) expect(circleOverlapsBox(p.x, p.y, p.radiusM - 1e-4, s.minX, s.minY, s.maxX, s.maxY), `layout ${layout} t ${t}: ${p.id} in a box`).toBe(false);
  }
}

describe("Story 6.5 Behemoth fuzz (brief 7)", () => {
  it(`${LAYOUTS} layouts × stages 1–5 × variant masks × ${TICKS} ticks: no box overlap, no stall, walls only at build starts`, () => {
    const rng = createRng(6505);
    let slamHits = 0;
    let broken = 0;
    let switches = 0;
    for (let layout = 0; layout < LAYOUTS; layout++) {
      bossStats.slamPlayerHits = 0;
      bossStats.buildingsBroken = 0;
      bossStats.chargePlayerHits = 0;
      bossStats.throwPlayerHits = 0;
      bossStats.chargeBuildingsSmashed = 0;
      const { w, walls0 } = layoutWorld(layout, rng);
      let seenTargets = 0;
      w.events.subscribe((e) => {
        if (e.type === "boss.target_changed") seenTargets++;
      });
      let reachedAt = -1;
      for (let t = 0; t < TICKS; t++) {
        tickN(w);
        const b = w.boss;
        expect(b.state >= BOSS_STATE.WALK && b.state <= BOSS_STATE.ROAR).toBe(true);
        spatialChecks(w, layout, t, 5);
        if (reachedAt < 0) {
          for (const p of w.players.values()) if (Math.hypot(p.x - b.x, p.y - b.y) <= R + p.radiusM + balance.boss.slam.triggerM) reachedAt = t;
          // Story 6.6: a charge or throw that lands, or a smashed building, is it reaching the team too.
          if (bossStats.buildingsBroken > 0 || bossStats.chargeBuildingsSmashed > 0 || bossStats.chargePlayerHits > 0 || bossStats.throwPlayerHits > 0) reachedAt = t;
        }
      }
      expect(reachedAt, `layout ${layout}: stalled`).toBeGreaterThanOrEqual(0);
      expect(reachedAt, `layout ${layout}: stalled`).toBeLessThan(NO_STALL_TICKS);
      expect(Array.from(w.pathing.boss.wallAt).join("")).toBe(walls0);
      slamHits += bossStats.slamPlayerHits;
      broken += bossStats.buildingsBroken + bossStats.chargeBuildingsSmashed;
      switches += seenTargets;
    }
    // Liveness (brief 9): the fuzz really fought.
    expect(slamHits).toBeGreaterThan(0);
    expect(broken).toBeGreaterThan(0);
    expect(switches).toBeGreaterThan(LAYOUTS);
    expect([...alleys].sort()).toEqual([0, 1, 2]); // Story 6.2 review M2: every collapsed alley ran at stages 4–5
  }, 240_000);
});

/**
 * Stories 6.6 + 6.7 (brief 7, 9, 22): the same random layouts (traps and mines added) with the slam
 * parked so it charges and throws every cooldown, the gap shortened; half the layouts start enraged
 * (Crawlers drop), every third one is killed at t 2,000. Every tick: the boss never in a map box or
 * off the map (after every rush), no player in a box (after every shove), alive ≤ 110 while it lives,
 * every Crawler drop clear of boxes and ≥ 1.5 m from standing players, no boss damage after its
 * death, the boss grid's walls never change. Liveness: crashes, clean charges, throw hits, buildings
 * smashed, roars, ≥ 3 drops, a death.
 */
describe("Stories 6.6 + 6.7 Behemoth charge / throw / enrage fuzz (brief 7)", () => {
  it(`${LAYOUTS * 2} layouts × ${TICKS} ticks: lanes and drops never in a box, no stall, cap 110, a dead boss never hurts`, () => {
    const rng = createRng(6606);
    const total = { crashes: 0, clean: 0, throwHits: 0, smashed: 0, roars: 0, drops: 0, deaths: 0, chargeHits: 0 };
    const crawlerR = balance.zombies.types.crawler?.radiusM ?? 0.3;
    for (let layout = 0; layout < LAYOUTS * 2; layout++) {
      for (const k of Object.keys(bossStats) as (keyof typeof bossStats)[]) bossStats[k] = 0;
      const { w, walls0 } = layoutWorld(layout, rng, true);
      const enrageStart = layout % 2 === 0;
      if (enrageStart) {
        w.boss.hp = w.boss.maxHp * 0.4; // roars at the first walking tick
      }
      const killAt = layout % 3 === 0 ? 2000 : -1;
      let deadTick = -1;
      let hurtAfterDeath = 0;
      w.events.subscribe((e) => {
        if (e.type === "boss.crawler_dropped") {
          for (const s of boxesOf(w)) expect(circleOverlapsBox(e.x, e.y, crawlerR, s.minX, s.minY, s.maxX, s.maxY), `layout ${layout}: Crawler dropped in a box`).toBe(false);
          for (const p of w.players.values()) if (p.status === "alive") expect(Math.hypot(p.x - e.x, p.y - e.y), `layout ${layout}: Crawler on a player`).toBeGreaterThan(balance.boss.enrage.crawlerPlayerClearM);
        }
        if (deadTick >= 0 && e.type === "player.damaged" && e.tag === "boss") hurtAfterDeath++;
        if (deadTick >= 0 && (e.type === "boss.slammed" || e.type === "boss.thrown_impact" || e.type === "boss.crashed" || e.type === "boss.telegraph")) hurtAfterDeath++;
      });
      let lastProgress = 0;
      let progressAt = 0;
      for (let t = 0; t < TICKS; t++) {
        const b = w.boss;
        if (b.state !== BOSS_STATE.DEAD) {
          b.cooldown.slam = 1e9; // the slam parked: charges and throws every cooldown
          if (b.state === BOSS_STATE.WALK && b.gapTicks > 4) b.gapTicks = 4;
        }
        if (t === killAt && b.state !== BOSS_STATE.DEAD) {
          b.hp = 1;
          applyBossDamage(w, 10, "p0", "pistol");
          expect(w.boss.state).toBe(BOSS_STATE.DEAD);
          deadTick = t;
        }
        tickN(w);
        spatialChecks(w, layout, t, 1);
        if (w.boss.state !== BOSS_STATE.DEAD) expect(w.zombies.aliveCount, `layout ${layout} t ${t}: above the cap`).toBeLessThanOrEqual(110);
        const p = bossStats.charges + bossStats.throws + bossStats.slams + bossStats.buildingsBroken + bossStats.chargeBuildingsSmashed;
        // In slam reach counts as reaching the team (the slam is parked here only to force charges and throws).
        let near = false;
        for (const q of w.players.values()) if (q.status === "alive" && Math.hypot(q.x - w.boss.x, q.y - w.boss.y) <= balance.boss.slam.triggerM + 1) near = true;
        if (p !== lastProgress || near || w.boss.state === BOSS_STATE.DEAD) {
          lastProgress = p;
          progressAt = t;
        }
        expect(t - progressAt, `layout ${layout} t ${t}: no attack for 30 s (stall)`).toBeLessThan(NO_STALL_TICKS);
      }
      expect(hurtAfterDeath, `layout ${layout}: a dead boss attacked`).toBe(0);
      expect(Array.from(w.pathing.boss.wallAt).join("")).toBe(walls0);
      total.crashes += bossStats.crashes;
      total.clean += bossStats.cleanCharges;
      total.throwHits += bossStats.throwPlayerHits;
      total.smashed += bossStats.chargeBuildingsSmashed;
      total.roars += bossStats.roars;
      total.drops += bossStats.crawlersDropped;
      total.deaths += bossStats.kills;
      total.chargeHits += bossStats.chargePlayerHits;
      if (enrageStart) expect(bossStats.roars, `layout ${layout}: never roared`).toBe(1);
    }
    // Liveness (brief 9): it really charged, crashed, threw, smashed, roared, dropped and died.
    expect(total.crashes).toBeGreaterThan(0);
    expect(total.clean).toBeGreaterThan(0);
    expect(total.chargeHits).toBeGreaterThan(0);
    expect(total.throwHits).toBeGreaterThan(0);
    expect(total.smashed).toBeGreaterThan(0);
    expect(total.roars).toBeGreaterThanOrEqual(LAYOUTS);
    expect(total.drops).toBeGreaterThanOrEqual(3);
    expect(total.deaths).toBeGreaterThan(0);
  }, 400_000);
});
