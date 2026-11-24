import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { placeBuilding, type Building } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { createRng } from "../core/rng";
import { createWorld, type World } from "../core/world";
import { changeDecayStage } from "../decay/decaySystem";
import { legalDecayMasks } from "../decay/decayState";
import { applyDecayStage } from "../decay/applyDecayStage";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { flowCellAt, flowCellCenterX, flowCellCenterY } from "../zombies/flowField";
import { BOSS_STATE } from "./bossState";
import { bossStats } from "./telegraph";
import { pickBossEntry, bossEntry } from "./behemoth";
import { tickN } from "./testBoss";

/**
 * Story 6.5 (brief line 7): the Behemoth in random Downtown layouts × decay stages (1–3: the stages
 * the map has today; 6.2 adds 4–5 and re-runs this) × variant masks × ≥ 3,000 ticks, with 110
 * zombies and 1–4 players (1e9 HP, not god mode: the slams really hit and push them) next to random
 * barricades and turrets. Every tick: the boss's centre never inside a map box (its true radius), no
 * player inside a box after a push, the boss grid's walls untouched mid-wave. Per layout: it reaches a
 * player or breaks a building within 30 s (no stall). Liveness over all layouts: slam hits, a broken
 * building, a target switch.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const R = balance.boss.radiusM;
const LAYOUTS = 9;
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

describe("Story 6.5 Behemoth fuzz (brief 7)", () => {
  it(`${LAYOUTS} layouts × stages 1–3 × variant masks × ${TICKS} ticks: no box overlap, no stall, walls only at build starts`, () => {
    const rng = createRng(6505);
    const masks = legalDecayMasks(map);
    let slamHits = 0;
    let broken = 0;
    let switches = 0;
    for (let layout = 0; layout < LAYOUTS; layout++) {
      const stage = 1 + (layout % 3);
      const w = createWorld({ balance, seed: 100 + layout, map, systems: { waves: () => {} } });
      applyDecayStage(w, 1, masks[layout % masks.length] as number);
      if (stage > 1) changeDecayStage(w, stage);
      bossStats.slamPlayerHits = 0;
      bossStats.buildingsBroken = 0;
      // The boss at an open entry; the players in cells its body can reach from there.
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
      // Barricades and turrets round the players (legal placements only).
      w.run.phase = "build";
      const types = ["wood_barricade", "metal_barricade", "auto_turret"];
      for (let k = 0; k < 10; k++) {
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
      let seenTargets = 0;
      w.events.subscribe((e) => {
        if (e.type === "boss.target_changed") seenTargets++;
      });
      const walls0 = Array.from(w.pathing.boss.wallAt).join("");
      let reachedAt = -1;
      const boxes = (): readonly { minX: number; minY: number; maxX: number; maxY: number }[] => [...w.obstacles.solids, ...w.buildings.list.filter((b: Building) => b.solid)];
      for (let t = 0; t < TICKS; t++) {
        tickN(w);
        const b = w.boss;
        expect(b.state === BOSS_STATE.WALK || b.state === BOSS_STATE.TELEGRAPH || b.state === BOSS_STATE.RECOVER).toBe(true);
        for (const s of w.obstacles.solids) expect(circleOverlapsBox(b.x, b.y, R - 1e-6, s.minX, s.minY, s.maxX, s.maxY), `layout ${layout} t ${t}: boss in ${s.name}`).toBe(false);
        expect(b.x >= R - 1e-6 && b.x <= map.widthM - R + 1e-6 && b.y >= R - 1e-6 && b.y <= map.heightM - R + 1e-6).toBe(true);
        if (t % 5 === 0) {
          const bx = boxes();
          for (const p of w.players.values()) for (const s of bx) expect(circleOverlapsBox(p.x, p.y, p.radiusM - 1e-4, s.minX, s.minY, s.maxX, s.maxY), `layout ${layout} t ${t}: ${p.id} in a box`).toBe(false);
        }
        if (reachedAt < 0) {
          for (const p of w.players.values()) if (Math.hypot(p.x - b.x, p.y - b.y) <= R + p.radiusM + balance.boss.slam.triggerM) reachedAt = t;
          if (bossStats.buildingsBroken > 0) reachedAt = t;
        }
      }
      expect(reachedAt, `layout ${layout}: stalled`).toBeGreaterThanOrEqual(0);
      expect(reachedAt, `layout ${layout}: stalled`).toBeLessThan(NO_STALL_TICKS);
      expect(Array.from(w.pathing.boss.wallAt).join("")).toBe(walls0);
      slamHits += bossStats.slamPlayerHits;
      broken += bossStats.buildingsBroken;
      switches += seenTargets;
    }
    // Liveness (brief 9): the fuzz really fought.
    expect(slamHits).toBeGreaterThan(0);
    expect(broken).toBeGreaterThan(0);
    expect(switches).toBeGreaterThan(LAYOUTS);
  }, 240_000);
});
