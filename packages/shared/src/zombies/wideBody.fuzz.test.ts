import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import { ticksFor } from "../core/time";
import { createWorld } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { spotBlocked } from "../player/freeSpot";
import { addPlayer, type PlayerState } from "../player/player";
import { spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE, type ZombieTypeId } from "./zombieTypes";
import { wideStallStats } from "./zombieAi";
import { STILL_S, insideBox, runTrial, type WideTrial } from "./wideBody.testkit";

/**
 * Story 6.13 (brief lines 7 and 9): wide bodies (Brute 0.6 m, Bloater 0.5 m) round random barricade
 * boxes on Downtown, every wall of the box randomly shifted half a cell along and/or out, so its
 * corners leave 0.5 m diagonal gaps (too narrow for a wide body, the 6.8 review M1 shape); some boxes
 * have an open side (players reachable by walking), some are closed (the body must break in). 1–3
 * god-mode players camp inside, standing still. One wide zombie (CHASE or RUSH) starts 2–8 m out.
 *
 * Every trial: (i) within `BOUND_S` the zombie reaches a player (contact, a Bloater swell, a Brute
 * windup) or attacks a building (a building lost HP, or a Bloater swelled against one);
 * (ii) the fairness rule: it never stands still (< `STILL_M` from where it was) for more than
 * `STILL_S` while not attacking (touching a player, winding up, swelling or a building losing HP);
 * (iii) no body inside a box. Liveness: both outcomes (player reached, building attacked) happen, and
 * so do both types, both states, closed boxes and the stall net (Story 6.13's fix) firing.
 * Without the fix, trials 128 (Bloater RUSH), 2084 (Brute) and 2485 (Bloater RUSH) of 1,500 stood
 * still for the whole bound (35–40 s): those three layouts are pinned in `wideBodyStall.test.ts`.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const TRIALS = 240;
const BOUND_S = 45;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const TYPES: ZombieTypeId[] = ["bloater", "brute"];

/** One wall of a 2 × 2 m pocket whose min corner is (x0, y0): its own min corner and rotation, shifted by (along, out) half-cells. */
function wallSpec(side: number, x0: number, y0: number, along: number, out: number): { x: number; y: number; rot: BuildingRotation } {
  const a = along * BUILD_GRID_M;
  const o = out * BUILD_GRID_M;
  if (side === 0) return { x: x0 + a, y: y0 - 0.5 - o, rot: 0 }; // north (horizontal)
  if (side === 1) return { x: x0 + a, y: y0 + 2 + o, rot: 0 }; // south
  if (side === 2) return { x: x0 - 0.5 - o, y: y0 + a, rot: 1 }; // west (vertical)
  return { x: x0 + 2 + o, y: y0 + a, rot: 1 }; // east
}

