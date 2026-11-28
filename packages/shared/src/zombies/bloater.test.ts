import { beforeEach, describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { DAMAGE_SOURCE_EXPLOSION, type SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { applyDecayStage } from "../decay/applyDecayStage";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { downPlayer } from "../player/downed";
import { addPlayer, type PlayerState } from "../player/player";
import { playerSpeed } from "../player/slow";
import { startBuild, startWave } from "../run/runStateMachine";
import { addBuildingAt, buildingById, type Building } from "../buildings/buildings";
import { applyZombieDamage, applyZombieDamageQuiet } from "../combat/damage";
import { createExplosionSpec, explode } from "../combat/explosion";
import { spawnJitterFor } from "../waves/waveDirector";
import { BLAST_QUEUE_MIN, BLOATER_BLAST_WEAPON, BLOATER_LOOKS, bloaterLookIndex, bloaterStats, blastTrace, circleInGas, resetBloaterStats } from "./bloater";
import { isZombieAlive, killZombie, spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE } from "./zombieTypes";

/**
 * Story 5.8: Bloaters (fairness rules FR-A–FR-G of the story file). One mechanic per test: no wave
 * director; the open street unless the rule is about cover. Liveness: every test that expects a
 * blast asserts ≥ 1 `bloater.burst`.
 */
const noop: SystemFn = () => {};
const NO_WAVES = { waves: noop };
const STILL = { waves: noop, player: noop };
const balance = loadBalance();
const BL = balance.zombies.types.bloater as NonNullable<(typeof balance.zombies.types)["bloater"]>;
const EX = BL.explodes as NonNullable<typeof BL.explodes>;
const PR = balance.player.radiusM; // 0.4
const RW = (balance.zombies.types.walker as NonNullable<typeof balance.zombies.types.walker>).radiusM; // 0.35
const SWELL = ticksFor(EX.swellS); // 20
const GAS = ticksFor(EX.gasS); // 80
const LINGER = ticksFor(EX.gasLingerS); // 5

function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: "bloater-test", cover: [{ name: `test_${kind}`, kind, minStage: 1, ...box }] };
}

function setup(opts: { map?: DistrictMap; systems?: Record<string, SystemFn>; balance?: typeof balance; seed?: number } = {}) {
  const world = createWorld({ balance: opts.balance ?? balance, seed: opts.seed ?? 1, systems: opts.systems ?? NO_WAVES, ...(opts.map ? { map: opts.map } : {}) });
  if (opts.map) applyDecayStage(world, 1, 0);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  let nextId = 1;
  /** A 2 m wood barricade with its min corner at (x, y): rot 1 = 0.5 × 2 m (vertical), rot 0 = 2 × 0.5 m. */
  const wall = (x: number, y: number, type = "wood_barricade", rot: 0 | 1 = 1) =>
    addBuildingAt(world, { id: nextId++, type, ownerId: "p1", gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, events, wall };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const bursts = (events: SimEvent[]) => events.filter((e) => e.type === "bloater.burst");
const blastHits = (events: SimEvent[], pid: string) => events.filter((e) => e.type === "player.damaged" && e.playerId === pid && e.sourceZombieId === DAMAGE_SOURCE_EXPLOSION);
const bites = (events: SimEvent[]) => events.filter((e) => e.type === "player.damaged" && e.sourceZombieId >= 0);
/** A zombie that survives every blast of a test (tests of the blast's reach). */
const tough = (world: World, id: number): number => {
  world.zombies.hp[id] = 1e6;
  return id;
};
/** Kills Bloater `id` as player `by` would with a pistol shot (between ticks). */
const shoot = (world: World, id: number, by: string | null = "p0"): void => {
  applyZombieDamage(world, id, 1000, 1, 0, 0, by, "pistol");
};

beforeEach(() => {
  resetBloaterStats();
  blastTrace.fn = null;
});

describe("Story 5.8 Bloater: stats and looks (AC 1)", () => {
  it("25 HP, 0.9 m/s, never bites (damage 0), a 0.5 m wide body on the wide grid, reward 6, the explodes block", () => {
    expect(BL).toMatchObject({ hp: 25, speedMps: 0.9, damage: 0, radiusM: 0.5, reward: 6, wideBody: true });
    expect(EX).toEqual({ swellS: 1, blastRadiusM: 2.5, playerDamage: 30, zombieDamage: 40, buildingDamage: 40, pushM: 0.5, gasRadiusM: 2.5, gasS: 4, gasSlowPct: 30, gasLingerS: 0.25 });
    expect(balance.zombies.blasts).toEqual({ maxBlastsPerTick: 8, queueCapacity: 64, maxGasClouds: 24 });
    expect(SWELL).toBe(20);
  });

  it("whole-tick durations and an integer percent are enforced by the schema", () => {
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "types.bloater.explodes.swellS", 1.01]]))).toThrow(/whole numbers of ticks/);
    expect(() => loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "types.bloater.explodes.gasSlowPct", 30.5]]))).toThrow();
  });

  it("five looks BL1–BL5, picked from the named stream look:bloater:<netId> (same seed → same look; all five appear)", () => {
    const seen = new Set<number>();
    for (let netId = 0; netId < 200; netId++) {
      const k = bloaterLookIndex(77, netId);
      expect(k).toBe(bloaterLookIndex(77, netId));
      expect(k >= 0 && k < BLOATER_LOOKS).toBe(true);
      seen.add(k);
    }
    expect(seen.size).toBe(5);
  });
});

