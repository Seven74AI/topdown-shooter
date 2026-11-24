import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox, segmentHitsBuildings } from "../buildings/collision";
import { changeDecayStage } from "../decay/decaySystem";
import { masksForStage } from "../decay/masks.testkit";
import { createRng } from "../core/rng";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { isRubble } from "../map/obstacles";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { jitteredSpawn } from "../waves/waveDirector";
import { isZombieAlive, killZombie, spawnZombie } from "./zombiePool";
import { isWindupState, type ZombieTypeId } from "./zombieTypes";
import type { SimEvent } from "../core/simEvents";

/**
 * Story 6.2 / 6.4 (brief line 7): the Ruins fuzz. Random gameplay masks (any collapsed alley × cars ×
 * fires) × random barricades and floor buildings (some on the coming rubble) × stage 4 or 5 × 3,000
 * ticks with Walkers, Runners and Brutes from every open spawn, the two breaches always included.
 * Asserts: no body inside a box (rubble included), no stall (every zombie reaches a player), zombies
 * from BOTH breaches reach a player, the walls change only at the build start (obstacle version),
 * buildings under the new rubble are destroyed and refunded once. Liveness counters are asserted.
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const MASKS = masksForStage(DT, 4);
const LAYOUTS = 12;
const TICKS = 3000;
const REACH_M = 3;
const TYPES: readonly ZombieTypeId[] = ["walker", "runner", "brute"];
const BUILD_TYPES = ["wood_barricade", "metal_barricade", "spike_trap", "mine"];

interface LayoutResult {
  violation: string | null;
  spawned: number;
  reached: number;
  missing: string[];
  breachReached: [number, number];
  destroyed: number;
  refunds: number;
  stage: number;
  versionChanged: boolean;
}

function layout(seed: number): LayoutResult {
  const rng = createRng(seed);
  const w: World = createWorld({ balance, seed, map: DT, systems: { waves: () => {} } });
  w.debug.godMode = true;
  const stage = 4 + (seed % 2);
  w.debug.decayStageByWave = Array(10).fill(3);
  w.decay.variants = MASKS[(seed * 11) % MASKS.length] as number;
  const at = { x: 0, y: 0 };
  const players = rng.int(1, 3);
  for (let s = 0; s < players; s++) addPlayer(w, `p${s}`, teamSpawnPoint(w, s, at).x, at.y).wallet = 5000;
  startBuild(w); // stage 3 (the dev table)
  // Buildings: some on the coming rubble (the alley of this mask, the piles), the rest anywhere legal-ish.
  const rubble = DT.decay.filter((m) => m.action === "block" && isRubble(m) && (m.variant < 0 || ((w.decay.variants >>> m.variant) & 1) === 1)) as MapBox[];
  let id = 1;
  for (let k = 0; k < 10; k++) {
    const type = BUILD_TYPES[rng.int(0, BUILD_TYPES.length - 1)] as string;
    const target = k < 4 ? (rubble[rng.int(0, rubble.length - 1)] as MapBox) : null;
    const x = target ? target.minX + rng.range(0, target.maxX - target.minX) : rng.range(2, DT.widthM - 2);
    const y = target ? target.minY + rng.range(0, target.maxY - target.minY) : rng.range(2, DT.heightM - 2);
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    addBuildingAt(w, { id: id++, type, ownerId: "p0", gx: Math.floor(x / BUILD_GRID_M), gy: Math.floor(y / BUILD_GRID_M), rot: rng.int(0, 1) as BuildingRotation, hp: 100 });
  }
  const events: SimEvent[] = [];
  const off = w.events.subscribe((e) => events.push(e));
  w.debug.decayStageByWave = Array(10).fill(stage);
  changeDecayStage(w, stage);
  startWave(w);
  step(w, TICK_DT_S);
  const destroyed = events.filter((e) => e.type === "building.destroyed").length;
  const refunds = events.filter((e) => e.type === "money.earned" && e.reason === "refund").length;
  off();
  const version = w.obstacles.version;
  // Zombies from every spawn open at this stage (buried ones are closed: skipped), the breaches twice.
  const spawned: { id: number; gen: number; breach: number; at: string }[] = [];
  const out = { x: 0, y: 0 };
  for (const sp of DT.spawnPoints) {
    if (sp.minStage > stage) continue;
    if (w.obstacles.solids.some((b) => sp.x >= b.minX && sp.x <= b.maxX && sp.y >= b.minY && sp.y <= b.maxY)) continue; // buried
    const breach = sp.name === "breach_apartments" ? 0 : sp.name === "breach_offices" ? 1 : -1;
    const n = breach >= 0 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const type = TYPES[(k + spawned.length) % TYPES.length] as ZombieTypeId;
      jitteredSpawn(w, sp, rng.range(-1, 1), balance.zombies.types[type]?.radiusM ?? 0.35, out);
      const zid = spawnZombie(w, type, out.x, out.y);
      if (zid >= 0) spawned.push({ id: zid, gen: w.zombies.generation[zid] as number, breach, at: sp.name });
    }
  }
  let violation: string | null = null;
  const reached = new Set<number>();
  const breachReached: [number, number] = [0, 0];
  for (let t = 0; t < TICKS && reached.size < spawned.length; t++) {
    step(w, TICK_DT_S);
    const z = w.zombies;
    for (const s of spawned) {
      if (reached.has(s.id) || !isZombieAlive(z, s.id)) continue;
      const zx = z.x[s.id] as number;
      const zy = z.y[s.id] as number;
      const r = balance.zombies.types[["walker", "runner", "crawler", "spitter", "brute", "bloater"][z.type[s.id] as number] ?? "walker"]?.radiusM ?? 0.35;
      for (const b of w.obstacles.solids) {
        if (circleOverlapsBox(zx, zy, Math.max(0.05, r - 0.06), b.minX, b.minY, b.maxX, b.maxY)) violation ??= `seed ${seed} t ${t}: zombie ${s.id} (${s.at}) inside ${b.name} at (${zx.toFixed(2)}, ${zy.toFixed(2)})`;
      }
      let hit = isWindupState(z.state[s.id] as number);
      for (const p of w.players.values()) if (Math.hypot(p.x - zx, p.y - zy) <= REACH_M && !segmentHitsBuildings(w, zx, zy, p.x, p.y, 0)) hit = true;
      if (hit) {
        reached.add(s.id);
        if (s.breach === 0) breachReached[0]++;
        else if (s.breach === 1) breachReached[1]++;
        killZombie(w, s.id, null, "cheat");
      }
    }
    for (const p of w.players.values()) {
      for (const b of w.obstacles.solids) if (circleOverlapsBox(p.x, p.y, p.radiusM - 0.06, b.minX, b.minY, b.maxX, b.maxY)) violation ??= `seed ${seed} t ${t}: ${p.id} inside ${b.name}`;
    }
  }
  const missing = spawned.filter((s) => !reached.has(s.id) && isZombieAlive(w.zombies, s.id)).map((s) => `${s.at}@(${(w.zombies.x[s.id] as number).toFixed(1)},${(w.zombies.y[s.id] as number).toFixed(1)})`);
  return { violation, spawned: spawned.length, reached: reached.size, missing, breachReached, destroyed, refunds, stage, versionChanged: w.obstacles.version !== version };
}

describe("Story 6.2 / 6.4 Ruins fuzz: random masks × buildings × stages 4–5 × 3,000 ticks (brief line 7)", () => {
  it(`${LAYOUTS} layouts: no body inside a box, no stall, both breaches reach a player, rubble destroys + refunds, walls only at the build start`, () => {
    const failures: string[] = [];
    const total = { spawned: 0, reached: 0, destroyed: 0, refunds: 0, breach: [0, 0] as [number, number], stages: new Set<number>(), alleys: new Set<number>() };
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const r = layout(6200 + seed);
      if (r.violation) failures.push(r.violation);
      if (r.missing.length > 0) failures.push(`seed ${6200 + seed}: ${r.missing.length} zombies never reached a player: ${r.missing.join(" ")}`);
      if (r.versionChanged) failures.push(`seed ${6200 + seed}: the walls changed mid-wave`);
      if (r.refunds !== r.destroyed) failures.push(`seed ${6200 + seed}: ${r.destroyed} destroyed, ${r.refunds} refunds`);
      total.spawned += r.spawned;
      total.reached += r.reached;
      total.destroyed += r.destroyed;
      total.refunds += r.refunds;
      total.breach[0] += r.breachReached[0];
      total.breach[1] += r.breachReached[1];
      total.stages.add(r.stage);
      const m = MASKS[((6200 + seed) * 11) % MASKS.length] as number;
      total.alleys.add([9, 10, 11].findIndex((b) => (m >>> b) & 1));
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[fuzz] ruins: ${LAYOUTS} layouts, ${total.spawned} zombies, ${total.reached} reached, breaches ${total.breach.join("/")}, ${total.destroyed} buildings destroyed by rubble (${total.refunds} refunds), stages ${[...total.stages].join("/")}, alleys ${[...total.alleys].sort().join("/")}`);
    expect(failures).toEqual([]);
    // Liveness (brief line 9).
    expect(total.spawned).toBeGreaterThan(LAYOUTS * 15);
    // Every zombie alive reached a player (the missing list is empty); the rest died on mines, spikes or fire.
    expect(total.reached).toBeGreaterThan(total.spawned * 0.9);
    expect(total.breach[0]).toBeGreaterThanOrEqual(LAYOUTS);
    expect(total.breach[1]).toBeGreaterThanOrEqual(LAYOUTS);
    expect(total.destroyed).toBeGreaterThan(0);
    expect([...total.stages].sort()).toEqual([4, 5]);
    expect(total.alleys.size).toBe(3);
  }, 240_000);
});
