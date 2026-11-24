import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { createWorld, setInput, step } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { snapshotPathing } from "../zombies/flowField";
import { BOSS_STATE } from "./bossState";
import { placeBoss, tickN } from "./testBoss";

/**
 * Story 6.5 (AC 6; DD2, D1, D8): the Behemoth's own grid and field, its body against players,
 * zombies and buildings.
 */
const balance = loadBalance();
const R = balance.boss.radiusM;
const NO_WAVES = { waves: () => {} };

function setup(map = DOWNTOWN_MAP) {
  const w = createWorld({ balance, seed: 11, systems: NO_WAVES, map });
  w.debug.godMode = true;
  return w;
}

const inBox = (x: number, y: number, r: number, boxes: readonly { minX: number; minY: number; maxX: number; maxY: number }[]) =>
  boxes.some((b) => circleOverlapsBox(x, y, r - 1e-6, b.minX, b.minY, b.maxX, b.maxY));

function noAttacks(w: ReturnType<typeof setup>) {
  w.boss.gapTicks = 1_000_000;
}

describe("Story 6.5 boss pathing (DD2)", () => {
  it("walks round the map's boxes to a player in the open (and never stands in a box)", () => {
    const w = setup();
    addPlayer(w, "p0", 24, 26); // south street, between the parked cars and the offices
    placeBoss(w, 24, 4); // north street end
    noAttacks(w);
    let reached = -1;
    for (let t = 0; t < 30 * 20 && reached < 0; t++) {
      tickN(w);
      expect(inBox(w.boss.x, w.boss.y, R, w.obstacles.solids)).toBe(false);
      if (Math.hypot(w.boss.x - 24, w.boss.y - 26) <= R + 0.4 + 0.1) reached = t;
    }
    expect(reached).toBeGreaterThan(0);
    expect(w.pathing.bossChase.rebuilds).toBeGreaterThan(0);
  });

  it("a 4 m body never routes into a 3 m alley: it waits at the nearest reachable spot", () => {
    // Alley 3 (x 38–41, y 22–32, between the offices and the warehouse) opens on the free south-east street.
    const w = setup();
    addPlayer(w, "p0", 39.5, 28);
    placeBoss(w, 27, 6);
    noAttacks(w);
    let minD = Infinity;
    for (let t = 0; t < 40 * 20; t++) {
      tickN(w);
      expect(inBox(w.boss.x, w.boss.y, R, w.obstacles.solids)).toBe(false);
      minD = Math.min(minD, Math.hypot(w.boss.x - 39.5, w.boss.y - 28));
    }
    expect(w.boss.y).toBeLessThanOrEqual(22 - R + 1e-6); // never inside the alley (its mouth is at y 22)
    expect(minD).toBeLessThan(10); // it came to the mouth
  });

  it("a target it can't reach at all (the north-west alley): it stands, never clips into a box", () => {
    const w = setup();
    addPlayer(w, "p0", 9.5, 4);
    placeBoss(w, 34, 12);
    noAttacks(w);
    for (let t = 0; t < 20 * 20; t++) {
      tickN(w);
      expect(inBox(w.boss.x, w.boss.y, R, w.obstacles.solids)).toBe(false);
    }
  });

  it("the boss field idles without a boss (no rebuilds, no share of the ticks)", () => {
    const w = createWorld({ balance, seed: 2, map: DOWNTOWN_MAP });
    w.debug.godMode = true;
    addPlayer(w, "p0", 24, 16);
    startBuild(w);
    tickN(w, 800);
    expect(w.run.phase).toBe("wave");
    expect(w.boss.state).toBe(BOSS_STATE.NONE);
    expect(w.pathing.bossChase.rebuilds).toBe(0);
    expect(w.pathing.bossActive).toBe(false);
  });

  it("the boss grid's walls change only at build starts (never mid-wave)", () => {
    const w = setup();
    addPlayer(w, "p0", 24, 26);
    placeBoss(w, 24, 4);
    noAttacks(w);
    const walls0 = Array.from(w.pathing.boss.wallAt).join("");
    for (let t = 0; t < 300; t++) {
      tickN(w);
      if (t === 100) addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 22 / BUILD_GRID_M, gy: 20 / BUILD_GRID_M, rot: 0, hp: 200 }); // a building: a cost, not a wall
    }
    expect(Array.from(w.pathing.boss.wallAt).join("")).toBe(walls0);
    expect(snapshotPathing(w.pathing).bossNavHash).toBeTypeOf("number");
  });
});