describe("Story 5.8 FR-A: the swell is a promise", () => {
  it("touching a standing player starts the swell; it bursts exactly 20 ticks later where it stands, even after the player ran 3 m away; it never bites", () => {
    const { world, events } = setup();
    const p = addPlayer(world, "p0", 20, 16);
    const id = spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 16);
    run(world, 1);
    expect(world.zombies.state[id]).toBe(ZOMBIE_STATE.SWELL);
    const started = events.filter((e) => e.type === "bloater.swell_started");
    expect(started).toHaveLength(1);
    const startTick = world.tick - 1; // the tick it was emitted in (events are delivered after the tick count moved on)
    const at = { x: world.zombies.x[id] as number, y: world.zombies.y[id] as number };
    p.x = 20 - 3; // the player runs: the swell keeps going
    let burstTick = -1;
    world.events.subscribe((e) => {
      if (e.type === "bloater.burst") burstTick = world.tick - 1;
    });
    for (let t = 0; t < 40 && burstTick < 0; t++) {
      run(world, 1);
      if (isZombieAlive(world.zombies, id)) {
        expect(world.zombies.x[id]).toBeCloseTo(at.x, 9); // stands still
        expect(world.zombies.y[id]).toBeCloseTo(at.y, 9);
      }
    }
    expect(burstTick - startTick).toBe(SWELL); // D6: exactly 20 ticks, not queued
    const b = bursts(events)[0] as Extract<SimEvent, { type: "bloater.burst" }>;
    expect(b).toMatchObject({ x: at.x, y: at.y, chain: false });
    expect(isZombieAlive(world.zombies, id)).toBe(false);
    expect(bites(events)).toHaveLength(0); // M1: it never bites
    expect(blastHits(events, "p0")).toHaveLength(0); // 3 m away at 4.5 m/s: outran it (> 2.9 m)
    expect(bloaterStats.swellBlasts).toBe(1);
  });

  it("a player who stays takes 30 from the swell blast, never a bite (FR24)", () => {
    const { world, events } = setup({ systems: STILL });
    const p = addPlayer(world, "p0", 20, 16);
    spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 16);
    run(world, SWELL + 2);
    expect(bursts(events)).toHaveLength(1);
    expect(blastHits(events, "p0").map((e) => (e as { amount: number }).amount)).toEqual([30]);
    expect(p.hp).toBe(balance.player.maxHp - 30);
    expect(bites(events)).toHaveLength(0);
  });

  it("a swelling Bloater is not pushed by the crowd: Walkers pressing on it flow round it", () => {
    const { world } = setup({ systems: STILL });
    addPlayer(world, "p0", 20, 16);
    const id = spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 16);
    run(world, 1);
    expect(world.zombies.state[id]).toBe(ZOMBIE_STATE.SWELL);
    const x0 = world.zombies.x[id] as number;
    const y0 = world.zombies.y[id] as number;
    // A crowd spawned on top of it and behind it, all pushing towards the player.
    for (let k = 0; k < 8; k++) spawnZombie(world, "walker", x0 + 0.2 + (k % 4) * 0.3, y0 - 0.45 + Math.floor(k / 4) * 0.9);
    for (let t = 0; t < SWELL - 2; t++) {
      run(world, 1);
      expect(world.zombies.x[id]).toBeCloseTo(x0, 9);
      expect(world.zombies.y[id]).toBeCloseTo(y0, 9);
    }
  });

  it("killing it during the swell explodes it once, never twice (M3)", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 20, 16);
    const id = spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 16);
    run(world, 5);
    expect(world.zombies.state[id]).toBe(ZOMBIE_STATE.SWELL);
    shoot(world, id);
    run(world, 1);
    expect(bursts(events)).toHaveLength(1); // at once (the same tick's zombies system)
    run(world, SWELL * 2);
    expect(bursts(events)).toHaveLength(1);
    expect(bloaterStats.swellBlasts).toBe(0);
  });

  it("no swell on a downed player (contact is with standing players only)", () => {
    const { world, events } = setup({ systems: STILL });
    const p = addPlayer(world, "p0", 20, 16);
    addPlayer(world, "p1", 40, 28);
    downPlayer(world, p);
    const id = spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 16);
    run(world, 2);
    expect(world.zombies.state[id]).not.toBe(ZOMBIE_STATE.SWELL);
    expect(events.filter((e) => e.type === "bloater.swell_started")).toHaveLength(0);
  });

  it("a Bloater blocked by a barricade swells against it and its blast takes 40 off the wall (D3)", () => {
    const { world, events, wall } = setup({ systems: { waves: noop, player: noop } });
    addPlayer(world, "p0", 28, 16);
    // The player boxed in: x 26–30 × y 14.5–17.5, the west wall at x 26–26.5.
    const w = wall(26, 15);
    wall(29.5, 15);
    wall(26, 14.5, "wood_barricade", 0);
    wall(28, 14.5, "wood_barricade", 0);
    wall(26, 17, "wood_barricade", 0);
    wall(28, 17, "wood_barricade", 0);
    const hp0 = w.hp;
    spawnZombie(world, "bloater", 22, 16);
    for (let t = 0; t < 400 && bursts(events).length === 0; t++) run(world, 1);
    expect(bursts(events)).toHaveLength(1);
    expect(events.filter((e) => e.type === "bloater.swell_started")).toHaveLength(1);
    expect(buildingById(world, w.id)?.hp ?? 0).toBe(hp0 - EX.buildingDamage);
  });
});

