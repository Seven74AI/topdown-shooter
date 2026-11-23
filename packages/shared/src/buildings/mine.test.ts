import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { DAMAGE_SOURCE_EXPLOSION, type SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { applyDecayStage } from "../decay/applyDecayStage";
import { downPlayer } from "../player/downed";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { isZombieAlive, spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, buildingById, ownedCount, placementError, type Building } from "./buildings";
import { mineCounters } from "./mine";
import { blastResult, createExplosionSpec, explode } from "../combat/explosion";
import { zombieCandidates } from "../combat/scratch";

/**
 * Story 5.9: mines (AC 3, F4–F8). One mechanic per test (no wave director; zombies stand still).
 * Liveness: every test that expects a blast asserts ≥ 1 explosion (and a kill where one is due).
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const MINE = balance.buildings.types.mine?.mine as NonNullable<NonNullable<typeof balance.buildings.types.mine>["mine"]>;
const WALKER = balance.zombies.types.walker as NonNullable<typeof balance.zombies.types.walker>;
const RZ = WALKER.radiusM;

/** The open street with one cover object (a car by default) from stage 1. */
function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: "mine-test", cover: [{ name: `test_${kind}`, kind, minStage: 1, ...box }] };
}

function setup(opts: { map?: DistrictMap; wave?: boolean } = {}) {
  const world = createWorld({ balance, seed: 1, systems: STILL, ...(opts.map ? { map: opts.map } : {}) });
  if (opts.map) applyDecayStage(world, 1, 0);
  addPlayer(world, "p0", 40, 28);
  addPlayer(world, "p1", 42, 28);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  if (opts.wave !== false) startWave(world);
  let nextId = 1;
  /** A mine with its centre at (cx, cy) (0.5 m lattice: centres at x.25 / x.75). */
  const mine = (cx: number, cy: number, ownerId = "p0") =>
    addBuildingAt(world, { id: nextId++, type: "mine", ownerId, gx: Math.round((cx - 0.25) / BUILD_GRID_M), gy: Math.round((cy - 0.25) / BUILD_GRID_M), rot: 0, hp: 1 }) as Building;
  const wall = (x: number, y: number, type = "wood_barricade") =>
    addBuildingAt(world, { id: nextId++, type, ownerId: "p1", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 1, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, events, mine, wall };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const exploded = (events: SimEvent[]) => events.filter((e) => e.type === "mine.exploded");
const tough = (world: World, id: number): number => {
  world.zombies.hp[id] = 1000;
  return id;
};

beforeEach(() => {
  mineCounters.exploded = 0;
});

describe("mine (Story 5.9)", () => {
  it("a Walker overlapping the 1 m circle sets it off the same tick (F7); one just outside doesn't", () => {
    const out = setup();
    out.mine(10.25, 10.25);
    tough(out.world, spawnZombie(out.world, "walker", 10.25 + MINE.triggerRadiusM + RZ + 0.01, 10.25));
    run(out.world, 20);
    expect(exploded(out.events)).toHaveLength(0);

    const { world, events, mine } = setup();
    const m = mine(10.25, 10.25);
    const z = spawnZombie(world, "walker", 10.25 + MINE.triggerRadiusM + RZ - 0.01, 10.25);
    step(world, TICK_DT_S);
    expect(exploded(events)).toEqual([{ type: "mine.exploded", buildingId: m.id, x: 10.25, y: 10.25 }]);
    expect(isZombieAlive(world.zombies, z)).toBe(false);
    expect(mineCounters.exploded).toBe(1);
  });

  it("a player on the mine never sets it off (F6); a build phase never does", () => {
    const { world, events, mine } = setup();
    mine(10.25, 10.25);
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    p.x = p.prevX = 10.25;
    p.y = p.prevY = 10.25;
    tough(world, spawnZombie(world, "walker", 30, 20)); // a zombie far away: the trigger pass really runs
    run(world, 40);
    expect(exploded(events)).toHaveLength(0);
    expect(p.x).toBe(10.25); // not pushed off either

    const b = setup({ wave: false });
    b.mine(10.25, 10.25);
    tough(b.world, spawnZombie(b.world, "walker", 10.25, 10.25));
    run(b.world, 40);
    expect(exploded(b.events)).toHaveLength(0);
    // Liveness: the same zombie at the start of the wave sets it off.
    startWave(b.world);
    step(b.world, TICK_DT_S);
    expect(exploded(b.events)).toHaveLength(1);
  });

  it("80 to every zombie whose body overlaps 2.5 m; none just beyond", () => {
    const { world, mine } = setup();
    mine(20.25, 16.25);
    const trigger = tough(world, spawnZombie(world, "walker", 20.25, 16.25 + 0.8));
    const inside = tough(world, spawnZombie(world, "walker", 20.25 + MINE.blastRadiusM + RZ - 0.01, 16.25));
    const outside = tough(world, spawnZombie(world, "walker", 20.25 - (MINE.blastRadiusM + RZ + 0.01), 16.25));
    step(world, TICK_DT_S);
    expect(world.zombies.hp[trigger]).toBe(1000 - MINE.damage);
    expect(world.zombies.hp[inside]).toBe(1000 - MINE.damage);
    expect(world.zombies.hp[outside]).toBe(1000);
    expect(blastResult.zombiesHit).toBe(2);
  });

  it("a car between the mine and a zombie shields it; sandbags and a barricade don't (F5)", () => {
    // Car box between x 21.5 and 22.5 (east of the mine), sandbags west.
    const car = setup({ map: mapWith("car", { minX: 21.5, minY: 15, maxX: 22.5, maxY: 17.5 }) });
    car.mine(20.25, 16.25);
    tough(car.world, spawnZombie(car.world, "walker", 20.25, 16.25 + 0.8)); // trigger
    const behindCar = tough(car.world, spawnZombie(car.world, "walker", 22.5 + RZ + 0.05, 16.25));
    step(car.world, TICK_DT_S);
    expect(exploded(car.events)).toHaveLength(1);
    expect(car.world.zombies.hp[behindCar]).toBe(1000);

    const bags = setup({ map: mapWith("sandbags", { minX: 21.5, minY: 15, maxX: 22.5, maxY: 17.5 }) });
    bags.mine(20.25, 16.25);
    tough(bags.world, spawnZombie(bags.world, "walker", 20.25, 16.25 + 0.8));
    const behindBags = tough(bags.world, spawnZombie(bags.world, "walker", 22.5 + RZ + 0.05, 16.25));
    step(bags.world, TICK_DT_S);
    expect(bags.world.zombies.hp[behindBags]).toBe(1000 - MINE.damage);

    const wall = setup();
    wall.mine(20.25, 16.25);
    const w = wall.wall(21.5, 15); // rot 1: 0.5 × 2 m at x [21.5, 22]
    tough(wall.world, spawnZombie(wall.world, "walker", 20.25, 16.25 + 0.8));
    const behindWall = tough(wall.world, spawnZombie(wall.world, "walker", 22 + RZ + 0.05, 16.25));
    step(wall.world, TICK_DT_S);
    expect(wall.world.zombies.hp[behindWall]).toBe(1000 - MINE.damage);
    expect(w.hp).toBe(w.maxHp); // DD6: buildings take no blast damage
  });

  it("a standing player in range takes 40, the owner too; downed/out none (F6)", () => {
    const { world, events, mine } = setup();
    mine(20.25, 16.25, "p0");
    const p0 = world.players.get("p0");
    const p1 = world.players.get("p1");
    if (!p0 || !p1) throw new Error("players");
    p0.x = p0.prevX = 21.5;
    p0.y = p0.prevY = 16.25;
    p1.x = p1.prevX = 19;
    p1.y = p1.prevY = 16.25;
    const hp0 = p0.hp;
    const hp1 = p1.hp;
    tough(world, spawnZombie(world, "walker", 20.25, 16.25 + 0.8));
    step(world, TICK_DT_S);
    expect(exploded(events)).toHaveLength(1);
    expect(hp0 - p0.hp).toBe(MINE.damage * MINE.playerShare);
    expect(hp1 - p1.hp).toBe(40);
    const dmg = events.filter((e) => e.type === "player.damaged");
    expect(dmg.every((e) => e.type === "player.damaged" && e.sourceZombieId === DAMAGE_SOURCE_EXPLOSION)).toBe(true);

    const d = setup();
    d.mine(20.25, 16.25);
    const q0 = d.world.players.get("p0");
    if (!q0) throw new Error("p0");
    q0.x = q0.prevX = 21;
    q0.y = q0.prevY = 16.25;
    downPlayer(d.world, q0);
    const downedHp = q0.hp;
    tough(d.world, spawnZombie(d.world, "walker", 20.25, 16.25 + 0.8));
    step(d.world, TICK_DT_S);
    expect(exploded(d.events)).toHaveLength(1);
    expect(q0.hp).toBe(downedHp);
    expect(d.events.filter((e) => e.type === "player.damaged" && e.playerId === "p0")).toEqual([]); // not even a 0-HP hit
    expect(q0.status).toBe("downed");
  });

  it("single use: removed, cap freed, never twice", () => {
    const { world, events, mine } = setup();
    const m = mine(10.25, 10.25);
    expect(ownedCount(world, "p0")).toBe(1);
    const wv = world.buildings.wallVersion;
    const z = tough(world, spawnZombie(world, "walker", 10.25, 10.75));
    run(world, 40);
    expect(exploded(events)).toHaveLength(1);
    expect(buildingById(world, m.id)).toBeUndefined();
    expect(ownedCount(world, "p0")).toBe(0);
    expect(world.zombies.hp[z]).toBe(1000 - MINE.damage); // hit once in 40 ticks on it
    expect(world.buildings.wallVersion).toBe(wv); // F1/AC 15: a mine leaving never dirties the flow field
  });

  it("no chain: two mines 1 m apart, one zombie triggers one (DD7)", () => {
    const { world, events, mine } = setup();
    const a = mine(10.25, 10.25);
    const b = mine(11.25, 10.25);
    const z = spawnZombie(world, "walker", 10.25 - MINE.triggerRadiusM - RZ + 0.05, 10.25); // touches a's circle only
    step(world, TICK_DT_S);
    expect(exploded(events).map((e) => (e.type === "mine.exploded" ? e.buildingId : 0))).toEqual([a.id]);
    expect(isZombieAlive(world.zombies, z)).toBe(false);
    expect(buildingById(world, b.id)).toBeDefined();
  });

  it("kills pay the owner the building share (the mine is already gone)", () => {
    const { world, events, mine } = setup();
    const m = mine(10.25, 10.25, "p1");
    spawnZombie(world, "walker", 10.25, 10.75);
    step(world, TICK_DT_S);
    const kill = events.find((e) => e.type === "zombie.killed");
    expect(kill).toMatchObject({ killerId: "p1", buildingId: m.id, weapon: "mine" });
    const paid = events.filter((e) => e.type === "money.earned" && e.playerId === "p1");
    expect(paid.map((e) => (e.type === "money.earned" ? e.amount : 0))).toEqual([Math.floor(WALKER.reward * balance.economy.buildingKillShare)]);
  });

  it("placement stays 2 m clear of spawns (F8), for traps too", () => {
    const { world } = setup({ wave: false });
    const p = world.players.get("p0");
    if (!p) throw new Error("p0");
    p.wallet = 1000;
    const sp = world.map.spawnPoints[0] as { x: number; y: number };
    const clear = balance.buildings.spawnClearM;
    // Mine centred right next to the spawn point: refused; 2 m + its half size away: fine.
    const gx = (cx: number) => Math.round((cx - 0.25) / BUILD_GRID_M);
    expect(placementError(world, "p0", { type: "mine", gx: gx(sp.x), gy: gx(sp.y), rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: "mine", gx: gx(sp.x + clear + 0.75), gy: gx(sp.y), rot: 0 })).toBeNull();
    expect(placementError(world, "p0", { type: "spike_trap", gx: Math.round((sp.x + 0.5) / BUILD_GRID_M), gy: Math.round((sp.y - 1) / BUILD_GRID_M), rot: 0 })).toBe("blocked");
    expect(placementError(world, "p0", { type: "metal_barricade", gx: 40, gy: 40, rot: 0 })).toBe("unknown_type"); // upgrade-only
  });

  it("review L1 (F7): a walking zombie sets the mine off on the very tick its body first overlaps the trigger circle", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: noop } }); // zombies walk
    addPlayer(world, "p0", 30, 10.25);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    startBuild(world);
    startWave(world);
    addBuildingAt(world, { id: 1, type: "mine", ownerId: "p0", gx: 40, gy: 20, rot: 0, hp: 1 }); // centre (20.25, 10.25)
    const z = spawnZombie(world, "walker", 10, 10.25); // walks east toward the player, straight through
    world.zombies.hp[z] = 1e6;
    const reach = MINE.triggerRadiusM + RZ;
    let overlapTick = -1;
    let blastTick = -1;
    for (let t = 0; t < 400 && blastTick < 0; t++) {
      step(world, TICK_DT_S);
      if (overlapTick < 0 && Math.hypot((world.zombies.x[z] as number) - 20.25, (world.zombies.y[z] as number) - 10.25) < reach) overlapTick = world.tick;
      if (events.some((e) => e.type === "mine.exploded")) blastTick = world.tick;
    }
    expect(overlapTick).toBeGreaterThan(0); // liveness: it really walked in
    expect(blastTick).toBe(overlapTick);
    expect(events.filter((e) => e.type === "mine.exploded")).toHaveLength(1);
  });

  it("review L3: a player whose body EDGE (not centre) is inside the blast circle takes 40; one just beyond takes nothing", () => {
    for (const [d, hurt] of [
      [MINE.blastRadiusM + balance.player.radiusM - 0.01, true],
      [MINE.blastRadiusM + balance.player.radiusM + 0.01, false],
    ] as const) {
      const { world, mine } = setup();
      mine(20.25, 16.25);
      const p = world.players.get("p1");
      if (!p) throw new Error("p1");
      p.x = p.prevX = 20.25 - d;
      p.y = p.prevY = 16.25;
      const hp = p.hp;
      tough(world, spawnZombie(world, "walker", 20.25, 16.25 + 0.8));
      step(world, TICK_DT_S);
      expect(mineCounters.exploded).toBeGreaterThan(0);
      expect(hp - p.hp, `d ${d}`).toBe(hurt ? MINE.damage * MINE.playerShare : 0);
      expect(d - balance.player.radiusM).toBeLessThan(MINE.blastRadiusM + 0.02); // the centre itself is outside the circle
      expect(d).toBeGreaterThan(MINE.blastRadiusM);
    }
  });

  it("review L2: explode() never touches the shared combat candidate buffer (callers may be iterating it)", () => {
    const { world } = setup();
    for (let i = 0; i < 5; i++) tough(world, spawnZombie(world, "walker", 20 + i * 0.3, 16));
    for (let i = 0; i < 16; i++) zombieCandidates[i] = 1000 + i; // a caller's in-progress list
    let visited = 0;
    for (let k = 0; k < 16; k++) {
      expect(zombieCandidates[k]).toBe(1000 + k);
      visited++;
      if (k === 3) explode(world, { ...createExplosionSpec(), x: 20.5, y: 16, radiusM: 2.5, zombieDamage: 1, playerDamage: 1, kind: "mine", sourcePlayerId: "p0", weapon: "mine" }); // re-entrant blast mid-iteration (Story 5.5: the spec API)
    }
    expect(visited).toBe(16);
    expect(blastResult.zombiesHit).toBe(5); // liveness: the blast really hit
  });
});
