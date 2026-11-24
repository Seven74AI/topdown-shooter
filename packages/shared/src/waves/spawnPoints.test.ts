import { describe, expect, it } from "vitest";
import { loadBalance, type RawBalanceFiles } from "../config/balance";
import weapons from "../config/balance/weapons.json" with { type: "json" };
import zombies from "../config/balance/zombies.json" with { type: "json" };
import wavesJson from "../config/balance/waves.json" with { type: "json" };
import player from "../config/balance/player.json" with { type: "json" };
import controls from "../config/balance/controls.json" with { type: "json" };
import economy from "../config/balance/economy.json" with { type: "json" };
import bots from "../config/balance/bots.json" with { type: "json" };
import buildings from "../config/balance/buildings.json" with { type: "json" };
import shop from "../config/balance/shop.json" with { type: "json" };
import decay from "../config/balance/decay.json" with { type: "json" };
import combat from "../config/balance/combat.json" with { type: "json" };
import gear from "../config/balance/gear.json" with { type: "json" };
import consumables from "../config/balance/consumables.json" with { type: "json" };
import boss from "../config/balance/boss.json" with { type: "json" };
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, placementError, removeBuilding, type Box } from "../buildings/buildings";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { currentDecayStage } from "../map/decayStage";
import { applyDecayStage } from "../decay/applyDecayStage";
import type { DistrictMap, MapSpawn } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { addPlayer, type PlayerStatus } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { killZombie } from "../zombies/zombiePool";
import { updateWaves } from "./waveDirector";
import { SPAWN_SIDE_NAMES, SPAWN_STATE, spawnPointStates, spawnSide } from "./spawnPick";

/**
 * Story 4.3 (FR32): spawn points by decay stage, the 6 m skip, the hold-then-farthest rule, the
 * spread over the map sides, building-blocked spawns and determinism, as the players see them.
 *
 * The sims run the real wave director and run state machine on Downtown; zombies stand still (their
 * system is off, so a zombie is checked where it appeared) and are killed on the tick after they
 * appear, so the waves end and the next ones start. Build phases are 0.5 s.
 */
const fast = (waves: Partial<typeof wavesJson> = {}) =>
  loadBalance({ weapons, zombies, waves: { ...wavesJson, buildPhaseS: 0.5, ...waves }, player, controls, economy, bots, buildings, shop, decay, combat, gear, consumables, boss: { ...boss, aliveCap: Math.min(boss.aliveCap, waves.maxAlive ?? wavesJson.maxAlive) } } as RawBalanceFiles);
const balance = fast();
const MIN_M = balance.waves.spawnMinPlayerDistanceM;
const map = DOWNTOWN_MAP;
const byName = (m: DistrictMap, name: string): MapSpawn => {
  const s = m.spawnPoints.find((p) => p.name === name);
  if (!s) throw new Error(name);
  return s;
};