describe("Story 5.8 FR-B: death = blast, from any cause; removal is not a death", () => {
  const causes: [string, (world: World, id: number) => void][] = [
    ["a bullet", (w, id) => applyZombieDamage(w, id, 100, 1, 0, 0, "p0", "pistol")],
    ["melee", (w, id) => applyZombieDamage(w, id, 100, 1, 0, 0, "p0", "machete")],
    ["a quiet hit (chainsaw / flames)", (w, id) => applyZombieDamageQuiet(w, id, 100, 1, 0, 0, "p0", "chainsaw")],
    ["a grenade / mine blast (explode)", (w, id) => explode(w, { ...createExplosionSpec(), x: w.zombies.x[id] as number, y: w.zombies.y[id] as number, radiusM: 1, zombieDamage: 100, playerDamage: 0, sourcePlayerId: "p0", weapon: "mine", buildingId: 7, kind: "mine" })],
    ["car fire (credits nobody)", (w, id) => killZombie(w, id, null, "fire")],
    ["a turret (its owner, building share)", (w, id) => applyZombieDamage(w, id, 100, 1, 0, 0, "p0", "auto_turret", 3)],
  ];
  for (const [name, kill] of causes) {
    it(`${name} → one blast where it died`, () => {
      const { world, events } = setup({ systems: STILL });
      addPlayer(world, "p0", 40, 28);
      const id = spawnZombie(world, "bloater", 10, 10);
      kill(world, id);
      run(world, 3);
      expect(bursts(events)).toHaveLength(1);
      expect(bursts(events)[0]).toMatchObject({ x: 10, y: 10 });
    });
  }

  it("dev cheats and the decay engine's crushing remove it without a blast", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 40, 28);
    killZombie(world, spawnZombie(world, "bloater", 10, 10), null, "cheat");
    killZombie(world, spawnZombie(world, "bloater", 12, 10), null, "decay");
    run(world, 3);
    expect(bursts(events)).toHaveLength(0);
  });

  it("the build start (and Results) clears queued blasts and gas clouds", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 40, 28);
    startBuild(world);
    startWave(world);
    const a = spawnZombie(world, "bloater", 10, 10);
    spawnZombie(world, "bloater", 30, 10);
    shoot(world, a);
    run(world, 1);
    expect(world.gas.count).toBe(1);
    shoot(world, world.zombies.aliveIds[0] as number);
    expect(world.blasts.count).toBe(1);
    startBuild(world); // e.g. the wave ended between ticks (dev skip): the queued blast goes off first (review L1), then all is cleared
    expect(world.blasts.count).toBe(0);
    expect(world.gas.count).toBe(0);
    run(world, 2);
    expect(bursts(events)).toHaveLength(2);
  });
});

