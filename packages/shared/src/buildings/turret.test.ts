import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, removePlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, removeBuilding, type Building } from "./buildings";
import { buildingCentreX, buildingCentreY, turretStats } from "./turret";

/** Story 3.6: auto-turrets. One mechanic per test: no wave director; zombies stand still unless a test moves them. */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const TURRET = "auto_turret";
const T = turretStats(balance, TURRET) as NonNullable<ReturnType<typeof turretStats>>;
const WALKER_REWARD = balance.zombies.types.walker?.reward ?? 0;

type Fired = Extract<SimEvent, { type: "turret.fired" }>;

function setup(opts: { systems?: Record<string, SystemFn>; seed?: number; wave?: boolean } = {}) {
  const world = createWorld({ balance, seed: opts.seed ?? 1, systems: opts.systems ?? STILL });
  addPlayer(world, "p0", 5, 5);
  addPlayer(world, "p1", 6, 5);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  if (opts.wave !== false) startWave(world);
  let nextId = 1;
  /** A building with its min corner at (x, y) metres. */
  const place = (x: number, y: number, type = TURRET, ownerId = "p0") =>
    addBuildingAt(world, { id: nextId++, type, ownerId, gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, events, place };
}

const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const fired = (events: SimEvent[]): Fired[] => events.filter((e): e is Fired => e.type === "turret.fired");
const tough = (world: World, id: number): void => {
  world.zombies.hp[id] = 1e6;
};

describe("auto-turret (Story 3.6)", () => {
  it("fires at a zombie 7.9 m from its centre, never at one 8.1 m away", () => {
    const near = setup();
    const a = near.place(20, 16);
    tough(near.world, spawnZombie(near.world, "walker", buildingCentreX(a) + 7.9, buildingCentreY(a)));
    run(near.world, 20);
    expect(fired(near.events).length).toBeGreaterThan(0);

    const far = setup();
    const b = far.place(20, 16);
    tough(far.world, spawnZombie(far.world, "walker", buildingCentreX(b) + 8.1, buildingCentreY(b)));
    run(far.world, 40);
    expect(fired(far.events)).toHaveLength(0);
  });

  it("turns to the nearest zombie (its muzzle 0.5 m out along the aim); the aim is on the building", () => {
    const { world, events, place } = setup();
    const b = place(20, 16);
    const cx = buildingCentreX(b);
    const cy = buildingCentreY(b);
    tough(world, spawnZombie(world, "walker", cx + 5, cy));
    tough(world, spawnZombie(world, "walker", cx, cy - 3)); // nearer, straight up
    run(world, 3);
    const shot = fired(events)[0] as Fired;
    expect(shot.buildingId).toBe(b.id);
    expect(shot.dirX).toBeCloseTo(0, 6);
    expect(shot.dirY).toBeCloseTo(-1, 6);
    expect(shot.x).toBeCloseTo(cx, 6);
    expect(shot.y).toBeCloseTo(cy - T.muzzleM, 6);
    expect([b.aimX, b.aimY]).toEqual([shot.dirX, shot.dirY]);
  });

  it("an equal-distance tie goes to the lower pool slot", () => {
    const { world, events, place } = setup();
    const b = place(20, 16);
    const cx = buildingCentreX(b);
    const cy = buildingCentreY(b);
    const first = spawnZombie(world, "walker", cx - 4, cy); // slot 0: west
    tough(world, first);
    tough(world, spawnZombie(world, "walker", cx + 4, cy)); // slot 1: east
    run(world, 3);
    expect(first).toBe(0);
    expect(fired(events)[0]?.dirX).toBeCloseTo(-1, 6);
  });

  it("shoots exactly every 4 ticks (5/s at 20 Hz) through the shared cooldown rule", () => {
    const { world, events, place } = setup();
    const b = place(20, 16);
    tough(world, spawnZombie(world, "walker", buildingCentreX(b) + 4, buildingCentreY(b)));
    const ticks: number[] = [];
    world.events.subscribe((e) => {
      if (e.type === "turret.fired") ticks.push(world.tick);
    });
    run(world, 201);
    expect(T.rateHz).toBe(5);
    expect(ticks.length).toBe(50);
    for (let i = 1; i < ticks.length; i++) expect((ticks[i] as number) - (ticks[i - 1] as number)).toBe(4);
    expect(fired(events)).toHaveLength(50);
  });

  it("does not shoot in the build phase (no saved-up burst), then shoots once the wave starts", () => {
    const { world, events, place } = setup({ wave: false });
    const b = place(20, 16);
    tough(world, spawnZombie(world, "walker", buildingCentreX(b) + 3, buildingCentreY(b)));
    run(world, 60);
    expect(world.run.phase).toBe("build");
    expect(fired(events)).toHaveLength(0);
    expect(b.fireCooldownS).toBe(0);
    startWave(world);
    run(world, 8);
    expect(fired(events)).toHaveLength(2); // the first shot at once, the next 4 ticks later
  });

  it("a barricade never shoots", () => {
    const { world, events, place } = setup();
    const b = place(20, 16, "wood_barricade");
    tough(world, spawnZombie(world, "walker", buildingCentreX(b) + 3, buildingCentreY(b)));
    run(world, 40);
    expect(fired(events)).toHaveLength(0);
  });

  it("each shot is a projectile that deals 3 damage, with no assist source, named after the building type", () => {
    const { world, events, place } = setup();
    const b = place(20, 16);
    const z = spawnZombie(world, "walker", buildingCentreX(b) + 4, buildingCentreY(b));
    tough(world, z);
    run(world, 2);
    expect(world.projectiles.aliveCount).toBe(1);
    const pid = world.projectiles.aliveIds[0] as number;
    expect(world.projectiles.building[pid]).toBe(b.id);
    run(world, 20);
    const hits = events.filter((e) => e.type === "zombie.hit");
    expect(hits.length).toBeGreaterThan(3);
    for (const h of hits) expect(h).toMatchObject({ damage: T.damage, sourceId: null, weapon: TURRET });
    expect(world.zombies.hp[z]).toBe(1e6 - hits.length * T.damage);
    expect(world.economy.damagerCount[z]).toBe(0); // turret damage is nobody's assist
  });

  it("leads a zombie walking across its line of fire, so the shots hit", () => {
    // The zombie runs north at 3 m/s (a fast zombie), 7 m east of the turret (its own system moves it):
    // without the lead every shot passes behind it (3 m/s × ~0.16 s flight > its 0.35 m radius).
    const speed = 3;
    const walk: SystemFn = (w, dtS) => {
      const zp = w.zombies;
      for (let i = 0; i < zp.aliveCount; i++) {
        const id = zp.aliveIds[i] as number;
        zp.prevX[id] = zp.x[id] as number;
        zp.prevY[id] = zp.y[id] as number;
        zp.y[id] = (zp.y[id] as number) - speed * dtS;
      }
    };
    const { world, events, place } = setup({ systems: { waves: noop, zombies: walk } });
    const b = place(20, 16);
    tough(world, spawnZombie(world, "walker", buildingCentreX(b) + 7, buildingCentreY(b) + 2));
    run(world, 30);
    const shots = fired(events).length;
    const hits = events.filter((e) => e.type === "zombie.hit").length;
    expect(shots).toBeGreaterThan(5);
    expect(hits).toBeGreaterThanOrEqual(shots - 2); // the last shots may still be in flight
  });

  it("a kill pays the owner 50 % of the reward, rounded down, and is tagged with the building", () => {
    const { world, events, place } = setup();
    const b = place(20, 16);
    spawnZombie(world, "walker", buildingCentreX(b) + 3, buildingCentreY(b));
    const before = world.players.get("p0")?.wallet ?? 0;
    run(world, 40);
    const killed = events.find((e) => e.type === "zombie.killed");
    expect(killed).toMatchObject({ killerId: "p0", buildingId: b.id, weapon: TURRET });
    const pay = Math.floor(WALKER_REWARD * balance.economy.buildingKillShare);
    expect(world.players.get("p0")?.wallet).toBe(before + pay);
    expect(events.filter((e) => e.type === "money.earned")).toEqual([{ type: "money.earned", playerId: "p0", amount: pay, reason: "kill" }]);
    expect(world.players.get("p1")?.wallet).toBe(before);
  });

  it("a teammate who damaged the zombie gets the assist share on a turret kill", () => {
    const { world, place } = setup();
    const b = place(20, 16);
    const z = spawnZombie(world, "walker", buildingCentreX(b) + 3, buildingCentreY(b));
    // p1 shoots the zombie once (a real pistol shot from 4 m west of it).
    const p1 = world.players.get("p1");
    if (!p1) throw new Error("no p1");
    p1.x = (world.zombies.x[z] as number) + 2;
    p1.y = world.zombies.y[z] as number;
    setInput(world, "p1", { ...NEUTRAL_INPUT, seq: 1, aimX: -1, aimY: 0, fire: true, isMouse: true });
    step(world, TICK_DT_S);
    setInput(world, "p1", { ...NEUTRAL_INPUT, seq: 2 });
    const p0Before = world.players.get("p0")?.wallet ?? 0;
    const p1Before = p1.wallet;
    run(world, 40);
    expect(world.zombies.aliveCount).toBe(0);
    expect(world.players.get("p0")?.wallet).toBe(p0Before + Math.floor(WALKER_REWARD * balance.economy.buildingKillShare));
    expect(p1.wallet).toBe(p1Before + Math.floor(WALKER_REWARD * balance.economy.assistShare));
  });

  it("keeps shooting after its owner left (the kill pays nobody); a shot in flight still pays after the turret is gone", () => {
    const gone = setup();
    const b = gone.place(20, 16);
    spawnZombie(gone.world, "walker", buildingCentreX(b) + 3, buildingCentreY(b));
    removePlayer(gone.world, "p0");
    run(gone.world, 40);
    expect(gone.world.zombies.aliveCount).toBe(0);
    expect(gone.events.some((e) => e.type === "money.earned")).toBe(false);

    const flight = setup();
    const c = flight.place(20, 16);
    const z = spawnZombie(flight.world, "walker", buildingCentreX(c) + 7, buildingCentreY(c));
    flight.world.zombies.hp[z] = 1; // one hit kills it
    run(flight.world, 2);
    expect(flight.world.projectiles.aliveCount).toBe(1);
    removeBuilding(flight.world, c.id);
    const before = flight.world.players.get("p0")?.wallet ?? 0;
    run(flight.world, 10);
    expect(flight.world.zombies.aliveCount).toBe(0);
    expect(flight.world.players.get("p0")?.wallet).toBe(before + Math.floor(WALKER_REWARD * balance.economy.buildingKillShare));
  });

  it("is deterministic with the real systems: two seeded runs give the same World (turret cooldown and aim included)", () => {
    const once = () => {
      const { world, place } = setup({ systems: { waves: noop }, seed: 77 });
      place(20, 16);
      place(26, 12, TURRET, "p1");
      for (let i = 0; i < 12; i++) spawnZombie(world, i % 3 === 0 ? "crawler" : "walker", 30 + (i % 4) * 1.5, 8 + Math.floor(i / 4) * 2);
      run(world, 200);
      return snapshotWorld(world);
    };
    const a = once();
    const b = once();
    expect(a).toEqual(b);
    expect(a.buildings.list.some((x) => x.aimX !== 1 || x.aimY !== 0)).toBe(true);
    expect(a.zombies.alive.length).toBeLessThan(12);
  });
});
