import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { rebuildGrid } from "../core/spatialGrid";
import { createWorld, setInput, step, type World } from "../core/world";
import { addBuildingAt, type Building } from "../buildings/buildings";
import { buildingCentreX, nearestZombieInRange } from "../buildings/turret";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { COVER_KINDS, type CoverKind, type CoverObject, type DistrictMap } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { applyDecayStage } from "../decay/applyDecayStage";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { setLoadout } from "./loadout";
import { spawnProjectile } from "./projectilePool";
import { assistAim } from "./aimAssist";
import { segmentBoxEntryT, shotBlockT } from "./cover";

/**
 * Story 4.2 (FR56, brief line 6): which cover stops shots. One mechanic per test (no wave director;
 * zombies stand still). Shots use the Hunting Rifle (no spread, pierce 5: a stop at cover is the
 * cover's doing, not the pierce running out) with mouse aim (no assist) unless a test says otherwise.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const EPS = 1e-4;

/** The open street with one cover object of `kind` (active from stage `minStage`). */
function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }, minStage = 1): DistrictMap {
  const c: CoverObject = { name: `test_${kind}`, kind, minStage, ...box };
  return { ...PLACEHOLDER_MAP, name: "cover-test", cover: [c] };
}

const fireInput = (seq: number, aimX: number, aimY: number, isMouse = true): PlayerInput => ({ ...NEUTRAL_INPUT, seq, aimX, aimY, fire: true, isMouse });

interface ShotRun {
  world: World;
  hits: number;
  fired: number;
  /** Furthest x any projectile of the shot reached (alive after a tick). */
  maxX: number;
}

/** p0 at (10, 16) fires one rifle shot east at a zombie at (zx, 16); ticks until the projectile is gone. */
function shootEast(map: DistrictMap, zx: number): ShotRun {
  const world = createWorld({ balance, seed: 1, map, systems: STILL });
  addPlayer(world, "p0", 10, 16);
  const p = world.players.get("p0");
  if (!p) throw new Error("no p0");
  setLoadout(balance, p.loadout, ["hunting_rifle", null]);
  const zid = spawnZombie(world, "walker", zx, 16);
  world.zombies.hp[zid] = 1e6;
  let hits = 0;
  let fired = 0;
  world.events.subscribe((e: SimEvent) => {
    if (e.type === "zombie.hit" && e.zombieId === zid) hits++;
    if (e.type === "weapon.fired") fired++;
  });
  setInput(world, "p0", fireInput(1, 1, 0));
  step(world, TICK_DT_S);
  setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 2 });
  let maxX = 0;
  for (let t = 0; t < 40 && (t === 0 || world.projectiles.aliveCount > 0); t++) {
    const pool = world.projectiles;
    for (let i = 0; i < pool.aliveCount; i++) maxX = Math.max(maxX, pool.x[pool.aliveIds[i] as number] as number);
    step(world, TICK_DT_S);
  }
  return { world, hits, fired, maxX };
}

/** A 2 m thick box between the shooter (x 10) and the zombie (x 16). */
const BETWEEN = { minX: 12, minY: 15, maxX: 14, maxY: 17 };
/**
 * A 0.5 m box with a zombie (x 12.5) right behind it: the shot's first 3 m sweep (muzzle x 10.5 →
 * 13.5) crosses the box AND the zombie, so only the "hit before the entry point" rule saves it.
 */
const THIN = { minX: 11, minY: 15, maxX: 11.5, maxY: 17 };

