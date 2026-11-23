import { beforeEach, describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { applyDecayStage } from "../decay/applyDecayStage";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer, removePlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, type Building } from "../buildings/buildings";
import { BUILD_GRID_M } from "../config/constants";
import { activeSlot, setLoadout } from "./loadout";
import { createLobTarget, grenadeCounters, lobAimLength, lobFlightTicks, lobTarget } from "./grenades";
import { explosionCounters } from "./explosion";
import type { LauncherStats } from "../config/balanceSchema";

/**
 * Story 5.5: lobbed rounds (AC 11; FR-A, FR-B, FR-E). One mechanic per test (zombies stand still,
 * no wave director). Liveness: every test that expects a burst asserts ≥ 1 explosion.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const GL = balance.weapons.grenade_launcher as LauncherStats;
const R = balance.player.radiusM;
const OFFSET = R + MUZZLE_OFFSET_M;
const BACKOFF = balance.combat.explosion.faceBackoffM;

function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: "grenade-test", cover: [{ name: `test_${kind}`, kind, minStage: 1, ...box }] };
}

function setup(opts: { map?: DistrictMap; b?: typeof balance; players?: number } = {}) {
  const b = opts.b ?? balance;
  const world = createWorld({ balance: b, seed: 7, systems: STILL, ...(opts.map ? { map: opts.map } : {}) });
  if (opts.map) applyDecayStage(world, 1, 0);
  const n = opts.players ?? 1;
  for (let i = 0; i < n; i++) {
    const p = addPlayer(world, `p${i}`, 10, 10 + i * 6);
    setLoadout(b, p.loadout, ["grenade_launcher", "pistol"]);
  }
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  startWave(world);
  return { world, events };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
/** Aim along +x with the lob length for `distM` from the muzzle. */
const lobRight = (distM: number, extra: Partial<PlayerInput> = {}): PlayerInput => ({ ...NEUTRAL_INPUT, aimX: lobAimLength(GL, distM), aimY: 0, fire: true, isMouse: true, ...extra });
const of = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

beforeEach(() => {
  grenadeCounters.launched = grenadeCounters.landed = grenadeCounters.coverStops = grenadeCounters.poolFull = 0;
  explosionCounters.happened = 0;
});

describe("Grenade Launcher: where the round lands (FR-A)", () => {
  it("lands at the aim point, `distM` from the muzzle along the raw aim", () => {
    const { world, events } = setup();
    setInput(world, "p0", lobRight(8));
    run(world, 1);
    const l = of(events, "grenade.launched")[0];
    expect(l).toBeDefined();
    expect(l?.x).toBeCloseTo(10 + OFFSET, 9);
    expect(l?.tx).toBeCloseTo(10 + OFFSET + 8, 9);
    expect(l?.ty).toBeCloseTo(10, 9);
    setInput(world, "p0", { ...NEUTRAL_INPUT });
    run(world, 20);
    const ex = of(events, "explosion.happened");
    expect(ex).toHaveLength(1); // liveness
    expect(ex[0]?.x).toBeCloseTo(10 + OFFSET + 8, 9);
    expect(ex[0]?.grenadeId).toBe(l?.grenadeId);
  });

  it("is clamped at 12 m and at minLobM 3 m (a cursor at your feet lands 3 m out)", () => {
    const t = createLobTarget();
    const world = createWorld({ balance, seed: 1 });
    expect(lobTarget(world, GL, 10, 10, R, 1, 0, 1, t).x).toBeCloseTo(10 + OFFSET + GL.lobRangeM, 9);
    expect(lobTarget(world, GL, 10, 10, R, 1, 0, 5, t).x).toBeCloseTo(10 + OFFSET + GL.lobRangeM, 9); // never past 12 m
    expect(lobTarget(world, GL, 10, 10, R, 0, 1, 0, t).y).toBeCloseTo(10 + OFFSET + GL.minLobM, 9);
    expect(lobTarget(world, GL, 10, 10, R, 0, 1, 0.05, t).distM).toBeCloseTo(GL.minLobM, 9);
    expect(lobAimLength(GL, 0)).toBeCloseTo(GL.minLobM / GL.lobRangeM, 12);
    expect(lobAimLength(GL, 99)).toBe(1);
    expect(lobAimLength(GL, 6)).toBeCloseTo(0.5, 12);
  });

  it("flight = max(minFlightS, distance / 20 m/s) in ticks: 12 m 12 ticks, 3 m 5 ticks", () => {
    expect(lobFlightTicks(GL, 12)).toBe(12);
    expect(lobFlightTicks(GL, 3)).toBe(5);
    expect(lobFlightTicks(GL, 0)).toBe(5);
    const { world, events } = setup();
    setInput(world, "p0", lobRight(12));
    run(world, 1);
    const launchTick = world.tick - 1;
    const l = of(events, "grenade.launched")[0];
    expect(l?.landTick).toBe(launchTick + 12);
    expect(l?.flightTicks).toBe(12);
    setInput(world, "p0", { ...NEUTRAL_INPUT });
    run(world, 11);
    expect(of(events, "explosion.happened")).toHaveLength(0);
    run(world, 1);
    expect(of(events, "explosion.happened")).toHaveLength(1);
  });

  it("the round flies over zombies: one on the track is untouched until the burst", () => {
    const { world, events } = setup();
    const z = spawnZombie(world, "walker", 14, 10);
    world.zombies.hp[z] = 1000;
    setInput(world, "p0", lobRight(10));
    run(world, 1);
    setInput(world, "p0", { ...NEUTRAL_INPUT });
    run(world, 9);
    expect(world.zombies.hp[z]).toBe(1000);
    run(world, 5);
    expect(of(events, "explosion.happened")).toHaveLength(1);
    expect(world.zombies.hp[z]).toBe(1000); // 10 m out: far outside the 2 m blast
  });
});

