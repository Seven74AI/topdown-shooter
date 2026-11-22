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
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box } from "../buildings/buildings";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { decayStage } from "../decay/decayStage";
import type { DistrictMap, MapSpawn } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { addPlayer, type PlayerStatus } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { killZombie } from "../zombies/zombiePool";
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
  loadBalance({ weapons, zombies, waves: { ...wavesJson, buildPhaseS: 0.5, ...waves }, player, controls, economy, bots, buildings, shop } as RawBalanceFiles);
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
  world.debug.decayStage = o.stage ?? null;
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

describe("Story 4.3 spawn points: stages, buildings, determinism", () => {
  it("stage 1 is today's stage; zombies come only from spawns open at the stage, and later stages really use their new spawns", () => {
    const w = createWorld({ balance, seed: 1, map });
    expect(decayStage(w)).toBe(1);
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

  it("brief line 7: placement clearance checks the spawns open at the coming stage; a building on a later spawn closes it", () => {
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const mw = byName(map, "manhole_west"); // stage 2, at (12, 18)
    const gx = Math.round((mw.x - 1) / 0.5);
    const gy = Math.round((mw.y + 0.5) / 0.5);
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    footprint(stats, gx, gy, 0, box);
    const w = createWorld({ balance, seed: 1, map });
    expect(footprintBlocked(w, box)).toBe(false); // stage 1: the manhole is still shut, building allowed
    w.debug.decayStage = 2;
    expect(footprintBlocked(w, box)).toBe(true); // stage 2: refused (spawnClearM)
    // A barricade built there at stage 1 keeps the manhole closed at stage 2 (the dev view says so).
    const r = sim({
      stage: 2,
      waves: 2,
      players: [{ at: [24, 16] }],
      setup: (ww) => addBuildingAt(ww, { id: 1, type: "wood_barricade", ownerId: "p0", gx, gy, rot: 0, hp: stats.hp }),
    });
    const states = spawnPointStates(r.world, new Uint8Array(map.spawnPoints.length));
    expect(states[map.spawnPoints.indexOf(mw)]).toBe(SPAWN_STATE.BLOCKED);
    expect(r.spawned.length).toBe(sum(2, 1));
    expect(r.spawned.some((s) => s.source === map.spawnPoints.indexOf(mw))).toBe(false);
    expect(r.spawned.some((s) => map.spawnPoints[s.source]?.name === "manhole_north")).toBe(true); // the other stage-2 manhole works
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