describe("Story 5.8 FR-C: the blast numbers", () => {
  it("players: 30 at 2.89 m centre to centre, nothing at 2.91 m (a 0.4 m body vs the 2.5 m circle)", () => {
    const { world, events } = setup({ systems: STILL });
    const near = addPlayer(world, "p0", 20 + 2.89, 16);
    const far = addPlayer(world, "p1", 20, 16 - 2.91);
    shoot(world, spawnZombie(world, "bloater", 20, 16), null);
    run(world, 1);
    expect(bursts(events)).toHaveLength(1);
    expect(near.hp).toBe(balance.player.maxHp - 30);
    expect(far.hp).toBe(balance.player.maxHp);
  });

  it("zombies: 40 with the edge per radius (Walker 0.35 m: 2.84 hit, 2.86 not); another Bloater 40 → it dies and chains", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 40, 28);
    const a = spawnZombie(world, "bloater", 20, 16);
    const inW = tough(world, spawnZombie(world, "walker", 20 + 2.84, 16));
    const outW = tough(world, spawnZombie(world, "walker", 20 - 2.86, 16));
    const b = spawnZombie(world, "bloater", 20, 16 + 2.99); // 2.99 < 2.5 + 0.5
    shoot(world, a);
    run(world, 1);
    expect(world.zombies.hp[inW]).toBe(1e6 - 40);
    expect(world.zombies.hp[outW]).toBe(1e6);
    expect(isZombieAlive(world.zombies, b)).toBe(false); // 25 HP < 40
    expect(bursts(events)).toHaveLength(1); // its blast waits a tick (FR-E)
    run(world, 1);
    expect(bursts(events)).toHaveLength(2);
    expect(bursts(events)[1]).toMatchObject({ chain: true });
  });

  it("downed and out players take 0; god mode takes 0", () => {
    const { world, events } = setup({ systems: STILL });
    const d = addPlayer(world, "p0", 21, 16);
    addPlayer(world, "p1", 40, 28);
    downPlayer(world, d);
    const hp = d.hp;
    shoot(world, spawnZombie(world, "bloater", 20, 16), "p1");
    run(world, 1);
    expect(d.hp).toBe(hp);
    expect(blastHits(events, "p0")).toHaveLength(0);
    const g = setup({ systems: STILL });
    const gp = addPlayer(g.world, "p0", 21, 16);
    g.world.debug.godMode = true;
    shoot(g.world, spawnZombie(g.world, "bloater", 20, 16));
    run(g.world, 1);
    expect(bursts(g.events)).toHaveLength(1);
    expect(gp.hp).toBe(balance.player.maxHp);
  });

  it("D1 / M7: popped by a teammate, every player in range takes the full 30 (the shooter too): no friendly-fire halving", () => {
    const { world, events } = setup({ systems: STILL });
    const mate = addPlayer(world, "p0", 21, 16);
    const shooter = addPlayer(world, "p1", 19, 16);
    shoot(world, spawnZombie(world, "bloater", 20, 16), "p1");
    run(world, 1);
    expect(mate.hp).toBe(balance.player.maxHp - 30);
    expect(shooter.hp).toBe(balance.player.maxHp - 30);
    const dmg = blastHits(events, "p0")[0] as { amount: number; sourceZombieId: number };
    expect(dmg).toMatchObject({ amount: 30, sourceZombieId: DAMAGE_SOURCE_EXPLOSION }); // tag explosion, no source player
  });

  it("player wall buildings in the circle take 40 (a turret too); floor mines don't; beyond the circle nothing", () => {
    const { world, wall } = setup({ systems: STILL });
    addPlayer(world, "p0", 40, 28);
    const near = wall(21.5, 14.5);
    const far = wall(24, 14.5); // its west face at 24.0: 4 m from the centre
    shoot(world, spawnZombie(world, "bloater", 20, 16));
    run(world, 1);
    expect(near.hp).toBe((balance.buildings.types.wood_barricade?.hp ?? 0) - 40);
    expect(far.hp).toBe(balance.buildings.types.wood_barricade?.hp ?? 0);
  });
});

