import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { COVER_KINDS, type CoverKind, type DistrictMap, type MapBox } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { applyDecayStage } from "../decay/applyDecayStage";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { spotBlocked } from "../player/freeSpot";
import { spawnZombie } from "../zombies/zombiePool";
import { flowCellAt } from "../zombies/flowField";
import { circleOverlapsBox, segmentHitsBuildings } from "./collision";
import { buildingStats, footprint, footprintBlocked, type Box } from "./buildings";

/**
 * Story 4.2 (FR56): every cover kind blocks bodies (players, zombies, the push-out, free spots,
 * placement) and is a wall in the flow field; inactive cover (minStage above the stage) blocks nothing.
 */
const noop: SystemFn = () => {};
const balance = loadBalance();
const R = balance.player.radiusM;
const BOX = { minX: 12, minY: 14, maxX: 14, maxY: 18 };
/** Overlap tolerances: players float64 (push-out STUCK_EPS_M), zombies Float32. */
const PLAYER_EPS = 1e-6;
const ZOMBIE_EPS = 1e-5;

function mapWith(kind: CoverKind, minStage = 1, box = BOX): DistrictMap {
  return { ...PLACEHOLDER_MAP, name: "cover-move", cover: [{ name: `test_${kind}`, kind, minStage, ...box }] };
}

/** p0 starts at (10, 16) and walks east for 2 s; returns its x and whether it ever overlapped the box. */
function walkEast(map: DistrictMap): { x: number; overlapped: boolean } {
  const world = createWorld({ balance, seed: 1, map, systems: { waves: noop, zombies: noop } });
  addPlayer(world, "p0", 10, 16);
  const p = world.players.get("p0");
  if (!p) throw new Error("no p0");
  let overlapped = false;
  for (let t = 0; t < 40; t++) {
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1, moveX: 1, moveY: 0 });
    step(world, TICK_DT_S);
    if (circleOverlapsBox(p.x, p.y, R - PLAYER_EPS, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY)) overlapped = true;
  }
  return { x: p.x, overlapped };
}

/** A god-mode player at (17, 16) behind the box, a Walker at (8, 16) in front: it must go round. */
function chaseAround(map: DistrictMap, seconds: number): { reachedS: number; inside: boolean; world: World } {
  const world = createWorld({ balance, seed: 2, map, systems: { waves: noop } });
  world.debug.godMode = true;
  addPlayer(world, "p0", 17, 16);
  const p = world.players.get("p0");
  if (!p) throw new Error("no p0");
  const zid = spawnZombie(world, "walker", 8, 16);
  const rz = balance.zombies.types.walker?.radiusM ?? 0;
  const z = world.zombies;
  let inside = false;
  for (let t = 0; t < seconds / TICK_DT_S; t++) {
    step(world, TICK_DT_S);
    const x = z.x[zid] as number;
    const y = z.y[zid] as number;
    for (const c of world.obstacles.solids) if (circleOverlapsBox(x, y, rz - ZOMBIE_EPS, c.minX, c.minY, c.maxX, c.maxY)) inside = true;
    if (Math.hypot(x - p.x, y - p.y) <= rz + R + 0.1) return { reachedS: (t + 1) * TICK_DT_S, inside, world };
  }
  return { reachedS: Infinity, inside, world };
}

describe("cover vs movement, per kind (Story 4.2 AC 1)", () => {
  for (const kind of COVER_KINDS) {
    it(`${kind}: the survivor stops at its face, a zombie walks round it (never through) and reaches the player`, () => {
      const walk = walkEast(mapWith(kind));
      expect(walk.overlapped).toBe(false);
      expect(walk.x).toBeCloseTo(BOX.minX - R, 6);
      const chase = chaseAround(mapWith(kind), 20);
      expect(chase.inside).toBe(false);
      expect(chase.reachedS).toBeLessThan(20); // liveness: it really came
      expect(chase.reachedS).toBeGreaterThan(9 / 1.2); // and the straight 9 m would take 7.5 s: it went round
    });
  }

  it("inactive cover (minStage 2 at stage 1) blocks nothing: the survivor walks straight through", () => {
    const walk = walkEast(mapWith("barrier", 2));
    expect(walk.x).toBeGreaterThan(BOX.maxX);
  });

  it("placement, free spots and the flow field: active cover refuses / walls; inactive cover does not", () => {
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    footprint(stats, 24, 30, 0, box); // [12, 14] × [15, 15.5]: inside BOX
    for (const kind of COVER_KINDS) {
      const active = createWorld({ balance, seed: 1, map: mapWith(kind) });
      const inactive = createWorld({ balance, seed: 1, map: mapWith(kind, 3) });
      expect(footprintBlocked(active, box), kind).toBe(true);
      expect(footprintBlocked(inactive, box), kind).toBe(false);
      expect(spotBlocked(active, 13, 16, R, null), kind).toBe(true);
      expect(spotBlocked(inactive, 13, 16, R, null), kind).toBe(false);
      expect(active.pathing.nav.wallAt[flowCellAt(active.pathing.nav, 13, 16)], kind).toBe(1);
      expect(inactive.pathing.nav.wallAt[flowCellAt(inactive.pathing.nav, 13, 16)], kind).toBe(0);
      expect(segmentHitsBuildings(active, 10, 16, 16, 16, 0), kind).toBe(true); // zombies' line of sight
      // Flush against the face is fine (touching is not overlapping, as with map boxes).
      footprint(stats, 20, 30, 0, box); // [10, 12] × [15, 15.5]
      expect(footprintBlocked(active, box), kind).toBe(false);
      footprint(stats, 24, 30, 0, box);
    }
  });

  it("a car that appears under a standing survivor (dev stage change) pushes it out on its next move", () => {
    const world = createWorld({ balance, seed: 1, map: mapWith("sandbags", 3), systems: { waves: noop, zombies: noop } });
    addPlayer(world, "p0", 12.6, 16);
    const p = world.players.get("p0");
    if (!p) throw new Error("no p0");
    applyDecayStage(world, 3, world.decay.variants);
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1, moveX: 0, moveY: 0 });
    step(world, TICK_DT_S);
    expect(circleOverlapsBox(p.x, p.y, R - PLAYER_EPS, BOX.minX, BOX.minY, BOX.maxX, BOX.maxY)).toBe(false);
  });
});

