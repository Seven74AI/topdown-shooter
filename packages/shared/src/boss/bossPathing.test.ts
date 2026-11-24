import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { createWorld, setInput, step } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { flowCellAt, snapshotPathing } from "../zombies/flowField";
import { BOSS_STATE } from "./bossState";
import { ticksFor } from "../core/time";
import { recordBossThreat } from "./target";
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

  it("a target in a pocket it can't reach at all (the north-west alley): it walks to the nearest spot it can reach (never stands forever, never clips)", () => {
    const w = setup();
    addPlayer(w, "p0", 9.5, 4);
    placeBoss(w, 34, 12);
    noAttacks(w);
    const d0 = Math.hypot(34 - 9.5, 12 - 4);
    let moved = 0;
    for (let t = 0; t < 30 * 20; t++) {
      const x = w.boss.x;
      tickN(w);
      moved += Math.abs(w.boss.x - x);
      expect(inBox(w.boss.x, w.boss.y, R, w.obstacles.solids)).toBe(false);
    }
    expect(w.pathing.bossChase.seedFar).toBe(true); // the fallback took over
    expect(moved).toBeGreaterThan(3);
    expect(Math.hypot(w.boss.x - 9.5, w.boss.y - 4)).toBeLessThan(d0 - 3); // closer than it started
  });

  it("review H1: hide in an unreachable alley, then come out: the fallback lets go and the boss reaches you (no latched dumb field)", () => {
    const w = setup();
    const p = addPlayer(w, "p0", 9.5, 4); // the NW alley: no 4 m body gets near
    placeBoss(w, 34, 12);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    let sawFar = false;
    for (let t = 0; t < 10 * 20; t++) {
      tickN(w);
      if (w.pathing.bossChase.frontFar) sawFar = true;
    }
    expect(sawFar).toBe(true);
    // Out into the open street, far from where the boss waited.
    for (const [tx, ty] of [
      [16, 22],
      [24, 26],
      [44, 16],
    ] as const) {
      p.x = tx;
      p.y = ty;
      let reached = -1;
      for (let t = 0; t < 30 * 20 && reached < 0; t++) {
        tickN(w);
        if (Math.hypot(p.x - w.boss.x, p.y - w.boss.y) <= R + p.radiusM + balance.boss.slam.triggerM) reached = t;
      }
      expect(reached, `to ${tx},${ty}`).toBeGreaterThanOrEqual(0);
      expect(w.pathing.bossChase.frontFar).toBe(false);
    }
  });

  it("review H1: the fallback seeds by walking distance — the boss ends walking-closer to an unreachable target than it started", () => {
    const w = setup();
    addPlayer(w, "p0", 9.5, 4); // the NW alley
    placeBoss(w, 34, 12);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    tickN(w, 30);
    const nav = w.pathing.nav;
    const startD = w.pathing.farDist[flowCellAt(nav, 34, 12)] as number;
    tickN(w, 40 * 20);
    expect(w.pathing.bossChase.frontFar || w.pathing.bossChase.seedFar).toBe(true);
    const endD = w.pathing.farDist[flowCellAt(nav, w.boss.x, w.boss.y)] as number;
    expect(startD).toBeGreaterThan(0);
    expect(endD).toBeGreaterThanOrEqual(0);
    expect(endD).toBeLessThan(startD - 10); // ≥ 5 m closer by the paths a survivor takes
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

  it("bodyPushZombies (off by default: zombies walk under it); on: zombies overlapping its body are pushed out of it (the boss never is)", () => {
    expect(balance.boss.bodyPushZombies).toBe(false);
    const raw = withOverrides(bundledBalanceFiles(), []);
    (raw.boss as { bodyPushZombies: boolean }).bodyPushZombies = true;
    const on = loadBalance(raw);
    const w = createWorld({ balance: on, seed: 11, systems: { waves: () => {} } });
    w.debug.godMode = true;
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

describe("Story 6.5 review L6: pinned between the boss and a wall", () => {
  it("a survivor pressed against a map box by the walking boss never ends a tick inside its body (or the box)", () => {
    const w = setup();
    // The city bus (30–40 × 14.5–17): the survivor against its north face, the boss coming from the north.
    const p = addPlayer(w, "p0", 35, 14.5 - balance.player.radiusM);
    placeBoss(w, 35.3, 8);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    let worst = Infinity;
    for (let t = 0; t < 20 * 20; t++) {
      tickN(w);
      worst = Math.min(worst, Math.hypot(p.x - w.boss.x, p.y - w.boss.y) - (R + p.radiusM));
      expect(inBox(p.x, p.y, p.radiusM, w.obstacles.solids)).toBe(false);
    }
    expect(worst).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe("Story 6.5 review M-new-1: survivors never freeze it", () => {
  /** The boss walks east along the open street toward a far target; returns its progress in `seconds`. */
  function progress(seconds: number, tank: "none" | "dodge" | "flank"): number {
    const w = createWorld({ balance, seed: 3, systems: { waves: () => {} } });
    w.debug.godMode = true;
    const target = addPlayer(w, "p0", 46, 16);
    placeBoss(w, 4, 16);
    const t = tank === "none" ? null : addPlayer(w, "p1", 4 + R + 0.4, tank === "flank" ? 16 + R + 0.4 : 16);
    let x0 = Number.NaN;
    for (let i = 0; i < seconds * 20; i++) {
      recordBossThreat(w, "p0", 1000); // the target stays p0; the tank is never targeted
      if (t && tank === "dodge") {
        if (w.boss.state === BOSS_STATE.TELEGRAPH) {
          t.x = w.boss.attack.cx + 4.8; // dodge every slam…
          t.y = 16;
        } else {
          t.x = w.boss.x + R + t.radiusM; // …and step straight back into its face
          t.y = 16;
        }
      }
      tickN(w);
      if (Number.isNaN(x0)) x0 = w.boss.x;
      if (t) expect(Math.hypot(t.x - w.boss.x, t.y - w.boss.y)).toBeGreaterThanOrEqual(R + t.radiusM - 1e-6);
      expect(target.status).toBe("alive");
    }
    return w.boss.x - x0;
  }

  it("a non-target 'tank' who dodges every slam and steps back into its face: it keeps walking (pushes the tank)", () => {
    const free = progress(20, "none");
    const tanked = progress(20, "dodge");
    expect(free).toBeGreaterThan(20);
    // Each slam the tank draws stands it still for the 1.2 s telegraph + 0.8 s recovery (by design: any
    // survivor in 4 m triggers it); beyond that the tank never stops it.
    expect(tanked).toBeGreaterThan(0.55 * free);
  });

  it("a survivor touching its flank doesn't freeze it: it walks on and pushes them aside", () => {
    const flank = progress(10, "flank");
    expect(flank).toBeGreaterThan(5);
  });
});

describe("Story 6.5 review L-e: the fallback's rules", () => {
  function inFallback() {
    const w = setup();
    const p = addPlayer(w, "p0", 9.5, 4); // the NW alley
    placeBoss(w, 34, 12);
    noAttacks(w);
    w.boss.cooldown.slam = 1_000_000;
    for (let t = 0; t < 200 && !w.pathing.bossChase.seedFar; t++) tickN(w);
    expect(w.pathing.bossChase.seedFar).toBe(true);
    return { w, p };
  }

  it("a 1 m move of the target gives the normal field another try at once (before the 2 s retry)", () => {
    const { w, p } = inFallback();
    const since = w.boss.farSinceTick;
    tickN(w); // still in the fallback without a move
    expect(w.pathing.bossChase.seedFar).toBe(true);
    p.y += 1.2; // deeper in the alley: still unreachable, but it moved
    tickN(w);
    expect(w.pathing.bossChase.seedFar).toBe(false);
    expect(w.tick - since).toBeLessThan(ticksFor(balance.boss.pathing.fallbackRetryS));
  });

  it("the walking distance goes round walls (not the straight line)", () => {
    const { w } = inFallback();
    tickN(w, 40); // a fallback build ran its BFS from the target
    const nav = w.pathing.nav;
    const straight = Math.round((19.5 - 9.5) / nav.cellM); // 20 cells due east, through the apartments
    const walk = w.pathing.farDist[flowCellAt(nav, 19.5, 4)] as number;
    expect(walk).toBeGreaterThan(straight + 10); // out of the alley, round the block and back up
  });

  it("a second Behemoth starts with a clean field (resetBossField at its arrival)", () => {
    const { w } = inFallback();
    w.boss.state = BOSS_STATE.WARNING;
    w.boss.stateTicks = ticksFor(balance.boss.warningS) - 1;
    w.pathing.bossChase.seedFar = true;
    tickN(w); // it walks in again
    expect(w.boss.state).toBe(BOSS_STATE.WALK);
    expect(w.pathing.bossChase.seedFar).toBe(false);
  });
});