describe("Grenade Launcher: cover on the track (FR-B)", () => {
  for (const kind of ["car", "bus"] as const) {
    it(`a ${kind} on the track stops the round at its face (pulled back ${BACKOFF} m)`, () => {
      const { world, events } = setup({ map: mapWith(kind, { minX: 16, minY: 8, maxX: 18, maxY: 12 }) });
      setInput(world, "p0", lobRight(10));
      run(world, 1);
      const l = of(events, "grenade.launched")[0];
      expect(l?.tx).toBeCloseTo(16 - BACKOFF, 9);
      expect(grenadeCounters.coverStops).toBe(1);
      setInput(world, "p0", { ...NEUTRAL_INPUT });
      run(world, 10);
      expect(of(events, "explosion.happened")[0]?.x).toBeCloseTo(16 - BACKOFF, 9);
    });
  }

  it("a map box stops it too", () => {
    const map: DistrictMap = { ...PLACEHOLDER_MAP, name: "grenade-solid", solids: [{ name: "wall", minX: 16, minY: 8, maxX: 18, maxY: 12 }] };
    const world = createWorld({ balance, seed: 1, map });
    const t = lobTarget(world, GL, 10, 10, R, 1, 0, 1, createLobTarget());
    expect(t.blocked).toBe(true);
    expect(t.x).toBeCloseTo(16 - BACKOFF, 9);
  });

  for (const kind of ["barrier", "sandbags"] as const) {
    it(`${kind} don't stop it (they only stop bodies)`, () => {
      const { world, events } = setup({ map: mapWith(kind, { minX: 16, minY: 8, maxX: 18, maxY: 12 }) });
      setInput(world, "p0", lobRight(10));
      run(world, 1);
      expect(of(events, "grenade.launched")[0]?.tx).toBeCloseTo(10 + OFFSET + 10, 9);
      expect(grenadeCounters.coverStops).toBe(0);
    });
  }

  it("a player barricade doesn't stop it", () => {
    const { world, events } = setup();
    addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 15 / BUILD_GRID_M, gy: 9 / BUILD_GRID_M, rot: 1, hp: 100 }) as Building;
    setInput(world, "p0", lobRight(10));
    run(world, 1);
    expect(of(events, "grenade.launched")[0]?.tx).toBeCloseTo(10 + OFFSET + 10, 9);
  });

  it("a car pressed against the muzzle stops it right in front of you (never behind your centre)", () => {
    const world = createWorld({ balance, seed: 1, map: mapWith("car", { minX: 10.3, minY: 8, maxX: 12, maxY: 12 }) });
    applyDecayStage(world, 1, 0);
    const t = lobTarget(world, GL, 10, 10, R, 1, 0, 1, createLobTarget());
    expect(t.blocked).toBe(true);
    expect(t.x).toBeCloseTo(10.3 - BACKOFF, 9);
    expect(t.distM).toBe(0);
    const inside = lobTarget(world, GL, 10.31, 10, R, 1, 0, 1, createLobTarget()); // a centre in the box: bursts on the centre
    expect(inside.x).toBeCloseTo(10.31, 9);
  });
});