function trial(seed: number): WideTrial | null {
  const rng: Rng = createRng(seed * 7919 + 13);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  const stage = [1, 4, 5][rng.int(0, 2)] as number;
  world.decay.variants = MASKS[rng.int(0, MASKS.length - 1)] as number;
  applyDecayStage(world, stage, world.decay.variants);
  world.debug.godMode = true;
  const x0 = rng.int(4, (map.widthM - 6) / BUILD_GRID_M) * BUILD_GRID_M;
  const y0 = rng.int(4, (map.heightM - 6) / BUILD_GRID_M) * BUILD_GRID_M;
  const open = rng.int(0, 2) === 0 ? rng.int(0, 3) : -1; // a third of the boxes have an open side
  let id = 1;
  let walls = 0;
  const desc: string[] = [];
  for (let side = 0; side < 4; side++) {
    if (side === open) continue;
    const w = wallSpec(side, x0, y0, rng.int(-1, 1), rng.int(0, 1));
    const type = rng.int(0, 1) === 0 ? "wood_barricade" : "metal_barricade";
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    const gx = Math.round(w.x / BUILD_GRID_M);
    const gy = Math.round(w.y / BUILD_GRID_M);
    if (footprintBlocked(world, footprint(stats, gx, gy, w.rot, box))) continue;
    addBuildingAt(world, { id: id++, type, ownerId: "p0", gx, gy, rot: w.rot, hp: stats.hp });
    walls++;
    desc.push(`${type}@(${w.x},${w.y},r${w.rot})`);
  }
  if (walls < 2) return null;
  const pr = balance.player.radiusM;
  const players: PlayerState[] = [];
  const want = rng.int(1, 3);
  for (let tries = 0; tries < 60 && players.length < want; tries++) {
    const x = x0 + rng.range(pr + 0.05, 2 - pr - 0.05);
    const y = y0 + rng.range(pr + 0.05, 2 - pr - 0.05);
    if (spotBlocked(world, x, y, pr, null)) continue;
    const p = addPlayer(world, `p${players.length}`, x, y);
    p.hp = 1e9;
    p.maxHp = 1e9;
    players.push(p);
  }
  if (players.length === 0) return null;
  const type = TYPES[rng.int(0, 1)] as ZombieTypeId;
  const rz = balance.zombies.types[type]?.radiusM ?? 0;
  const rush = rng.int(0, 1) === 0;
  for (let tries = 0; tries < 200; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(2, 8);
    const x = x0 + 1 + Math.cos(a) * d;
    const y = y0 + 1 + Math.sin(a) * d;
    if (x < rz + 0.1 || y < rz + 0.1 || x > map.widthM - rz - 0.1 || y > map.heightM - rz - 0.1) continue;
    if (insideBox(world, x, y, rz + 0.05) || spotBlocked(world, x, y, rz, null)) continue;
    if (x > x0 - 1 && x < x0 + 3 && y > y0 - 1 && y < y0 + 3) continue; // outside the box
    const zid = spawnZombie(world, type, x, y);
    if (zid < 0) return null;
    if (rush) world.zombies.state[zid] = ZOMBIE_STATE.RUSH;
    return { world, id: zid, type, rush, players, closed: open < 0 && walls === 4, label: `seed ${seed} stage ${stage} box (${x0},${y0}) open ${open} ${desc.join(" ")} ${type}${rush ? " RUSH" : ""} at (${x.toFixed(2)},${y.toFixed(2)}) players ${players.map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(" ")}` };
  }
  return null;
}

describe("Story 6.13: wide-body fuzz round barricade boxes with 0.5 m diagonal gaps", () => {
  it(`every Brute/Bloater reaches a player or attacks a building within ${BOUND_S} s, never stands still > ${STILL_S} s, never inside a box`, () => {
    const bound = ticksFor(BOUND_S);
    const stillMax = ticksFor(STILL_S);
    const fails: string[] = [];
    const seen = { player: 0, building: 0, bloater: 0, brute: 0, rush: 0, chase: 0, closed: 0, trials: 0 };
    const net0 = wideStallStats.fired;
    for (let seed = 1; seen.trials < TRIALS && seed < TRIALS * 4; seed++) {
      const t = trial(seed);
      if (!t) continue;
      seen.trials++;
      const r = runTrial(t, bound);
      seen[t.type === "bloater" ? "bloater" : "brute"]++;
      seen[t.rush ? "rush" : "chase"]++;
      if (t.closed) seen.closed++;
      if (r.outcome !== "none") seen[r.outcome]++;
      if (r.outcome === "none" || r.longestStill > stillMax || r.inBox) fails.push(`${t.label}: ${r.outcome} @${r.atTick} still ${r.longestStill} inBox ${r.inBox}`);
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[wide-body fuzz] ${JSON.stringify(seen)}; stall net fired ${wideStallStats.fired - net0}×`);
    expect(fails, fails.slice(0, 8).join("\n")).toEqual([]);
    expect(seen.trials).toBe(TRIALS);
    // Liveness (brief 9): both outcomes, both types, both states, and closed boxes really happened.
    for (const k of ["player", "building", "bloater", "brute", "rush", "chase", "closed"] as const) expect(seen[k], k).toBeGreaterThan(0);
    // The M1 shape really came up: the stall net fired (seed 128's layout, `wideBodyStall.test.ts`), and
    // only where a body was stuck (it fired 3× in 1,500 trials, exactly the 3 that stalled without it).
    expect(wideStallStats.fired - net0).toBeGreaterThan(0);
  }, 300_000);
});
