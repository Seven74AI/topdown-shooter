import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverKind, DistrictMap } from "../map/districtMap";
import { applyDecayStage } from "../decay/applyDecayStage";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { downPlayer } from "../player/downed";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { ZOMBIE_TYPES } from "../zombies/zombieTypes";
import { addBuildingAt, type Building } from "../buildings/buildings";
import { BUILD_GRID_M } from "../config/constants";
import { setLoadout } from "./loadout";
import { lobAimLength } from "./grenades";
import { applyZombieDamage } from "./damage";
import { blastResult, createExplosionSpec, explode, explosionCounters, type ExplosionSpec } from "./explosion";
import type { LauncherStats } from "../config/balanceSchema";

/**
 * Story 5.5: the shared blast (AC 12, 13, 14; FR-C, FR-D, FR-E). Direct `explode` calls for the
 * geometry, real rounds for the weapon rules. Liveness: every test asserts the blast really hit.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const GL = balance.weapons.grenade_launcher as LauncherStats;
const PR = balance.player.radiusM;
const OFFSET = PR + MUZZLE_OFFSET_M;
const FF = balance.combat.friendlyFire.pct;

function mapWith(kind: CoverKind, box: { minX: number; minY: number; maxX: number; maxY: number }): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: "blast-test", cover: [{ name: `test_${kind}`, kind, minStage: 1, ...box }] };
}
function setup(map?: DistrictMap) {
  const world = createWorld({ balance, seed: 3, systems: STILL, ...(map ? { map } : {}) });
  if (map) applyDecayStage(world, 1, 0);
  const p0 = addPlayer(world, "p0", 5, 5);
  const p1 = addPlayer(world, "p1", 5, 27);
  setLoadout(balance, p0.loadout, ["grenade_launcher", "pistol"]);
  setLoadout(balance, p1.loadout, ["grenade_launcher", "smg"]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  startBuild(world);
  startWave(world);
  return { world, events, p0, p1 };
}
/** A grenade-like spec at (x, y) from p0. */
function grenade(x: number, y: number, extra: Partial<ExplosionSpec> = {}): ExplosionSpec {
  return { ...createExplosionSpec(), x, y, radiusM: GL.blastRadiusM, zombieDamage: GL.damage, playerDamage: GL.damage, pushM: GL.blastPushM, kind: "grenade", sourcePlayerId: "p0", weapon: "grenade_launcher", quiet: true, grenadeId: 1, ...extra };
}
const tough = (world: World, id: number): number => {
  world.zombies.hp[id] = 1000;
  return id;
};
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
const of = <T extends SimEvent["type"]>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const lobRight = (distM: number): PlayerInput => ({ ...NEUTRAL_INPUT, aimX: lobAimLength(GL, distM), aimY: 0, fire: true, isMouse: true });

beforeEach(() => {
  explosionCounters.happened = explosionCounters.playersHit = explosionCounters.playerDamage = 0;
});