/** The spawn point a zombie at (x, y) came from (nearest; a jittered zombie is ≤ 1 m from it). */
function sourceOf(m: DistrictMap, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  m.spawnPoints.forEach((s, i) => {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

interface Camper {
  at: string | readonly [number, number];
  status?: PlayerStatus;
}
interface SimOpts {
  seed?: number;
  stage?: number;
  m?: DistrictMap;
  players: readonly Camper[];
  waves: number;
  bal?: ReturnType<typeof fast>;
  setup?: (w: World) => void;
  /** Called before every tick. */
  onTick?: (w: World, waveStartTick: readonly number[]) => void;
}
interface Spawned {
  tick: number;
  wave: number;
  x: number;
  y: number;
  source: number;
  /** Distance to the nearest living (alive or downed) player when it appeared. */
  nearestM: number;
}

function sim(o: SimOpts) {
  const m = o.m ?? map;
  const world = createWorld({ balance: o.bal ?? balance, seed: o.seed ?? 1, map: m, systems: { zombies: () => {} } });
  world.debug.godMode = true;
  applyDecayStage(world, o.stage ?? 1, world.decay.variants);
  world.debug.decayStageByWave = [o.stage ?? 1]; // Story 4.5: the stage stays put across the build starts of the sim
  o.players.forEach((c, i) => {
    const [x, y] = typeof c.at === "string" ? [byName(m, c.at).x, byName(m, c.at).y] : c.at;
    const p = addPlayer(world, `p${i}`, x, y);
    if (c.status === "downed") {
      p.status = "downed";
      p.downedTicksLeft = 1e9; // stays downed for the whole sim
    }
  });
  o.setup?.(world);
  const pin = (): void => {
    // A build start returns downed players standing next to the team: campers go back to their spot.
    o.players.forEach((c, i) => {
      const p = world.players.get(`p${i}`);
      if (!p) return;
      const [x, y] = typeof c.at === "string" ? [byName(m, c.at).x, byName(m, c.at).y] : c.at;
      p.x = p.prevX = x;
      p.y = p.prevY = y;
      if (c.status === "downed") {
        p.status = "downed";
        p.downedTicksLeft = 1e9;
      }
    });
  };
  let wavesEnded = 0;
  const waveStartTick: number[] = [];
  let skipsSeen = 0;
  world.events.subscribe((e) => {
    if (e.type === "wave.ended") wavesEnded++;
    if (e.type === "wave.started") waveStartTick[e.number] = world.tick;
  });
  startBuild(world);
  pin();
  const spawned: Spawned[] = [];
  const states = new Uint8Array(m.spawnPoints.length);
  const limit = ticksFor(60 * o.waves);
  let ticks = 0;
  for (; ticks < limit && wavesEnded < o.waves; ticks++) {
    if (world.run.phase !== "wave") pin();
    o.onTick?.(world, waveStartTick);
    if (world.run.phase === "wave") {
      spawnPointStates(world, states);
      if (states.includes(SPAWN_STATE.NEAR)) skipsSeen++;
    }
    step(world, TICK_DT_S);
    const z = world.zombies;
    for (let i = z.aliveCount - 1; i >= 0; i--) {
      const id = z.aliveIds[i] as number;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      let nearestM = Infinity;
      for (const p of world.players.values()) if (p.status !== "out") nearestM = Math.min(nearestM, Math.hypot(p.x - x, p.y - y));
      spawned.push({ tick: world.tick, wave: world.waves.number, x, y, source: sourceOf(m, x, y), nearestM });
      killZombie(world, id, "p0", "pistol");
    }
  }
  return { world, spawned, wavesEnded, ticks, waveStartTick, skipsSeen };
}

const sum = (n: number, players: number) => {
  let s = 0;
  for (let w = 1; w <= n; w++) s += Math.max(1, Math.round(w * balance.waves.zombiesPerWave * (balance.waves.playerCountScale[players - 1] as number)));
  return s;
};

describe("Story 4.3 spawn points: what the players see", () => {
  it("zombies never appear within 6 m of us, at any stage, even with every player camping a spawn (one of us downed)", () => {
    let total = 0;
    let skips = 0;
    for (const [stage, camp] of [
      [1, ["street_west", "alley_1_mouth", "street_south", "gas_station_north"]],
      [2, ["manhole_west", "window_offices", "street_north", "alley_3_mouth"]],
      [3, ["manhole_east", "window_apartments", "manhole_south", "parking_lot_south"]],
    ] as const) {
      const r = sim({ stage, waves: 2, players: camp.map((at, i) => ({ at, status: i === 3 ? "downed" : "alive" })) });
      expect(r.wavesEnded, `stage ${stage}`).toBe(2);
      for (const s of r.spawned) expect(s.nearestM, `stage ${stage} tick ${s.tick} from ${map.spawnPoints[s.source]?.name}`).toBeGreaterThanOrEqual(MIN_M);
      // The camped spawns (the downed player's too) were really skipped.
      for (const name of camp) expect(r.spawned.some((s) => map.spawnPoints[s.source]?.name === name), `${name} used while camped`).toBe(false);
      total += r.spawned.length;
      skips += r.skipsSeen;
    }
    // Liveness: the waves really spawned, and the skip rule really had something to skip.
    expect(total).toBe(3 * sum(2, 4));
    expect(skips).toBeGreaterThan(100);
  });

  it("all waves still finish when we stand on spawns: 4 campers on Downtown, and every spawn camped on a 3-spawn map", () => {
    const r = sim({ waves: 3, players: [{ at: "street_west" }, { at: "street_east" }, { at: "street_north" }, { at: "street_south" }] });
    expect(r.wavesEnded).toBe(3);
    expect(r.spawned.length).toBe(sum(3, 4)); // no queued zombie lost

    // Every spawn camped: the batch waits `allNearMaxWaitS`, then comes from the farthest spawn.
    const three: DistrictMap = {
      ...PLACEHOLDER_MAP,
      version: "three",
      spawnPoints: (PLACEHOLDER_MAP.spawnPoints as MapSpawn[]).filter((_, i) => i === 0 || i === 3 || i === 9),
    };
    const off = [[1, 1], [0, 1], [1, 0]] as const; // 1.41 m, 1 m, 1 m from their spawns
    const campers = three.spawnPoints.map((s, i): Camper => ({ at: [s.x + (off[i]?.[0] ?? 0), s.y + (off[i]?.[1] ?? 0)], status: i === 1 ? "downed" : "alive" }));
    const all = sim({ m: three, waves: 3, players: campers });
    expect(all.wavesEnded).toBe(3);
    expect(all.spawned.length).toBe(sum(3, 3));
    const wait = ticksFor(balance.waves.spawnPick.allNearMaxWaitS);
    const interval = ticksFor(balance.waves.spawnIntervalS);
    for (let w = 1; w <= 3; w++) {
      const first = all.spawned.find((s) => s.wave === w);
      const delay = (first?.tick ?? 0) - (all.waveStartTick[w] as number);
      expect(delay, `wave ${w}`).toBeGreaterThanOrEqual(wait);
      expect(delay, `wave ${w}`).toBeLessThanOrEqual(wait + interval);
    }
    // The fallback is the spawn farthest from the players: the one camped from 1.41 m, not 1 m.
    expect(new Set(all.spawned.map((s) => s.source))).toEqual(new Set([0]));
  });

  it("a short camp only delays: while every spawn is camped zombies wait (none within 6 m), then come from the spawn that cleared", () => {
    const two: DistrictMap = { ...PLACEHOLDER_MAP, version: "two", spawnPoints: (PLACEHOLDER_MAP.spawnPoints as MapSpawn[]).filter((_, i) => i === 0 || i === 3) };
    const leaveS = 1; // shorter than allNearMaxWaitS: the fallback never kicks in
    expect(leaveS).toBeLessThan(balance.waves.spawnPick.allNearMaxWaitS);
    const r = sim({
      m: two,
      waves: 1,
      players: [{ at: [6, 2] }, { at: [42, 2] }],
      onTick: (w, starts) => {
        // 1 s into wave 1 the second player walks off to the map centre: spawn (42, 0.5) clears.
        const p = w.players.get("p1");
        if (p && starts[1] !== undefined && w.tick - starts[1] >= ticksFor(leaveS)) {
          p.x = 24;
          p.y = 16;
        }
      },
    });
    expect(r.wavesEnded).toBe(1);
    expect(r.spawned.length).toBe(sum(1, 2)); // nothing lost
    const first = r.spawned[0];
    expect((first?.tick ?? 0) - (r.waveStartTick[1] as number)).toBeGreaterThanOrEqual(ticksFor(leaveS)); // really waited
    for (const s of r.spawned) {
      expect(s.source).toBe(1);
      expect(s.nearestM).toBeGreaterThanOrEqual(MIN_M);
    }
  });

  it("spawns come from several sides: every map side gets a fair share at each stage (solo at the centre)", () => {
    for (const stage of [1, 2, 3]) {
      const r = sim({ stage, seed: 40 + stage, waves: 3, players: [{ at: [24, 16] }] });
      const perSide = [0, 0, 0, 0];
      for (const s of r.spawned) {
        const side = spawnSide(map, map.spawnPoints[s.source] as MapSpawn);
        perSide[side] = (perSide[side] as number) + 1;
      }
      const n = r.spawned.length;
      expect(n).toBe(sum(3, 1)); // liveness
      const shares = perSide.map((c) => c / n);
      const label = `stage ${stage}: ${shares.map((x, i) => `${SPAWN_SIDE_NAMES[i]} ${(x * 100).toFixed(0)} %`).join(", ")}`;
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[spawns] ${label} (${n} zombies)`);
      for (const x of shares) {
        expect(x, label).toBeGreaterThanOrEqual(0.15);
        expect(x, label).toBeLessThanOrEqual(0.35);
      }
      // No point is used in long runs: at most 3 zombies in a row from one spawn.
      let run = 1;
      let longest = 1;
      for (let i = 1; i < n; i++) {
        run = r.spawned[i]?.source === r.spawned[i - 1]?.source ? run + 1 : 1;
        longest = Math.max(longest, run);
      }
      expect(longest, label).toBeLessThanOrEqual(3);
    }
  });
});

describe("Story 4.3 spawn points: stages, buildings, determinism, review fixes", () => {
  it("stage 1 is today's stage; zombies come only from spawns open at the stage, and later stages really use their new spawns", () => {
    const w = createWorld({ balance, seed: 1, map });
    expect(currentDecayStage(w)).toBe(1);
    for (const stage of [1, 2, 3]) {
      const r = sim({ stage, seed: 7, waves: 3, players: [{ at: [24, 16] }, { at: [23, 16] }] });
      const used = new Set(r.spawned.map((s) => map.spawnPoints[s.source] as MapSpawn));
      for (const s of used) expect(s.minStage, `${s.name} at stage ${stage}`).toBeLessThanOrEqual(stage);
      expect([...used].some((s) => s.minStage === stage), `stage ${stage} opened nothing`).toBe(true);
      expect(used.size).toBe(map.spawnPoints.filter((s) => s.minStage <= stage).length); // every open spawn gets used
    }
    // Without the override the director runs at stage 1.
    const plain = sim({ waves: 1, players: [{ at: [24, 16] }] });
    expect(plain.spawned.every((s) => map.spawnPoints[s.source]?.minStage === 1)).toBe(true);
  });

  it("review M: you can't place a barricade on a spawn that opens later (any stage's spawn keeps its clearance)", () => {
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const w = createWorld({ balance, seed: 1, map });
    addPlayer(w, "p0", 24, 16).wallet = 1000;
    startBuild(w);
    expect(currentDecayStage(w)).toBe(1);
    let checked = 0;
    for (const sp of map.spawnPoints.filter((s) => s.minStage > 1)) {
      // A barricade centred on the later spawn point, in both rotations: refused at stage 1.
      for (const rot of [0, 1] as const) {
        const fw = rot === 0 ? stats.widthM : stats.depthM;
        const fh = rot === 0 ? stats.depthM : stats.widthM;
        const gx = Math.round((sp.x - fw / 2) / 0.5);
        const gy = Math.round((sp.y - fh / 2) / 0.5);
        footprint(stats, gx, gy, rot, box);
        expect(footprintBlocked(w, box), `${sp.name} rot ${rot}`).toBe(true);
        expect(placementError(w, "p0", { type: "wood_barricade", gx, gy, rot }), sp.name).toBe("blocked");
        checked++;
      }
    }
    expect(checked).toBe(2 * 10); // all 10 stage-2/3 spawns
    // Just outside spawnClearM (2 m) of manhole_west is still fine: the rule is clearance, not a ban on the street.
    const mw = byName(map, "manhole_west");
    footprint(stats, Math.round((mw.x + 2.5) / 0.5), Math.round((mw.y - 0.5) / 0.5), 0, box);
    expect(footprintBlocked(w, box)).toBe(false);
  });

  it("review L1: the BLOCKED guard — a spawn under a building (forced past placement) or a shut one is never used; with nothing else the batch holds, and the wave still finishes", () => {
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const base = PLACEHOLDER_MAP.spawnPoints as MapSpawn[];
    const m: DistrictMap = {
      ...PLACEHOLDER_MAP,
      version: "l1",
      spawnPoints: [{ ...(base[0] as MapSpawn) }, { ...(base[3] as MapSpawn), minStage: 2 }, { ...(base[9] as MapSpawn) }],
    };
    const blockSpawn0 = (ww: World) => {
      const sp = m.spawnPoints[0] as MapSpawn; // (6, 0.5)
      addBuildingAt(ww, { id: 99, type: "wood_barricade", ownerId: "p0", gx: Math.round((sp.x - stats.widthM / 2) / 0.5), gy: 2, rot: 0, hp: stats.hp });
    };
    // Spawn 0 under a building, spawn 1 shut (stage 2), spawn 2 camped: after the hold, only spawn 2 is used.
    const camped = sim({ m, waves: 2, players: [{ at: [m.spawnPoints[2]!.x + 1, m.spawnPoints[2]!.y] }], setup: blockSpawn0 });
    expect(camped.wavesEnded).toBe(2);
    expect(camped.spawned.length).toBe(sum(2, 1));
    expect(new Set(camped.spawned.map((s) => s.source))).toEqual(new Set([2]));
    // No spawn open or near (spawn 2 under a building too): nothing spawns, nothing is lost; once the
    // building goes, the wave finishes.
    let removedAt = -1;
    const held = sim({
      m,
      waves: 1,
      players: [{ at: [24, 16] }],
      setup: (ww) => {
        blockSpawn0(ww);
        addBuildingAt(ww, { id: 98, type: "wood_barricade", ownerId: "p0", gx: 0, gy: Math.round((m.spawnPoints[2]!.y - stats.widthM / 2) / 0.5), rot: 1, hp: stats.hp });
      },
      onTick: (ww, starts) => {
        if (removedAt < 0 && starts[1] !== undefined && ww.tick - starts[1] >= ticksFor(5)) {
          expect(ww.waves.queued).toBe(ww.waves.size); // held, not lost
          removeBuilding(ww, 98);
          removedAt = ww.tick;
        }
      },
    });
    expect(removedAt).toBeGreaterThan(0);
    expect(held.wavesEnded).toBe(1);
    expect(held.spawned.length).toBe(sum(1, 1));
    expect(held.spawned.every((s) => s.tick > removedAt && s.source === 2)).toBe(true);
  });

  it("review L2: a hold interrupted by a full pool or by nobody standing starts over (the next pick waits the full time again)", () => {
    const two: DistrictMap = { ...PLACEHOLDER_MAP, version: "two", spawnPoints: (PLACEHOLDER_MAP.spawnPoints as MapSpawn[]).filter((_, i) => i === 0 || i === 3) };
    const wait = ticksFor(balance.waves.spawnPick.allNearMaxWaitS);
    const w = createWorld({ balance: fast({ maxAlive: 2 }), seed: 3, map: two, systems: { zombies: () => {} } });
    w.debug.godMode = true;
    addPlayer(w, "p0", 6, 2);
    addPlayer(w, "p1", 42, 2); // both spawns camped
    startBuild(w);
    while (w.run.phase !== "wave") step(w, TICK_DT_S);
    const t0 = w.tick;
    while (w.zombies.aliveCount < 2 && w.tick - t0 < 4 * wait) step(w, TICK_DT_S);
    expect(w.tick - t0).toBeGreaterThanOrEqual(wait - 1); // the first hold really waited, then 2 came (pool full)
    // Full pool for longer than the wait.
    for (let i = 0; i < 3 * wait; i++) step(w, TICK_DT_S);
    expect(w.zombies.aliveCount).toBe(2);
    expect(w.waves.spawnHeldSinceTick).toBe(-1);
    for (let i = w.zombies.aliveCount - 1; i >= 0; i--) killZombie(w, w.zombies.aliveIds[i] as number, "p0", "pistol");
    const t1 = w.tick;
    while (w.zombies.aliveCount === 0 && w.tick - t1 < 4 * wait) step(w, TICK_DT_S);
    expect(w.zombies.aliveCount).toBeGreaterThan(0); // liveness
    expect(w.tick - t1).toBeGreaterThanOrEqual(wait - 1); // waited the full time again
    // Nobody standing (a downed team is a wipe in a real run, so the director is called directly).
    for (let i = w.zombies.aliveCount - 1; i >= 0; i--) killZombie(w, w.zombies.aliveIds[i] as number, "p0", "pistol");
    step(w, TICK_DT_S);
    expect(w.waves.spawnHeldSinceTick).toBeGreaterThanOrEqual(0); // holding again
    for (const p of w.players.values()) p.status = "downed";
    updateWaves(w);
    expect(w.waves.spawnHeldSinceTick).toBe(-1);
  });

  it("review L4: the pick memory (recentSpawns) is part of snapshotWorld and its digest", () => {
    const a = createWorld({ balance, seed: 5, map });
    const b = createWorld({ balance, seed: 5, map });
    expect(worldDigest(b)).toBe(worldDigest(a));
    b.waves.recentSpawns[0] = 7;
    expect(snapshotWorld(b).waves.recentSpawns[0]).toBe(7);
    expect(worldDigest(b)).not.toBe(worldDigest(a));
    // After a real wave the memory holds picks, and two runs of one seed agree on it.
    const r1 = sim({ seed: 9, waves: 1, players: [{ at: [24, 16] }] });
    const r2 = sim({ seed: 9, waves: 1, players: [{ at: [24, 16] }] });
    expect(r1.world.waves.recentSpawnCount).toBeGreaterThan(0);
    expect(snapshotWorld(r1.world).waves.recentSpawns).toEqual(snapshotWorld(r2.world).waves.recentSpawns);
  });

  it("dev view states: closed (stage), blocked (building), near (a living player) and open", () => {
    const w = createWorld({ balance, seed: 1, map });
    addPlayer(w, "p0", byName(map, "street_west").x + 2, 16);
    const down = addPlayer(w, "p1", byName(map, "street_east").x - 2, 16);
    down.status = "downed";
    const out = addPlayer(w, "p2", byName(map, "street_north").x, 2);
    out.status = "out"; // out players are off the map: they don't close a spawn
    const s = spawnPointStates(w, new Uint8Array(map.spawnPoints.length));
    const at = (name: string) => s[map.spawnPoints.indexOf(byName(map, name))];
    expect(at("street_west")).toBe(SPAWN_STATE.NEAR);
    expect(at("street_east")).toBe(SPAWN_STATE.NEAR); // downed players count
    expect(at("street_north")).toBe(SPAWN_STATE.OPEN);
    expect(at("manhole_west")).toBe(SPAWN_STATE.CLOSED);
    expect(at("window_gas_kiosk")).toBe(SPAWN_STATE.CLOSED);
  });

  it("same seed, same spawns (positions and digest); another seed, other spawns", () => {
    const run = (seed: number) => sim({ seed, stage: 3, waves: 2, players: [{ at: [24, 16] }, { at: "manhole_west" }] });
    const a = run(11);
    const b = run(11);
    const c = run(12);
    expect(a.spawned.length).toBe(sum(2, 2)); // liveness
    expect(b.spawned).toEqual(a.spawned);
    expect(worldDigest(b.world)).toBe(worldDigest(a.world));
    expect(c.spawned.map((s) => s.source)).not.toEqual(a.spawned.map((s) => s.source));
  });
});