describe("segmentBoxEntryT (Story 4.2)", () => {
  it("entry, start inside, start on a face moving in = 0; grazing, moving out, short of the box = -1", () => {
    expect(segmentBoxEntryT(0, 0.5, 10, 0, 2, 0, 3, 1)).toBeCloseTo(0.2, 9);
    expect(segmentBoxEntryT(2.5, 0.5, 10, 0, 2, 0, 3, 1)).toBe(0);
    expect(segmentBoxEntryT(2, 0.5, 1, 0, 2, 0, 3, 1)).toBe(0);
    expect(segmentBoxEntryT(0, 0, 10, 0, 2, 0, 3, 1)).toBe(-1); // along the face y = 0
    expect(segmentBoxEntryT(0, 1, 4, -2, 2, 0, 3, 1)).toBe(-1); // touches the corner (2, 0) only
    expect(segmentBoxEntryT(3, 0.5, 1, 0, 2, 0, 3, 1)).toBe(-1); // on the far face moving out
    expect(segmentBoxEntryT(0, 0.5, 1.9, 0, 2, 0, 3, 1)).toBe(-1); // stops short
  });

  it("swept: a step far longer than the box still enters it (no tunnelling through a 0.5 m car in one tick)", () => {
    const world = createWorld({ balance, seed: 1, map: mapWith("car", { minX: 20, minY: 15, maxX: 20.5, maxY: 17 }), systems: STILL });
    expect(shotBlockT(world, 10, 16, 40, 16)).toBeCloseTo(10 / 30, 9);
    // A shot at 2000 m/s (100 m per tick, capped by its 30 m range): one sweep from x 10 to x 40.
    const zid = spawnZombie(world, "walker", 30, 16);
    let hits = 0;
    world.events.subscribe((e) => {
      if (e.type === "zombie.hit") hits++;
    });
    const id = spawnProjectile(world.projectiles, { x: 10, y: 16, dirX: 1, dirY: 0, speedMps: 2000, rangeM: 30, damage: 1, pierce: 5, weaponIndex: 0, owner: "p0", advanceM: 0 });
    step(world, TICK_DT_S);
    expect(world.projectiles.alivePos[id]).toBe(-1);
    expect(world.projectiles.x[id]).toBeCloseTo(20, 4); // stopped on the car's face
    expect(hits).toBe(0);
    expect(world.zombies.hp[zid]).toBeGreaterThan(0);
  });
});

