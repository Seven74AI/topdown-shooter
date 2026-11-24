import { describe, expect, it } from "vitest";
import { createWorld } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { createObstacles } from "../map/obstacles";
import { createNavGrid, flowCellAt } from "../zombies/flowField";
import { legalDecayMasks } from "../decay/decayState";
import { applyDecayStage } from "../decay/applyDecayStage";
import { mutationApplies } from "../map/obstacles";
import { addPlayer } from "../player/player";
import { MAP_STAGE_COUNT, type MapBox } from "../map/districtMap";
import { ZOMBIE_STATE } from "../zombies/zombieTypes";
import { EVENT_KINDS, EVENT_PHASE } from "./eventState";
import { laneAlong } from "./stampede";
import { balance, tickN } from "./testEvents";

/**
 * Story 6.8 (AC 11, T2; brief 7): the `events` layer's spots and lanes at every stage × legal variant
 * mask: spots box-free (≥ 1 m from every solid), fire-free and reachable from the team start; every
 * lane lets a 30-Runner stampede cross or convert with no Runner ever inside a box.
 */
const map = DOWNTOWN_MAP;
const MASKS = legalDecayMasks(map);
/** At most this many masks per stage for the lane sims (spread over the list; the spot checks take all). */
const LANE_MASKS = 8;
const CLEAR_M = 1;
const TEAM_START = [24, 16] as const;

const distBox = (x: number, y: number, b: MapBox): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minY - y, 0, y - b.maxY));

function reachableCells(solids: readonly MapBox[]): Uint8Array {
  const nav = createNavGrid({ widthM: map.widthM, heightM: map.heightM, solids });
  const seen = new Uint8Array(nav.cells);
  const q = [flowCellAt(nav, TEAM_START[0], TEAM_START[1])];
  seen[q[0]!] = 1;
  while (q.length) {
    const c = q.pop()!;
    const cx = c % nav.cols;
    const cy = (c - cx) / nav.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
      const n = ny * nav.cols + nx;
      if (seen[n] || nav.wallAt[n] !== 0) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

describe("Story 6.8: event spots (crate ×10, survivor ×8, safe ×6) and 4 stampede lanes", () => {
  it("the layer holds them, named and on open road", () => {
    const count = (k: string) => map.eventSpots.filter((s) => s.kind === k).length;
    expect([count("crate"), count("survivor"), count("safe")]).toEqual([10, 8, 6]);
    expect(map.stampedeLanes.map((l) => `${l.name}:${l.dir}`)).toEqual(["lane_main_eastbound:e", "lane_main_westbound:w", "lane_cross_southbound:s", "lane_cross_northbound:n"]);
    for (const l of map.stampedeLanes) expect(Math.min(l.maxX - l.minX, l.maxY - l.minY)).toBe(balance.events.stampede.laneWidthM);
  });

  it(`every spot is ≥ ${CLEAR_M} m from every box, outside every fire zone and reachable from the team start, at every stage × ${MASKS.length} masks`, () => {
    let checks = 0;
    for (let stage = 1; stage <= MAP_STAGE_COUNT; stage++) {
      for (const mask of stage === 1 ? [0] : MASKS) {
        const o = createObstacles(map, stage, mask);
        const seen = reachableCells(o.solids);
        const nav = createNavGrid({ widthM: map.widthM, heightM: map.heightM, solids: [] });
        const fires = map.decay.filter((m) => m.action === "ignite" && mutationApplies(m, stage, mask));
        for (const s of map.eventSpots) {
          if (s.minStage > stage) continue;
          for (const b of o.solids) expect(distBox(s.x, s.y, b), `${s.name} vs ${b.name} @ stage ${stage} mask ${mask}`).toBeGreaterThanOrEqual(CLEAR_M);
          for (const f of fires) expect(Math.hypot(s.x - (f.minX + f.maxX) / 2, s.y - (f.minY + f.maxY) / 2), `${s.name} in fire ${f.name}`).toBeGreaterThan(balance.decay.fire.radiusM + 0.5);
          expect(seen[flowCellAt(nav, s.x, s.y)], `${s.name} reachable @ stage ${stage} mask ${mask}`).toBe(1);
          checks++;
        }
      }
    }
    expect(checks).toBeGreaterThan(24 * MASKS.length);
  });

  it(`every lane: a 30-Runner stampede spawns, never puts a Runner in a box, and ends with every Runner crossed or converted (stages 1–5 × ≤ ${LANE_MASKS} masks)`, () => {
    let exitedCross = 0;
    let spawnedCross = 0;
    let stuckAll = 0;
    let spawnedAll = 0;
    for (let stage = 1; stage <= MAP_STAGE_COUNT; stage++) {
      const masks = stage === 1 ? [0] : MASKS.filter((_, i) => i % Math.ceil(MASKS.length / LANE_MASKS) === 0);
      for (const mask of masks) {
        for (let li = 0; li < map.stampedeLanes.length; li++) {
          const world = createWorld({ balance, seed: 7 + li, map });
          applyDecayStage(world, stage, mask);
          for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 3 + i, 30.8); // out of every lane (south-west sidewalk)
          world.debug.godMode = true;
          world.run.phase = "wave";
          world.waves.number = 3;
          world.waves.size = 100;
          world.waves.paused = true;
          world.special.scheduled = true;
          const x = world.special.extra;
          x.kind = EVENT_KINDS.indexOf("stampede");
          x.wave = 3;
          x.startFraction = 0;
          tickN(world, 1);
          const a = world.special.active;
          expect(a.phase).toBe(EVENT_PHASE.WARNING);
          a.lane = li; // run this lane
          const lane = map.stampedeLanes[li]!;
          const r = balance.zombies.types.runner!.radiusM;
          let early = 0;
          for (let t = 0; t < 20 * 14 && world.special.active.kind !== -1; t++) {
            early = world.special.log.stampedeConverted; // conversions before the 10 s end (the stuck rule)
            tickN(world, 1);
            const z = world.zombies;
            for (let k = 0; k < z.aliveCount; k++) {
              const id = z.aliveIds[k]!;
              if (z.state[id] !== ZOMBIE_STATE.STAMPEDE) continue;
              for (const b of world.obstacles.solids) expect(distBox(z.x[id]!, z.y[id]!, b), `lane ${lane.name} stage ${stage}: runner in ${b.name}`).toBeGreaterThan(r - 0.05);
              expect(laneAlong(lane, z.x[id]!, z.y[id]!)).toBeGreaterThan(-0.5);
            }
          }
          const log = world.special.log;
          expect(world.special.active.kind).toBe(-1);
          expect(log.stampedeSpawned, `${lane.name} stage ${stage} mask ${mask}`).toBe(30);
          expect(log.stampedeExited + log.stampedeConverted).toBe(30);
          stuckAll += early;
          spawnedAll += log.stampedeSpawned;
          if (lane.dir === "n" || lane.dir === "s") {
            exitedCross += log.stampedeExited;
            spawnedCross += log.stampedeSpawned;
          }
        }
      }
    }
    // Liveness: on the 32 m cross street most Runners really cross (the 48 m main street takes 9.6 s at
    // 5 m/s: most join the wave near its far end at 10 s); cover deflects them, the stuck rule is rare.
    expect(exitedCross / spawnedCross).toBeGreaterThan(0.8);
    expect(stuckAll / spawnedAll).toBeLessThan(0.05);
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[stampede lanes] cross street crossed ${exitedCross}/${spawnedCross}; stuck-converted ${stuckAll}/${spawnedAll}`);
  }, 120_000);
});