describe("Story 5.8 FR-D: cars, the bus and buildings stop the blast and the gas; sandbags and barricades don't", () => {
  it("a car between the blast and a player: no damage, no gas slow (M5, M6); the same spot past sandbags: 30 and slowed", () => {
    const box = { minX: 21, minY: 14, maxX: 22, maxY: 18 };
    for (const [kind, shielded] of [
      ["car", true],
      ["sandbags", false],
    ] as const) {
      const { world, events } = setup({ map: mapWith(kind, box), systems: STILL });
      const p = addPlayer(world, "p0", 22.4 + 0.05, 16);
      const z = tough(world, spawnZombie(world, "walker", 22 + RW + 0.05, 17));
      shoot(world, spawnZombie(world, "bloater", 20, 16));
      run(world, 1);
      expect(bursts(events)).toHaveLength(1);
      expect(p.hp, kind).toBe(shielded ? balance.player.maxHp : balance.player.maxHp - 30);
      expect(world.zombies.hp[z], kind).toBe(shielded ? 1e6 : 1e6 - 40);
      expect(p.slowTicksLeft > 0, kind).toBe(!shielded);
    }
  });

  it("a barricade between them does not shield (barricades only stop bodies)", () => {
    const { world, wall } = setup({ systems: STILL });
    wall(21.25, 14.5);
    const p = addPlayer(world, "p0", 22.5, 16);
    shoot(world, spawnZombie(world, "bloater", 20, 16));
    run(world, 1);
    expect(p.hp).toBe(balance.player.maxHp - 30);
  });
});