describe("Story 6.5 D8: barricades slow it, they don't stop it", () => {
  it("5 HP a tick to a barricade its body overlaps, 25 % speed until through", () => {
    const w = setup(createWorld({ balance, seed: 1 }).map); // the open placeholder street
    addPlayer(w, "p0", 40, 16);
    placeBoss(w, 20, 16);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    // A wall of wood barricades across the whole street (x 23–23.5, y 0–32): it must break through.
    for (let k = 0; k < 16; k++) addBuildingAt(w, { id: k + 1, type: "wood_barricade", ownerId: "p0", gx: 46, gy: k * 4, rot: 1, hp: 200 });
    expect(w.buildings.list).toHaveLength(16);
    let pushingTicks = 0;
    let x = w.boss.x;
    let slowSteps = 0;
    for (let t = 0; t < 400 && w.buildings.list.length === 16; t++) {
      tickN(w);
      if (w.boss.pushing) {
        pushingTicks++;
        const step = w.boss.x - x;
        if (pushingTicks > 1) {
          expect(Math.abs(step)).toBeLessThanOrEqual((balance.boss.speedMps * balance.boss.pathing.buildingSlowPct * TICK_DT_S) / 100 + 1e-9);
          expect(Math.abs(step)).toBeGreaterThan((balance.boss.speedMps * balance.boss.pathing.buildingSlowPct * TICK_DT_S) / 100 - 1e-3);
          slowSteps++;
        }
      }
      x = w.boss.x;
    }
    expect(w.buildings.list.length).toBeLessThan(16); // broken through
    expect(pushingTicks).toBe(200 / 5); // 200 HP at 5 a tick = 2 s (wood)
    expect(slowSteps).toBeGreaterThan(10);
  });
});

describe("Story 6.5 D1: its body pushes players out; zombies too", () => {
  it("a player walking into it stops at its edge (server and Predictor run the same movePlayers)", () => {
    const w = setup(createWorld({ balance, seed: 1 }).map);
    const p = addPlayer(w, "p0", 20, 16);
    placeBoss(w, 24, 16);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    for (let t = 0; t < 60; t++) {
      setInput(w, "p0", { ...NEUTRAL_INPUT, seq: t + 1, moveX: 1, moveY: 0 });
      step(w, TICK_DT_S);
      expect(Math.hypot(p.x - w.boss.x, p.y - w.boss.y)).toBeGreaterThanOrEqual(R + p.radiusM - 1e-6);
    }
  });

  it("an idle player it walks into is pushed out", () => {
    const w = setup(createWorld({ balance, seed: 1 }).map);
    const p = addPlayer(w, "p0", 24 + R + p0r() - 0.3, 16);
    placeBoss(w, 24, 16);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    tickN(w);
    expect(Math.hypot(p.x - w.boss.x, p.y - w.boss.y)).toBeGreaterThanOrEqual(R + p.radiusM - 1e-6);
  });

  it("zombies overlapping its body are pushed out of it (the boss never is)", () => {
    const w = setup(createWorld({ balance, seed: 1 }).map);
    addPlayer(w, "p0", 40, 16);
    placeBoss(w, 24, 16);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    const ids = [spawnZombie(w, "walker", 24.5, 16), spawnZombie(w, "walker", 23, 17)];
    tickN(w);
    const z = w.zombies;
    for (const id of ids) expect(Math.hypot((z.x[id] as number) - w.boss.x, (z.y[id] as number) - w.boss.y)).toBeGreaterThanOrEqual(R + 0.35 - 0.05);
  });
});

function p0r(): number {
  return balance.player.radiusM;
}