describe("cover vs projectiles, per kind (Story 4.2 AC 3)", () => {
  for (const kind of COVER_KINDS) {
    const stops = kind === "car" || kind === "bus";
    it(`${kind}: ${stops ? "stops the shot at its face; the zombie behind it is not hit" : "the shot passes over it and hits the zombie behind"}`, () => {
      for (const [box, zx] of [
        [BETWEEN, 16],
        [THIN, 12.5],
      ] as const) {
        const r = shootEast(mapWith(kind, box), zx);
        expect(r.fired).toBe(1); // liveness: a shot really flew
        if (stops) {
          expect(r.hits).toBe(0);
          expect(r.maxX).toBeLessThanOrEqual(box.minX + EPS);
        } else {
          expect(r.hits).toBe(1);
          expect(r.maxX).toBeGreaterThan(box.maxX);
        }
      }
    });
  }

  it("a zombie in front of the car is still hit (only what is behind the entry point is covered)", () => {
    const r = shootEast(mapWith("car", BETWEEN), 11.5);
    expect(r.hits).toBe(1);
  });

  it("inactive cover (minStage 2 at stage 1) stops nothing; the stage override makes the same car stop the shot", () => {
    const map = mapWith("car", BETWEEN, 2);
    expect(shootEast(map, 16).hits).toBe(1);
    const world = createWorld({ balance, seed: 1, map, systems: STILL });
    expect(applyDecayStage(world, 2, world.decay.variants)).toBe(true);
    expect(shotBlockT(world, 10, 16, 16, 16)).toBeGreaterThan(0);
  });

  it("map collision boxes (city buildings) stop shots too (decision D3); barricades do not", () => {
    const solid = { ...PLACEHOLDER_MAP, name: "solid-test", solids: [{ name: "wall", ...BETWEEN }] };
    expect(shootEast(solid, 16).hits).toBe(0);
    // A wood barricade on the same spot: the shot flies over it (Story 3.4 rule, unchanged).
    const world = createWorld({ balance, seed: 1, systems: STILL });
    addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 24, gy: 30, rot: 1, hp: 200 });
    expect(shotBlockT(world, 10, 16, 16, 16)).toBe(-1);
  });

  it("a turret's shot stops at a car, and a turret never targets a zombie behind one (it takes the visible one)", () => {
    const world = createWorld({ balance, seed: 1, map: mapWith("car", { minX: 14, minY: 15, maxX: 16, maxY: 17 }), systems: STILL });
    addPlayer(world, "p0", 5, 5);
    startBuild(world);
    startWave(world);
    const b = addBuildingAt(world, { id: 1, type: "auto_turret", ownerId: "p0", gx: 22, gy: 31, rot: 0, hp: 300 }) as Building; // centre (11.5, 16)
    const cx = buildingCentreX(b);
    const hidden = spawnZombie(world, "walker", cx + 5.5, 16); // 5.5 m east, behind the car
    const visible = spawnZombie(world, "walker", cx - 7, 16); // 7 m west, in the open
    world.zombies.hp[hidden] = 1e6;
    world.zombies.hp[visible] = 1e6;
    const z = world.zombies;
    rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
    expect(nearestZombieInRange(world, cx, 16, 8)).toBe(visible);
    let hiddenHits = 0;
    let visibleHits = 0;
    let shots = 0;
    world.events.subscribe((e) => {
      if (e.type === "zombie.hit" && e.zombieId === hidden) hiddenHits++;
      if (e.type === "zombie.hit" && e.zombieId === visible) visibleHits++;
      if (e.type === "turret.fired") shots++;
    });
    for (let t = 0; t < 40; t++) step(world, TICK_DT_S);
    expect(shots).toBeGreaterThan(5); // liveness
    expect(visibleHits).toBeGreaterThan(5);
    expect(hiddenHits).toBe(0);
    // A turret-tagged projectile fired straight at the hidden one stops on the car.
    spawnProjectile(world.projectiles, { x: cx, y: 16, dirX: 1, dirY: 0, speedMps: 40, rangeM: 8, damage: 3, pierce: 1, weaponIndex: 0, owner: "p0", advanceM: 0, building: 1, pushbackM: 0 });
    for (let t = 0; t < 10; t++) step(world, TICK_DT_S);
    expect(hiddenHits).toBe(0);
  });

  it("melee ignores cover: a machete swing hits a zombie on the far side of a thin car within reach", () => {
    const world = createWorld({ balance, seed: 1, map: mapWith("car", { minX: 10.5, minY: 15, maxX: 11, maxY: 17 }), systems: STILL });
    addPlayer(world, "p0", 10, 16);
    const p = world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["machete", null]);
    const zid = spawnZombie(world, "walker", 11.5, 16); // edge 1.15 m from the player's centre (reach 1.8 m)
    let hits = 0;
    world.events.subscribe((e) => {
      if (e.type === "zombie.hit" && e.zombieId === zid) hits++;
    });
    expect(shotBlockT(world, 10, 16, 11.5, 16)).toBeGreaterThanOrEqual(0); // the car really is in between
    setInput(world, "p0", fireInput(1, 1, 0));
    step(world, TICK_DT_S);
    expect(hits).toBe(1);
  });
});