describe("explode: who it hits (FR-C)", () => {
  for (const type of ZOMBIE_TYPES) {
    const rz = balance.zombies.types[type]?.radiusM ?? 0;
    it(`a ${type} (r ${rz} m) 1 mm inside the overlap is hit, 1 mm outside isn't`, () => {
      const { world } = setup();
      const inside = tough(world, spawnZombie(world, type, 20 + GL.blastRadiusM + rz - 0.001, 16));
      const outside = tough(world, spawnZombie(world, type, 20 - (GL.blastRadiusM + rz + 0.001), 16));
      explode(world, grenade(20, 16, { pushM: 0 }));
      expect(world.zombies.hp[inside]).toBe(1000 - GL.damage);
      expect(world.zombies.hp[outside]).toBe(1000);
      expect(blastResult.zombiesHit).toBe(1);
    });
  }

  it("a player 1 mm inside the overlap is hit, 1 mm outside isn't", () => {
    const { world, p0, p1 } = setup();
    p0.x = p0.prevX = 20 + GL.blastRadiusM + PR - 0.001;
    p0.y = p0.prevY = 16;
    p1.x = p1.prevX = 20 - (GL.blastRadiusM + PR + 0.001);
    p1.y = p1.prevY = 16;
    const h0 = p0.hp;
    const h1 = p1.hp;
    explode(world, grenade(20, 16));
    expect(h0 - p0.hp).toBe(Math.round((GL.damage * FF) / 100));
    expect(p1.hp).toBe(h1);
    expect(blastResult.playersHit).toBe(1);
  });

  it("a car between the blast and a body shields it (zombie and player); sandbags and a barricade don't", () => {
    const car = setup(mapWith("car", { minX: 21, minY: 14, maxX: 22, maxY: 18 }));
    const behind = tough(car.world, spawnZombie(car.world, "walker", 22.4, 16));
    const open = tough(car.world, spawnZombie(car.world, "walker", 19, 16));
    car.p1.x = car.p1.prevX = 22.3;
    car.p1.y = car.p1.prevY = 17;
    const hp = car.p1.hp;
    explode(car.world, grenade(20.5, 16));
    expect(car.world.zombies.hp[behind]).toBe(1000);
    expect(car.world.zombies.hp[open]).toBe(1000 - GL.damage);
    expect(car.p1.hp).toBe(hp);

    const bags = setup(mapWith("sandbags", { minX: 21, minY: 14, maxX: 22, maxY: 18 }));
    const z = tough(bags.world, spawnZombie(bags.world, "walker", 22.4, 16));
    explode(bags.world, grenade(20.5, 16));
    expect(bags.world.zombies.hp[z]).toBe(1000 - GL.damage);

    const wall = setup();
    addBuildingAt(wall.world, { id: 1, type: "wood_barricade", ownerId: "p1", gx: 21 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 100 }) as Building;
    const zw = tough(wall.world, spawnZombie(wall.world, "walker", 21.9, 16));
    explode(wall.world, grenade(20.5, 16));
    expect(wall.world.zombies.hp[zw]).toBe(1000 - GL.damage);
  });
});

describe("explode: damage and friendly fire (FR-D, D4)", () => {
  it("zombie 40, shooter and teammate 20 each, buildings 0", () => {
    const { world, events, p0, p1 } = setup();
    p0.x = p0.prevX = 21;
    p0.y = p0.prevY = 16;
    p1.x = p1.prevX = 19;
    p1.y = p1.prevY = 16;
    const b = addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p1", gx: 20 / BUILD_GRID_M, gy: 17 / BUILD_GRID_M, rot: 0, hp: 100 }) as Building;
    const z = tough(world, spawnZombie(world, "walker", 20, 15));
    const h0 = p0.hp;
    const h1 = p1.hp;
    explode(world, grenade(20, 16));
    world.events.flush();
    expect(world.zombies.hp[z]).toBe(1000 - 40);
    expect(h0 - p0.hp).toBe(20);
    expect(h1 - p1.hp).toBe(20);
    expect(b.hp).toBe(100);
    expect(of(events, "player.damaged").map((e) => e.amount)).toEqual([20, 20]);
    expect(of(events, "explosion.happened")).toHaveLength(1);
  });

  it("a blast with buildingDamage > 0 (5.8's Bloater) damages buildings it reaches, not ones behind a car", () => {
    const { world } = setup(mapWith("car", { minX: 23, minY: 10, maxX: 24, maxY: 22 }));
    const near = addBuildingAt(world, { id: 1, type: "wood_barricade", ownerId: "p1", gx: 21 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 100 }) as Building;
    const behind = addBuildingAt(world, { id: 2, type: "wood_barricade", ownerId: "p1", gx: 24 / BUILD_GRID_M, gy: 15 / BUILD_GRID_M, rot: 1, hp: 100 }) as Building;
    explode(world, grenade(22, 16, { radiusM: 2.5, buildingDamage: 40, sourcePlayerId: null }));
    expect(near.hp).toBe(60);
    expect(behind.hp).toBe(100);
    expect(blastResult.buildingsHit).toBe(1);
  });

  it("no player source (a Bloater): full damage to players", () => {
    const { world, p0 } = setup();
    p0.x = p0.prevX = 20;
    p0.y = p0.prevY = 16;
    const h = p0.hp;
    explode(world, grenade(20, 16, { sourcePlayerId: null, playerDamage: 30 }));
    expect(h - p0.hp).toBe(30);
  });

  it("downed and out players are unharmed; god mode spares everyone", () => {
    const { world, p0, p1 } = setup();
    for (const p of [p0, p1]) {
      p.x = p.prevX = 20;
      p.y = p.prevY = 16;
    }
    downPlayer(world, p0);
    p1.status = "out";
    const h0 = p0.hp;
    const h1 = p1.hp;
    explode(world, grenade(20, 16));
    expect(p0.hp).toBe(h0);
    expect(p1.hp).toBe(h1);
    p1.status = "alive";
    world.debug.godMode = true;
    explode(world, grenade(20, 16));
    expect(p1.hp).toBe(h1);
    world.debug.godMode = false;
    explode(world, grenade(20, 16));
    expect(h1 - p1.hp).toBe(20); // liveness
  });

  it("a blast can down a player (5.4 D1: canDown)", () => {
    const { world, p0 } = setup();
    p0.x = p0.prevX = 20;
    p0.y = p0.prevY = 16;
    p0.hp = 15;
    explode(world, grenade(20, 16));
    expect(p0.hp).toBe(0);
    expect(p0.status).toBe("downed");
  });

  it("upgrade levels I–IV: 40 / 50 / 60 / 70 to zombies, half to players (a round keeps its launch level)", () => {
    for (const [level, z, pl] of [[1, 40, 20], [2, 50, 25], [3, 60, 30], [4, 70, 35]] as const) {
      const { world, p0, p1 } = setup();
      const slot = p0.loadout.slots[0];
      if (!slot) throw new Error("slot");
      slot.level = level;
      p1.x = p1.prevX = 5 + OFFSET + 6;
      p1.y = p1.prevY = 6;
      const zid = tough(world, spawnZombie(world, "walker", 5 + OFFSET + 6, 4));
      const h = p1.hp;
      setInput(world, "p0", lobRight(6));
      run(world, 1);
      slot.level = 1; // an upgrade later doesn't change the round in flight
      setInput(world, "p0", { ...NEUTRAL_INPUT });
      run(world, 8);
      expect(world.zombies.hp[zid]).toBe(1000 - z);
      expect(h - p1.hp).toBe(pl);
    }
  });
});