describe("Grenade Launcher: magazine, rate, owner and pool", () => {
  it("4 rounds, then a 3.0 s reload (gun rules)", () => {
    const { world, events } = setup();
    setInput(world, "p0", lobRight(6));
    run(world, 4 * 25); // 4 shots at 0, 25, 50, 75
    expect(of(events, "weapon.fired")).toHaveLength(4);
    expect(of(events, "weapon.reload_started")).toHaveLength(1);
    const reloadFrom = events.indexOf(of(events, "weapon.reload_started")[0] as SimEvent);
    expect(reloadFrom).toBeGreaterThan(0);
    run(world, 60 - 25 + 1); // the reload counts down from tick 76 and ends on tick 135 (60 ticks after the 4th shot)
    expect(of(events, "weapon.reloaded")).toHaveLength(1);
    expect(activeSlot(world.players.get("p0")?.loadout ?? (null as never)).ammo).toBe(4);
  });

  it("fires at exactly 0.8/s: 25 shots in 601 ticks, not in 600", () => {
    const { world, events } = setup();
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    activeSlot(p.loadout).ammo = 1000;
    setInput(world, "p0", lobRight(5));
    run(world, 600);
    expect(of(events, "weapon.fired")).toHaveLength(24);
    run(world, 1);
    expect(of(events, "weapon.fired")).toHaveLength(25);
    expect(of(events, "grenade.launched")).toHaveLength(25);
  });

  it("a round whose owner left keeps flying and bursts with no credit (teammates take the 50 % share)", () => {
    const { world, events } = setup({ players: 2 });
    const p1 = world.players.get("p1");
    if (!p1) throw new Error("p1");
    p1.x = p1.prevX = 10 + OFFSET + 8;
    p1.y = p1.prevY = 11;
    const z = spawnZombie(world, "walker", 10 + OFFSET + 8, 9.5);
    setInput(world, "p0", lobRight(8));
    run(world, 1);
    removePlayer(world, "p0");
    const hp = p1.hp;
    run(world, 12);
    const ex = of(events, "explosion.happened");
    expect(ex).toHaveLength(1);
    expect(ex[0]?.sourcePlayerId).toBeNull();
    expect(hp - p1.hp).toBe(Math.round((GL.damage * balance.combat.friendlyFire.pct) / 100));
    const k = of(events, "zombie.killed").find((e) => e.zombieId === z);
    expect(k?.killerId).toBeNull();
  });

  it("a full pool: no round, no ammo spent, no cooldown (documented choice)", () => {
    const b = loadBalance(withOverrides(bundledBalanceFiles(), [["combat", "explosion.maxLiveRounds", 1]]));
    const { world, events } = setup({ b, players: 2 });
    setInput(world, "p0", lobRight(12));
    setInput(world, "p1", lobRight(12));
    run(world, 1);
    expect(of(events, "grenade.launched")).toHaveLength(1);
    expect(grenadeCounters.poolFull).toBe(1);
    const ammo = (id: string) => activeSlot(world.players.get(id)?.loadout ?? (null as never)).ammo;
    expect([ammo("p0"), ammo("p1")].sort()).toEqual([3, 4]);
    run(world, 13); // the first round bursts on tick 12 (after the weapons); the second player fires on tick 13
    expect(of(events, "grenade.launched").length).toBeGreaterThanOrEqual(2);
    expect(explosionCounters.happened).toBeGreaterThanOrEqual(1);
  });

  it("a build start clears rounds in flight (no ghost blast in the build phase)", () => {
    const { world, events } = setup();
    setInput(world, "p0", lobRight(12));
    run(world, 1);
    expect(world.grenades.count).toBe(1);
    world.zombies.aliveCount = 0;
    startBuild(world);
    expect(world.grenades.count).toBe(0);
    run(world, 20);
    expect(of(events, "explosion.happened")).toHaveLength(0);
  });

  it("same seed + input log → same digest (and a round really flew)", () => {
    const go = (): number => {
      const { world, events } = setup({ players: 2 });
      for (let i = 0; i < 6; i++) spawnZombie(world, "walker", 18 + i, 10 + (i % 3));
      for (let t = 0; t < 120; t++) {
        setInput(world, "p0", lobRight(4 + (t % 9), { seq: t + 1, aimY: 0.05 * Math.sin(t) }));
        setInput(world, "p1", lobRight(12 - (t % 7), { seq: t + 1 }));
        step(world, TICK_DT_S);
      }
      expect(of(events, "explosion.happened").length).toBeGreaterThanOrEqual(2);
      return worldDigest(world);
    };
    expect(go()).toBe(go());
  });
});