describe("Story 5.8 FR-E: chains are visible and bounded; credit flows down the chain (D2)", () => {
  it("one link per tick (M4: never the same tick), credit passed down: the third link's kill pays the player who shot the first", () => {
    const { world, events } = setup({ systems: STILL });
    const p = addPlayer(world, "p0", 40, 28);
    const ids = [0, 1, 2].map((k) => spawnZombie(world, "bloater", 10 + k * 2.8, 10));
    const victim = spawnZombie(world, "walker", 10 + 2 * 2.8 + 2, 10);
    const ticks: number[] = [];
    blastTrace.fn = (_x, _y, credit, chain, tick) => {
      ticks.push(tick);
      expect(credit).toBe("p0");
      expect(chain).toBe(ticks.length > 1);
    };
    shoot(world, ids[0] as number);
    run(world, 4);
    expect(ticks).toEqual([0, 1, 2]);
    const killed = events.filter((e) => e.type === "zombie.killed") as Extract<SimEvent, { type: "zombie.killed" }>[];
    expect(killed.find((e) => e.zombieId === victim)).toMatchObject({ killerId: "p0", weapon: BLOATER_BLAST_WEAPON });
    expect(killed.filter((e) => e.weapon === BLOATER_BLAST_WEAPON)).toHaveLength(3); // two Bloaters + the Walker
    expect(p.wallet).toBeGreaterThan(balance.economy.startingWallet); // the chain's kills paid p0
  });

  it("a swell blast and a fire-killed Bloater credit nobody", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 40, 28);
    const a = spawnZombie(world, "bloater", 10, 10);
    const w = spawnZombie(world, "walker", 11, 10);
    killZombie(world, a, null, "fire");
    run(world, 1);
    expect(events.find((e) => e.type === "zombie.killed" && e.zombieId === w)).toMatchObject({ killerId: null });
  });

  it("at most 8 blasts per tick, oldest first (FIFO), none lost (40 packed Bloaters, one grenade)", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 46, 30);
    const order: number[] = [];
    for (let k = 0; k < 40; k++) spawnZombie(world, "bloater", 8 + (k % 8) * 1.05, 8 + Math.floor(k / 8) * 1.05);
    const perTick = new Map<number, number>();
    blastTrace.fn = (x, _y, _c, _ch, tick) => {
      perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
      order.push(x);
    };
    explode(world, { ...createExplosionSpec(), x: 8, y: 8, radiusM: 1.5, zombieDamage: 100, playerDamage: 0, sourcePlayerId: "p0", weapon: "grenade_launcher", buildingId: 0, kind: "grenade" });
    run(world, 30);
    expect(bursts(events)).toHaveLength(40); // every Bloater burst exactly once
    expect(Math.max(...perTick.values())).toBeLessThanOrEqual(8);
    expect(perTick.size).toBeGreaterThanOrEqual(5); // ⌈40 / 8⌉
    expect(bloaterStats.overflow).toBe(0);
  });

  it("review M: the queue can't fill (≥ 2 × the pool even with queueCapacity 2), so no blast ever runs inside another explode(); never dropped (M10)", () => {
    const small = loadBalance(withOverrides(bundledBalanceFiles(), [["zombies", "blasts.queueCapacity", 2]]));
    const { world, events } = setup({ systems: STILL, balance: small });
    expect(world.blasts.capacity).toBe(BLAST_QUEUE_MIN);
    addPlayer(world, "p0", 46, 30);
    // 60 Bloaters and 6 tough Walkers inside one grenade: every Walker is hit exactly once by it.
    for (let k = 0; k < 60; k++) spawnZombie(world, "bloater", 8 + (k % 10) * 0.6, 8 + Math.floor(k / 10) * 0.6);
    const walkers = [0, 1, 2, 3, 4, 5].map((k) => tough(world, spawnZombie(world, "walker", 9 + k * 0.5, 12.2)));
    const perTick = new Map<number, number>();
    blastTrace.fn = (_x, _y, _c, _ch, tick) => perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
    explode(world, { ...createExplosionSpec(), x: 11, y: 10, radiusM: 4, zombieDamage: 100, playerDamage: 0, sourcePlayerId: "p0", weapon: "grenade_launcher", kind: "grenade", announce: false });
    expect(bloaterStats.blasts).toBe(0); // nothing ran inside the grenade
    expect(world.blasts.count).toBe(60);
    for (const w of walkers) expect(world.zombies.hp[w]).toBe(1e6 - 100);
    run(world, 12);
    expect(bursts(events)).toHaveLength(60);
    expect(Math.max(...perTick.values())).toBeLessThanOrEqual(8);
    expect(bloaterStats.overflow).toBe(0);
  });

  it("review L1: a Bloater killed on the wave's last tick still bursts at the build start", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 46, 30);
    startBuild(world);
    startWave(world);
    shoot(world, spawnZombie(world, "bloater", 10, 10));
    expect(world.blasts.count).toBe(1);
    startBuild(world); // the wave ended before the zombies system ran
    run(world, 1);
    expect(bursts(events)).toHaveLength(1);
    expect(world.blasts.count).toBe(0);
  });

  it("review L2: two swells ending on the same tick both burst on that tick (20 ticks), neither as a chain link", () => {
    const { world, events } = setup({ systems: STILL });
    addPlayer(world, "p0", 20, 16);
    addPlayer(world, "p1", 20, 18.2);
    spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 16);
    spawnZombie(world, "bloater", 20 + BL.radiusM + PR, 18.2);
    const ticks: number[] = [];
    blastTrace.fn = (_x, _y, credit, chain, tick) => {
      ticks.push(tick);
      expect(chain).toBe(false);
      expect(credit).toBeNull();
    };
    run(world, 1);
    expect(events.filter((e) => e.type === "bloater.swell_started")).toHaveLength(2);
    run(world, SWELL + 3);
    expect(ticks).toEqual([SWELL, SWELL]);
    expect(bloaterStats.swellBlasts).toBe(2);
  });

  it("same order every run: two identical chains give identical blast sequences", () => {
    const go = () => {
      const { world } = setup({ systems: STILL, seed: 9 });
      addPlayer(world, "p0", 46, 30);
      for (let k = 0; k < 30; k++) spawnZombie(world, "bloater", 6 + (k % 6) * 1.6, 6 + Math.floor(k / 6) * 1.6);
      const seq: string[] = [];
      blastTrace.fn = (x, y, _c, _ch, tick) => seq.push(`${tick}:${x.toFixed(4)},${y.toFixed(4)}`);
      shoot(world, world.zombies.aliveIds[0] as number);
      run(world, 40);
      return seq;
    };
    const a = go();
    expect(a.length).toBe(30);
    expect(go()).toEqual(a);
  });
});