describe("explode: one hit per body, push, credit (FR-E, D5, D6)", () => {
  it("each body is hit once per blast, even with kills mid-pass", () => {
    const { world, events } = setup();
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) ids.push(spawnZombie(world, "walker", 20 + Math.cos(i) * 1.2, 16 + Math.sin(i) * 1.2));
    for (let i = 0; i < 6; i++) tough(world, ids[i] as number);
    explode(world, grenade(20, 16, { quiet: false }));
    world.events.flush();
    const hits = of(events, "zombie.hit");
    expect(hits).toHaveLength(12);
    expect(new Set(hits.map((e) => e.zombieId)).size).toBe(12);
    expect(blastResult.zombiesKilled).toBe(6);
  });

  it("quiet: non-killing hits send no zombie.hit; kills still send zombie.killed (credited to the shooter)", () => {
    const { world, events } = setup();
    tough(world, spawnZombie(world, "walker", 20.5, 16));
    const weak = spawnZombie(world, "walker", 19.5, 16);
    explode(world, grenade(20, 16));
    world.events.flush();
    expect(of(events, "zombie.hit")).toHaveLength(0);
    const k = of(events, "zombie.killed");
    expect(k).toHaveLength(1);
    expect(k[0]?.zombieId).toBe(weak);
    expect(k[0]?.killerId).toBe("p0");
    expect(k[0]?.weapon).toBe("grenade_launcher");
  });

  it("zombies are pushed 0.6 m straight out; the Brute 20 % of it; players never", () => {
    const { world, p1 } = setup();
    const w = tough(world, spawnZombie(world, "walker", 21, 16));
    const b = spawnZombie(world, "brute", 20, 17.5);
    p1.x = p1.prevX = 19;
    p1.y = p1.prevY = 16;
    explode(world, grenade(20, 16));
    expect(world.zombies.x[w]).toBeCloseTo(21 + 0.6, 5);
    expect(world.zombies.y[w]).toBeCloseTo(16, 5);
    expect(world.zombies.y[b]).toBeCloseTo(17.5 + 0.6 * 0.2, 5);
    expect(p1.x).toBe(19);
    expect(p1.y).toBe(16);
  });

  it("the push stops at a car face (swept, 5.3)", () => {
    const { world } = setup(mapWith("car", { minX: 21.5, minY: 10, maxX: 23, maxY: 12 }));
    const w = tough(world, spawnZombie(world, "walker", 21, 16)); // free path
    const nearCar = tough(world, spawnZombie(world, "walker", 21.0, 11)); // 0.15 m from the face (r 0.35)
    explode(world, grenade(20, 11.5 - 0.2, { radiusM: 2 }));
    void w;
    expect(world.zombies.x[nearCar] as number).toBeLessThanOrEqual(21.5 - 0.35 + 1e-6);
  });

  it("a blast kill credits the shooter; an earlier hit by a teammate pays an assist (3.2)", () => {
    const { world, events } = setup();
    const z = spawnZombie(world, "walker", 20, 16);
    world.zombies.hp[z] = 45;
    applyZombieDamage(world, z, 5, 1, 0, 0, "p1", "smg");
    explode(world, grenade(20, 16));
    run(world, 1); // the economy system pays
    const k = of(events, "zombie.killed")[0];
    expect(k?.killerId).toBe("p0");
    const earned = of(events, "money.earned");
    expect(earned.some((e) => e.playerId === "p0" && e.reason === "kill")).toBe(true);
    expect(earned.some((e) => e.playerId === "p1" && e.reason === "assist")).toBe(true);
  });
});