describe("player-visible properties on Downtown (Story 4.2, brief line 10)", () => {
  /** God-mode player at (px, py); Walkers at the given spots; real systems but no wave director. */
  function reach(px: number, py: number, from: readonly (readonly [number, number])[], seconds: number, stage = 1) {
    const world = createWorld({ balance, seed: 7, map: DOWNTOWN_MAP, systems: { waves: noop } });
    world.debug.godMode = true;
    if (stage !== 1) {
      applyDecayStage(world, stage, world.decay.variants);
    }
    addPlayer(world, "p0", px, py);
    const p = world.players.get("p0");
    if (!p) throw new Error("no p0");
    const ids = from.map(([x, y]) => spawnZombie(world, "walker", x, y));
    const rz = balance.zombies.types.walker?.radiusM ?? 0;
    const z = world.zombies;
    const reached = new Set<number>();
    let inside: string | null = null;
    for (let t = 0; t < seconds / TICK_DT_S && reached.size < ids.length; t++) {
      step(world, TICK_DT_S);
      for (const id of ids) {
        const x = z.x[id] as number;
        const y = z.y[id] as number;
        for (const c of world.obstacles.solids) if (circleOverlapsBox(x, y, rz - ZOMBIE_EPS, c.minX, c.minY, c.maxX, c.maxY)) inside = c.name;
        if (Math.hypot(x - p.x, y - p.y) <= rz + R + 0.3) reached.add(id);
      }
      // The crowd (as in the Downtown fuzz): one pressed against a zombie that reached you has too
      // (a 1 m slot between two cars holds one body abreast).
      for (const a of ids) {
        if (reached.has(a)) continue;
        for (const b of ids) {
          if (reached.has(b) && Math.hypot((z.x[a] as number) - (z.x[b] as number), (z.y[a] as number) - (z.y[b] as number)) <= 2 * rz + 0.3) reached.add(a);
        }
      }
    }
    return { reached: reached.size, inside };
  }

  it("zombies path around the parked cars and still reach you hiding between them", () => {
    // Between parked_car_1 [11.5, 13.5] and parked_car_2 [14.5, 16.5] (y 26–30.5): a 1 m slot.
    const r = reach(14, 28, [[24, 16], [24, 30], [6, 16]], 40);
    expect(r.inside).toBeNull();
    expect(r.reached).toBe(3);
  });

  it("zombies path around the bus and the street cars and still reach you", () => {
    expect(reach(35, 18.5, [[35, 12.5], [44, 12]], 30)).toEqual({ reached: 2, inside: null }); // north of the bus → south of it
    expect(reach(6, 17, [[6, 11]], 30)).toEqual({ reached: 1, inside: null }); // round street_car_west [4, 8.5] × [13, 15]
  });

  it("at stage 3 zombies come round the sandbags and the barrier (bodies only)", () => {
    expect(reach(24, 24.5, [[24, 20.5]], 30, 3)).toEqual({ reached: 1, inside: null }); // sandbags [22.5, 25.5] × [22.5, 23.5]
    expect(reach(24, 7.5, [[24, 4]], 30, 3)).toEqual({ reached: 1, inside: null }); // barrier [21, 27] × [6, 6.5]
  });

  it("the survivor can't walk through a parked car (stops at its face)", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: noop, zombies: noop } });
    addPlayer(world, "p0", 12.5, 24.5);
    const p = world.players.get("p0");
    if (!p) throw new Error("no p0");
    for (let t = 0; t < 40; t++) {
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1, moveX: 0, moveY: 1 });
      step(world, TICK_DT_S);
    }
    const car = DOWNTOWN_MAP.cover.find((c) => c.name === "parked_car_1") as MapBox;
    expect(p.y).toBeCloseTo(car.minY - R, 6);
  });
});