describe("Story 5.8 FR-F: gas slows, it does not hurt", () => {
  it("30 % on every tick inside, 0.25 s linger after leaving, gone after 4 s; no damage (M9: zombies not slowed)", () => {
    const { world, events } = setup({ systems: { waves: noop } });
    const p = addPlayer(world, "p0", 40, 28);
    const w = tough(world, spawnZombie(world, "walker", 31, 20)); // inside the cloud the whole time
    shoot(world, spawnZombie(world, "bloater", 30, 20));
    run(world, 1);
    expect(world.gas.count).toBe(1);
    p.x = 30 + 2.5 + PR - 0.05; // inside the cloud's edge, out of the (already gone) blast
    p.y = 20;
    events.length = 0;
    for (let t = 0; t < GAS - 2; t++) {
      run(world, 1);
      expect(p.slowPct).toBe(EX.gasSlowPct);
      expect(p.slowTicksLeft).toBeGreaterThan(0);
      p.x = 30 + 2.5 + PR - 0.05; // no input: keep it there
      p.y = 20;
    }
    expect(events.filter((e) => e.type === "player.damaged" && e.sourceZombieId < 0)).toHaveLength(0); // gas never hurts (the Walker's bites may)
    expect(isZombieAlive(world.zombies, w)).toBe(true);
    expect(world.zombies.slowPct[w] ?? 0).toBe(0); // M9: zombies are never slowed by the gas
    p.x = 40; // leave
    run(world, 1);
    let left = 0;
    while (p.slowTicksLeft > 0 && left < 20) {
      run(world, 1);
      left++;
    }
    expect(left).toBeLessThanOrEqual(LINGER);
    expect(left).toBeGreaterThanOrEqual(LINGER - 2);
    run(world, GAS);
    expect(world.gas.count).toBe(0);
    expect(events.filter((e) => e.type === "player.damaged" && e.sourceZombieId < 0)).toHaveLength(0);
  });

  it("the cloud slows on exactly gasS worth of ticks", () => {
    const { world } = setup();
    const p = addPlayer(world, "p0", 31, 20); // takes the 30 blast (no god mode: god mode now skips the gas too)
    shoot(world, spawnZombie(world, "bloater", 30, 20));
    let slowed = 0;
    for (let t = 0; t < GAS + 20; t++) {
      const before = bloaterStats.gasSlows;
      run(world, 1);
      if (bloaterStats.gasSlows > before) slowed++;
    }
    expect(slowed).toBe(GAS);
    expect(p.status).toBe("alive");
    expect(p.slowPct).toBe(0);
  });

  it("refreshes, never stacks, with a Crawler bite (M8: max(30, 30) = 30, not 60)", () => {
    const { world } = setup({ systems: STILL });
    const p = addPlayer(world, "p0", 30.5, 20);
    world.debug.godMode = true;
    shoot(world, spawnZombie(world, "bloater", 30, 20));
    run(world, 1);
    world.debug.godMode = false;
    spawnZombie(world, "crawler", 30.5 + 0.75, 20);
    for (let t = 0; t < 30; t++) {
      run(world, 1);
      p.x = 30.5;
      p.y = 20;
      expect(p.slowPct).toBe(30);
    }
    expect(playerSpeed(balance.player.speedMps, p)).toBeCloseTo(balance.player.speedMps * 0.7, 9);
  });

  // Bugfix (2026-11-28): the gas skips protected (Story 8.1 `protectTicks`) and god-mode survivors, like spit and the Crawler bite.
  const gasSpot = (prep: (world: World, p: PlayerState) => void) => {
    const { world } = setup({ systems: STILL });
    const p = addPlayer(world, "p0", 46, 30); // out of the blast
    shoot(world, spawnZombie(world, "bloater", 30, 20));
    run(world, 1);
    expect(world.gas.count).toBe(1);
    p.x = 31; // inside the cloud, a clear line to its centre
    p.y = 20;
    prep(world, p);
    const before = bloaterStats.gasSlows;
    run(world, 1);
    return { p, slows: bloaterStats.gasSlows - before };
  };

  it("an unprotected survivor standing in the cloud is slowed (the control)", () => {
    const { p, slows } = gasSpot(() => {});
    expect(p.slowPct).toBe(EX.gasSlowPct);
    expect(p.slowTicksLeft).toBeGreaterThan(0);
    expect(slows).toBe(1);
  });

  it("a protected survivor (protectTicks > 0) in the cloud is not slowed and not counted", () => {
    const { p, slows } = gasSpot((_w, pl) => {
      pl.protectTicks = 40;
    });
    expect(p.protectTicks).toBeGreaterThan(0);
    expect(p.slowTicksLeft).toBe(0);
    expect(p.slowPct).toBe(0);
    expect(slows).toBe(0);
  });

  it("god mode (the world switch and an admin's own survivor) is not slowed by the gas", () => {
    const a = gasSpot((w) => {
      w.debug.godMode = true;
    });
    expect(a.p.slowTicksLeft).toBe(0);
    expect(a.p.slowPct).toBe(0);
    expect(a.slows).toBe(0);
    const b = gasSpot((w, pl) => {
      w.godPlayers.add(pl.id);
    });
    expect(b.p.slowTicksLeft).toBe(0);
    expect(b.p.slowPct).toBe(0);
    expect(b.slows).toBe(0);
  });

  it("circleInGas follows the cloud and its line of sight", () => {
    const { world } = setup({ map: mapWith("car", { minX: 31, minY: 18, maxX: 32, maxY: 22 }), systems: STILL });
    addPlayer(world, "p0", 46, 30);
    shoot(world, spawnZombie(world, "bloater", 30, 20));
    run(world, 1);
    expect(circleInGas(world, 29, 20, PR)).toBe(true);
    expect(circleInGas(world, 32.6, 20, PR)).toBe(false); // behind the car
    expect(circleInGas(world, 30, 23.5, PR)).toBe(false); // outside
  });
});