describe("aim assist respects cover (Story 4.2 AC 5)", () => {
  // Car x 14–16 straddling the aim line y = 16; muzzle O = (10, 16) aiming east.
  const CAR = { minX: 14, minY: 15.5, maxX: 16, maxY: 16.5 };
  const setup = (withCar: boolean) => {
    const world = createWorld({ balance, seed: 1, map: withCar ? mapWith("car", CAR) : PLACEHOLDER_MAP, systems: STILL });
    return world;
  };
  const grid = (world: World) => {
    const z = world.zombies;
    rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
  };
  const out = { x: 0, y: 0 };
  const a = (5 * Math.PI) / 180;

  it("never bends a shot toward a zombie behind a car", () => {
    for (const withCar of [false, true]) {
      const world = setup(withCar);
      const zid = spawnZombie(world, "walker", 10 + Math.cos(a) * 7, 16 + Math.sin(a) * 7); // 5° off, behind the car
      grid(world);
      expect(assistAim(world, 10, 16, 1, 0, 17, out)).toBe(withCar ? -1 : zid);
    }
  });

  it("the raw aim 'already hits' only a zombie before the car: behind it, the assist takes a visible one", () => {
    for (const withCar of [false, true]) {
      const world = setup(withCar);
      spawnZombie(world, "walker", 18, 16); // on the raw line, behind the car
      const b = (-7 * Math.PI) / 180;
      const visible = spawnZombie(world, "walker", 10 + Math.cos(b) * 3, 16 + Math.sin(b) * 3); // 7° off, in front of the car
      grid(world);
      expect(assistAim(world, 10, 16, 1, 0, 17, out)).toBe(withCar ? visible : -1);
    }
  });
});

describe("player-visible properties on Downtown (Story 4.2, brief line 10)", () => {
  /** p0 at (px, py) fires the rifle along (ax, ay) for `s` seconds at a zombie at (zx, zy); returns its hits. */
  function volley(px: number, py: number, zx: number, zy: number, s: number, stage = 1): { hits: number; fired: number } {
    const world = createWorld({ balance, seed: 3, map: DOWNTOWN_MAP, systems: STILL });
    if (stage !== 1) {
      applyDecayStage(world, stage, world.decay.variants);
    }
    addPlayer(world, "p0", px, py);
    const p = world.players.get("p0");
    if (!p) throw new Error("no p0");
    setLoadout(balance, p.loadout, ["hunting_rifle", null]);
    const zid = spawnZombie(world, "walker", zx, zy);
    world.zombies.hp[zid] = 1e6;
    let hits = 0;
    let fired = 0;
    world.events.subscribe((e) => {
      if (e.type === "zombie.hit" && e.zombieId === zid) hits++;
      if (e.type === "weapon.fired") fired++;
    });
    const d = Math.hypot(zx - px, zy - py);
    for (let t = 0; t < s / TICK_DT_S; t++) {
      setInput(world, "p0", fireInput(t + 1, (zx - px) / d, (zy - py) / d));
      step(world, TICK_DT_S);
    }
    return { hits, fired };
  }

  it("you can't shoot a zombie through the bus (but you can from beside it)", () => {
    const through = volley(35, 18.5, 35, 12.5, 3); // bus [30, 40] × [14.5, 17] in between
    expect(through.fired).toBeGreaterThan(1); // liveness: shots really flew
    expect(through.hits).toBe(0);
    const beside = volley(28.5, 18.5, 28.5, 12.5, 3);
    expect(beside.hits).toBeGreaterThan(0);
  });

  it("you can't shoot a zombie through a parked car", () => {
    const r = volley(13, 25, 13, 31, 3); // parked_car_1 [11.5, 13.5] × [26, 30.5]
    expect(r.fired).toBeGreaterThan(1);
    expect(r.hits).toBe(0);
  });

  it("bullets fly over the sandbags (stage 3) and the police barrier (stage 2)", () => {
    expect(volley(24, 25, 24, 20.5, 2, 3).hits).toBeGreaterThan(0); // sandbags_south [22.5, 25.5] × [22.5, 23.5]
    expect(volley(24, 8, 24, 3.5, 2, 2).hits).toBeGreaterThan(0); // police_barrier_north [21, 27] × [6, 6.5]
  });

  it("you can't shoot through an apartment block either (decision D3)", () => {
    const r = volley(9.5, 5, 19, 5, 2); // alley 1 → east across nw_apartments [11, 18] × [0, 10]
    expect(r.fired).toBeGreaterThan(1);
    expect(r.hits).toBe(0);
  });
});

// Story 4.2 AC 3: rewound shots (2.12) are tested in apps/server/src/run/coverRewind.test.ts (they need the RunController's view ticks).