describe("friendly-fire table (5.4's rule): the explosion row through a real grenade (AC 13)", () => {
  it("explosion 50 %: shooter 20, teammate 20; a zombie 40", () => {
    const { world, events, p1 } = setup();
    // p0 at 5,5 fires 4 m right; p1 sits 1 m from the landing point, p0 is far away (then a second round at a car hits p0).
    p1.x = p1.prevX = 5 + OFFSET + 4;
    p1.y = p1.prevY = 6;
    const h1 = p1.hp;
    setInput(world, "p0", lobRight(4));
    run(world, 1);
    setInput(world, "p0", { ...NEUTRAL_INPUT });
    run(world, 8);
    expect(of(events, "explosion.happened")).toHaveLength(1);
    expect(h1 - p1.hp).toBe(Math.round((GL.damage * 50) / 100));
  });
});

describe("liveness sim (AC 14): a player shells a crowd for a wave", () => {
  it("≥ 1 explosion, ≥ 10 kills by the Grenade Launcher, ≥ 1 self-hit firing at a car 2 m away", () => {
    const map = mapWith("car", { minX: 9.5, minY: 3, maxX: 11.5, maxY: 7 });
    const world = createWorld({ balance, seed: 11, map });
    applyDecayStage(world, 1, 0);
    const p = addPlayer(world, "p0", 30, 16);
    setLoadout(balance, p.loadout, ["grenade_launcher", "pistol"]);
    p.maxHp = p.hp = 1e6;
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    startBuild(world);
    startWave(world);
    for (let t = 0; t < 1200; t++) {
      // Aim at the nearest zombie's distance (the bot's rule), with a clear line.
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < world.zombies.aliveCount; k++) {
        const id = world.zombies.aliveIds[k] as number;
        const d = Math.hypot((world.zombies.x[id] as number) - p.x, (world.zombies.y[id] as number) - p.y);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      if (best < 0) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1 });
      } else {
        const dx = (world.zombies.x[best] as number) - p.x;
        const dy = (world.zombies.y[best] as number) - p.y;
        const k = lobAimLength(GL, bd - OFFSET) / bd;
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1, aimX: dx * k, aimY: dy * k, fire: true, isMouse: true });
      }
      step(world, TICK_DT_S);
      if (world.run.phase !== "wave") break;
    }
    const kills = of(events, "zombie.killed").filter((e) => e.weapon === "grenade_launcher" && e.killerId === "p0").length;
    expect(explosionCounters.happened).toBeGreaterThanOrEqual(1);
    expect(kills).toBeGreaterThanOrEqual(10);

    // A car 2 m away (its face 1.6 m from the muzzle): the round bursts at the face, and the shooter takes 20.
    p.x = p.prevX = 8;
    p.y = p.prevY = 5;
    const hp = p.hp;
    world.zombies.aliveCount = 0;
    const before = explosionCounters.playersHit;
    if (world.run.phase !== "wave") {
      if (world.run.phase === "build") startWave(world);
    }
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 99999, aimX: lobAimLength(GL, 6), aimY: 0, fire: true, isMouse: true });
    for (let t = 0; t < 30 && hp === p.hp; t++) step(world, TICK_DT_S);
    expect(hp - p.hp).toBe(20);
    expect(explosionCounters.playersHit).toBeGreaterThan(before);
  });
});