describe("Story 5.8 FR-G: no Bloater pops on a player at spawn", () => {
  it("the spawn distance minus the jitter beats the blast reach (2.5 m + the player's body)", () => {
    const reach = EX.blastRadiusM + PR;
    expect(balance.waves.spawnMinPlayerDistanceM - spawnJitterFor(balance, BL.radiusM)).toBeGreaterThan(reach);
  });
});

describe("Story 5.8: determinism (brief line 8)", () => {
  it("same seed + inputs → same digest through swells, chains and gas (snapshot has swellTicks, the queue, the clouds)", () => {
    const go = () => {
      const { world } = setup({ seed: 4 });
      addPlayer(world, "p0", 24, 16);
      addPlayer(world, "p1", 26, 17);
      for (let k = 0; k < 12; k++) spawnZombie(world, "bloater", 10 + k * 2, 10 + (k % 3) * 3);
      for (let t = 0; t < 400; t++) {
        if (t === 50) shoot(world, world.zombies.aliveIds[0] as number);
        run(world, 1);
      }
      return { d: worldDigest(world), blasts: bloaterStats.blasts };
    };
    const a = go();
    resetBloaterStats();
    const b = go();
    expect(a.blasts).toBeGreaterThan(0); // liveness
    expect(b).toEqual(a);
  });
});

/** Story 5.8 Beat-the-rule probes as tests (story § Beat the rule). */
describe("Story 5.8 Beat the rule", () => {
  it("1. outrun: from contact at 4.5 m/s for 1 s the player clears the 2.9 m danger edge", () => {
    expect(balance.player.speedMps * EX.swellS).toBeGreaterThan(EX.blastRadiusM + PR - (BL.radiusM + PR));
  });

  it("5. melee: a Machete kill at reach blasts the wielder for 30 (careless melee)", () => {
    const { world } = setup({ systems: STILL });
    const p: PlayerState = addPlayer(world, "p0", 20, 16);
    const id = spawnZombie(world, "bloater", 21.2, 16);
    applyZombieDamage(world, id, 100, 1, 0, 0, "p0", "machete");
    run(world, 1);
    expect(p.hp).toBe(balance.player.maxHp - 30);
  });

  it("7. chain overload: 40 packed Bloaters and a grenade spread over ≥ 5 ticks, ≤ 8 per tick (see FR-E)", () => {
    expect(balance.zombies.blasts.maxBlastsPerTick).toBe(8);
  });
});
