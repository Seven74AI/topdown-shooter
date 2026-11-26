import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { createRng } from "../core/rng";
import type { SimEvent } from "../core/simEvents";
import { createWorld, type World } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { changeDecayStage, stageSealsUnresolved } from "../decay/decaySystem";
import type { DecayMutation, DistrictMap, MapBox } from "../map/districtMap";
import { DOWNTOWN_MAP } from "../map/downtown";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { addBuildingAt, blockReason, buildingStats, createBlockReason, footprint, footprintBlocked, placeBuilding, placementError, type Box, type BuildingRotation } from "./buildings";
import { escapeAreaOpen } from "./collision";
import { moveBuilding, moveError } from "./move";
import { inMainRegion, resetPathOpenCache, sealedPocket, verticesOutsideMainRegion } from "./pathOpen";

/** Story 12.1: buildings never close a path (no forts). */
const balance = loadBalance();
const R = balance.player.radiusM;
const PAD = { name: "evac_pad", kind: "evac_pad" as const, x: 24, y: 16, minStage: 1 };
const box = (name: string, minX: number, minY: number, maxX: number, maxY: number): MapBox => ({ name, minX, minY, maxX, maxY });
/** The open test street with an evac pad at its centre and these map solids. */
const openMap = (solids: MapBox[] = [], decay: DecayMutation[] = []): DistrictMap => ({ ...PLACEHOLDER_MAP, solids, decay, eventSpots: [PAD] });

let nextId = 1;
/** Build phase, 4 rich players far from every test spot (they never block a footprint). */
function setup(map: DistrictMap = openMap()): World {
  const world = createWorld({ balance, seed: 1, map, systems: { waves: () => {} } });
  for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 40 + i, 28).wallet = 100_000;
  startBuild(world);
  for (const p of world.players.values()) p.wallet = 100_000;
  return world;
}
const req = (type: string, x: number, y: number, rot = 0) => ({ type, gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot });
/** Adds a building with no checks (an old layout, or a piece the test doesn't judge). */
function put(world: World, type: string, x: number, y: number, rot: BuildingRotation = 0, owner = "old") {
  const stats = buildingStats(balance, type);
  if (!stats) throw new Error(type);
  const b = addBuildingAt(world, { id: nextId++, type, ownerId: owner, gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot, hp: stats.hp });
  if (!b) throw new Error(`${type} at (${x}, ${y})`);
  return b;
}
/** A wood ring round the 4 × 4 m inside [x0, x0 + 4] × [y0, y0 + 4], all but its last north piece (x0 + 2, y0 − 0.5). */
function ringMissingOne(world: World, x0: number, y0: number): void {
  put(world, "wood_barricade", x0, y0 - 0.5, 0);
  put(world, "wood_barricade", x0, y0 + 4, 0);
  put(world, "wood_barricade", x0 + 2, y0 + 4, 0);
  for (const dy of [-0.5, 1.5, 3.5]) {
    put(world, "wood_barricade", x0 - 0.5, y0 + dy, 1);
    put(world, "wood_barricade", x0 + 4, y0 + dy, 1);
  }
}
const scratchBox: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const wood = buildingStats(balance, "wood_barricade");
if (!wood) throw new Error("wood");

describe("Story 12.1: the rule (AC 2)", () => {
  it("a ring round the pad: the closing piece is refused (seals_path); with a 1 m gap it's allowed; with two 0.5 m gaps refused", () => {
    const world = setup();
    ringMissingOne(world, 22, 14); // the pad (24, 16) is inside
    expect(placementError(world, "p0", req("wood_barricade", 24, 13.5))).toBe("seals_path");
    // The highlight is the smaller side: the ring's inside (the pad's side), not the rest of the map.
    expect(sealedPocket.count).toBe(49);
    const r = placeBuilding(world, "p0", req("wood_barricade", 24, 13.5));
    expect(r.ok ? null : r.error).toBe("seals_path");
    // A turret (1 × 1) at x [24, 25] leaves [25, 26]: 1.0 m, a player (0.8 m) passes.
    expect(placementError(world, "p0", req("auto_turret", 24, 13))).toBe(null);
    // At x [24.5, 25.5] it leaves 0.5 m on each side: closed.
    expect(placementError(world, "p0", req("auto_turret", 24.5, 13))).toBe("seals_path");
  });

  it("a ring round a teammate away from the pad: the closing piece is refused, and the pocket is highlighted (CN-2)", () => {
    const world = setup();
    const mate = world.players.get("p1");
    if (!mate) throw new Error("p1");
    mate.x = mate.prevX = 8;
    mate.y = mate.prevY = 8;
    ringMissingOne(world, 6, 6);
    expect(placementError(world, "p0", req("wood_barricade", 8, 5.5))).toBe("seals_path");
    // The highlight: every pocket vertex is inside the ring, and the pocket is the whole 4 × 4 m inside at player clearance.
    expect(sealedPocket.count).toBeGreaterThan(0);
    for (let k = 0; k < sealedPocket.count; k++) {
      const v = sealedPocket.cells[k] as number;
      const x = (v % sealedPocket.cols) * sealedPocket.cellM;
      const y = Math.floor(v / sealedPocket.cols) * sealedPocket.cellM;
      expect(x > 6 && x < 10 && y > 6 && y < 10, `(${x}, ${y})`).toBe(true);
    }
    expect(sealedPocket.count).toBe(49); // the vertices 6.5 … 9.5 (0.4 m clearance inside [6, 10]): 7 × 7
  });

  it("a gap narrower than a player counts as closed: 0.7 m (a barricade against a map solid) refused, 0.9 m and 1.0 m allowed", () => {
    for (const [gap, want] of [
      [0.7, "seals_path"],
      [0.9, null],
      [1.0, null],
    ] as const) {
      // A map wall x [10 + gap, 14] closes the north side of a box [6, 14] × [6, 10] except the gap at x [10, 10 + gap].
      const world = setup(openMap([box("wall_n", 10 + gap, 5.5, 14.5, 6)]));
      put(world, "wood_barricade", 6, 10, 0);
      put(world, "wood_barricade", 8, 10, 0);
      put(world, "wood_barricade", 10, 10, 0);
      put(world, "wood_barricade", 12, 10, 0);
      for (const dy of [-0.5, 1.5, 3.5]) {
        put(world, "wood_barricade", 5.5, 6 + dy, 1);
        put(world, "wood_barricade", 14, 6 + dy, 1);
      }
      put(world, "wood_barricade", 6, 5.5, 0);
      // The last north piece [8, 10]: the gap left is [10, 10 + gap].
      expect(placementError(world, "p0", req("wood_barricade", 8, 5.5)), `gap ${gap} m`).toBe(want);
    }
  });

  it("walling a corner against the map edge is refused; against a map solid too", () => {
    const world = setup();
    // The north-east corner [45, 48] × [0, 4]: a west wall x [44.5, 45], then a south wall y [4, 4.5].
    put(world, "wood_barricade", 44.5, 0, 1);
    put(world, "wood_barricade", 44.5, 2, 1);
    put(world, "wood_barricade", 44, 4, 0);
    expect(placementError(world, "p0", req("wood_barricade", 46, 4))).toBe("seals_path");
    // A U under a map block [20, 30] × [20, 24]: west / east walls, then the south wall's last piece.
    const w2 = setup(openMap([box("block", 20, 20, 30, 24)]));
    for (const y of [24, 26]) {
      put(w2, "wood_barricade", 21.5, y, 1);
      put(w2, "wood_barricade", 26, y, 1);
    }
    put(w2, "wood_barricade", 22, 27.5, 0);
    expect(placementError(w2, "p0", req("wood_barricade", 24, 27.5))).toBe("seals_path");
    expect(placementError(w2, "p0", req("wood_barricade", 24, 29))).toBe(null); // the same piece away from the U: fine
  });

  it("floor types are never refused by the rule (AC 5): a spike trap or a mine in the closing spot is fine", () => {
    const world = setup();
    ringMissingOne(world, 22, 14);
    expect(placementError(world, "p0", req("spike_trap", 24, 12))).toBe(null); // [24, 26] × [12, 14]
    expect(placementError(world, "p0", req("mine", 24, 13.5))).toBe(null);
    expect(placementError(world, "p0", req("bear_trap", 25, 13))).toBe(null);
  });

  it("an old layout (a save or replay, AC 10) that already holds a sealed fort: other placements are judged only against the main region", () => {
    const world = setup();
    ringMissingOne(world, 6, 6);
    put(world, "wood_barricade", 8, 5.5, 0, "p1"); // sealed (built with no checks: an old save)
    expect(placementError(world, "p0", req("wood_barricade", 30, 10))).toBe(null); // elsewhere: fine
    expect(placementError(world, "p0", req("auto_turret", 7, 7))).toBe(null); // inside the old fort: not the main region, never refused
    expect(placementError(world, "p0", req("auto_turret", 20, 20))).toBe(null);
  });
});

describe("Story 12.1: moves and chains (AC 3, 4)", () => {
  it("a move into the ring's gap is refused; moving a ring piece along (the gap moves) is allowed: the moved building is lifted first", () => {
    const world = setup();
    ringMissingOne(world, 22, 14);
    const far = placeBuilding(world, "p0", req("wood_barricade", 30, 8));
    if (!far.ok) throw new Error(far.error);
    expect(moveError(world, "p0", { id: far.value.id, ...req("wood_barricade", 24, 13.5) })).toBe("seals_path");
    const m = moveBuilding(world, "p0", { id: far.value.id, ...req("wood_barricade", 24, 13.5) });
    expect(m.ok ? null : m.error).toBe("seals_path");
    // The north piece [22, 24] (p0's, the first one put) moves to [24, 26]: the gap is now [22, 24].
    const piece = world.buildings.list.find((b) => b.minX === 22 && b.minY === 13.5);
    if (!piece) throw new Error("piece");
    piece.ownerId = "p0"; // mine (an old layout's piece, given to p0)
    expect(moveError(world, "p0", { id: piece.id, ...req("wood_barricade", 24, 13.5) })).toBe(null);
    expect(moveBuilding(world, "p0", { id: piece.id, ...req("wood_barricade", 24, 13.5) }).ok).toBe(true);
    // A move that changes nothing (its own spot) is fine too.
    expect(moveError(world, "p0", { id: piece.id, ...req("wood_barricade", 24, 13.5) })).toBe(null);
  });

  it("chained placements in arrival order: the first turret leaves 1 m (ok), the second would close it (refused)", () => {
    const world = setup();
    ringMissingOne(world, 22, 14);
    const a = placeBuilding(world, "p0", req("auto_turret", 24, 13));
    expect(a.ok).toBe(true);
    const b = placeBuilding(world, "p1", req("auto_turret", 25, 13)); // pending behind the first: now illegal
    expect(b.ok ? null : b.error).toBe("seals_path");
    expect(world.buildings.list.length).toBe(10);
  });
});

/**
 * AC 8 (in the style of `blockReason.test.ts`): random Downtown layouts (every legal decay mask, stages
 * 1–3) on a server World and a client mirror built the same way; for many candidate spots of every
 * wall type and rotation (half of them right next to a building, where seals happen), the client's
 * preview (`blockReason(…, wall)` — cached, asked twice, interleaved with the other World) equals the
 * server's `placementError` after a cold cache. Review L4: moves too (`moveError`, client warm vs server
 * cold), and every 100 spots a wall lands on both Worlds, so the client's warm cache crosses a
 * `wallVersion` change; across the layouts some answers really are `seals_path`.
 */
describe("Story 12.1 (AC 8): the client's preview equals the server's answer", () => {
  const MASKS = gameplayDecayMasks(DOWNTOWN_MAP);
  const WALLS = ["wood_barricade", "auto_turret", "floodlight", "med_station"].filter((t) => buildingStats(balance, t)?.solid);
  let sealedTotal = 0;
  let moveSealedTotal = 0;
  function layout(seed: number): World {
    const world = createWorld({ balance, seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    world.decay.variants = MASKS[seed % MASKS.length] as number;
    applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
    addPlayer(world, "p0", 1, 1).wallet = 100_000;
    world.run.phase = "build";
    const b: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let id = 1000 * seed;
    const rng = createRng(seed * 31 + 1);
    for (let tries = 0; tries < 400 && world.buildings.list.length < 24; tries++) {
      const type = WALLS[rng.int(0, WALLS.length - 1)] as string;
      const stats = buildingStats(balance, type);
      if (!stats) continue;
      const rot = rng.int(0, 3) as BuildingRotation;
      const gx = rng.int(0, 96);
      const gy = rng.int(0, 64);
      if (footprintBlocked(world, footprint(stats, gx, gy, rot, b))) continue;
      addBuildingAt(world, { id: id++, type, ownerId: "p9", gx, gy, rot, hp: stats.hp });
    }
    return world;
  }
  it.each([1, 2, 3, 4, 5, 6])("layout %i: 600 spots, 60 moves, a wall every 100 spots", (seed) => {
    const server = layout(seed);
    const client = layout(seed);
    const rng = createRng(seed * 104729 + 11);
    const out = createBlockReason();
    let checked = 0;
    let extraId = 900_000 + seed * 100;
    for (let k = 0; k < 600; k++) {
      if (k > 0 && k % 100 === 0) {
        // A wall lands on both Worlds (the client's cache must follow wallVersion).
        for (let t = 0; t < 50; t++) {
          const r = { type: "wood_barricade", gx: rng.int(0, 96), gy: rng.int(0, 64), rot: rng.int(0, 3) };
          const stats = buildingStats(balance, r.type);
          if (!stats || footprintBlocked(server, footprint(stats, r.gx, r.gy, r.rot, scratchBox))) continue;
          for (const w of [server, client]) addBuildingAt(w, { id: extraId, type: r.type, ownerId: "p9", gx: r.gx, gy: r.gy, rot: r.rot as BuildingRotation, hp: stats.hp });
          extraId++;
          break;
        }
      }
      const type = WALLS[rng.int(0, WALLS.length - 1)] as string;
      const stats = buildingStats(balance, type);
      if (!stats) continue;
      const list = server.buildings.list;
      const near = rng.int(0, 1) === 1 ? list[rng.int(0, list.length - 1)] : undefined;
      const r = { type, gx: near ? near.gx + rng.int(-4, 4) : rng.int(0, 96), gy: near ? near.gy + rng.int(-4, 4) : rng.int(0, 64), rot: rng.int(0, 3) };
      const at = `layout ${seed} ${type} ${r.gx},${r.gy} r${r.rot}`;
      // The client asks twice (a ghost held still: the second answer is the cache's), the server once, cold.
      const c1 = blockReason(client, "p0", footprint(stats, r.gx, r.gy, r.rot, scratchBox), 0, out, true)?.cause ?? null;
      const c2 = blockReason(client, "p0", footprint(stats, r.gx, r.gy, r.rot, scratchBox), 0, out, true)?.cause ?? null;
      resetPathOpenCache();
      const s = placementError(server, "p0", r);
      expect(c2, at).toBe(c1);
      expect(c1 === "seals_path", at).toBe(s === "seals_path");
      expect(c1 === null, at).toBe(s === null || s === "limit"); // the cap isn't the spot's
      if (s === "seals_path") sealedTotal++;
      checked++;
      if (k % 10 === 0) {
        // A move of a random building (lent to p0 on both Worlds): client warm vs server cold.
        const idx = rng.int(0, list.length - 1);
        const bs = list[idx];
        const bc = client.buildings.list[idx];
        if (!bs || !bc) continue;
        const m = { id: bs.id, gx: bs.gx + rng.int(-4, 4), gy: bs.gy + rng.int(-4, 4), rot: rng.int(0, 3) };
        bs.ownerId = "p0";
        bc.ownerId = "p0";
        const mc = moveError(client, "p0", m);
        resetPathOpenCache();
        const ms = moveError(server, "p0", m);
        bs.ownerId = "p9";
        bc.ownerId = "p9";
        expect(mc, `${at} move ${m.id}`).toBe(ms);
        if (ms === "seals_path") moveSealedTotal++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
  it("liveness: the layouts above really gave seals_path answers, for placements and for moves", () => {
    expect(sealedTotal).toBeGreaterThan(0);
    expect(moveSealedTotal).toBeGreaterThan(0);
  });
});

/**
 * AC 13 (X3): one shared rasteriser. Layouts built ONLY through accepted placements (random wall spots
 * on Downtown, refusals skipped) never hold a pocket the escape's flood would call sealed: from every
 * free lattice vertex of the main region within 3 m of a building, the escape's flood for a player's
 * body (`escapeAreaOpen`) reaches its window's edge.
 */
describe("Story 12.1 (AC 13): a placement the check accepts never makes a pocket the escape calls sealed", () => {
  let sealRefusals = 0;
  it.each([1, 2, 3, 4])("Downtown layout %i", (seed) => {
    const world = createWorld({ balance, seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    applyDecayStage(world, 1 + (seed % 3), 0);
    for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 1 + i, 1).wallet = 100_000;
    world.run.phase = "build";
    const rng = createRng(seed * 977 + 5);
    let refusedSeal = 0;
    const list = world.buildings.list;
    for (let tries = 0; tries < 1500 && list.length < 24; tries++) {
      // Near the pad, where bots and players build, or right next to a building already there: forts are likeliest so.
      const near = list.length > 0 && rng.int(0, 1) === 1 ? list[rng.int(0, list.length - 1)] : undefined;
      const gx = near ? near.gx + rng.int(-4, 4) : rng.int(36, 60);
      const gy = near ? near.gy + rng.int(-4, 4) : rng.int(20, 44);
      const r = { type: rng.int(0, 3) === 0 ? "auto_turret" : "wood_barricade", gx, gy, rot: rng.int(0, 3) };
      const owner = `p${world.buildings.list.length % 4}`;
      const e = placementError(world, owner, r);
      if (e === "seals_path") refusedSeal++;
      if (e === null) expect(placeBuilding(world, owner, r).ok).toBe(true);
    }
    expect(world.buildings.list.length, "liveness: a dense layout").toBeGreaterThanOrEqual(12);
    sealRefusals += refusedSeal;
    let probed = 0;
    for (let j = 0; j <= 64; j++) {
      for (let i = 0; i <= 96; i++) {
        const x = i * BUILD_GRID_M;
        const y = j * BUILD_GRID_M;
        if (!world.buildings.list.some((b) => Math.max(0, b.minX - x, x - b.maxX) < 3 && Math.max(0, b.minY - y, y - b.maxY) < 3)) continue;
        if (!inMainRegion(world, i, j)) continue;
        probed++;
        expect(escapeAreaOpen(world, x, y, R), `(${x}, ${y})`).toBe(true);
      }
    }
    expect(probed).toBeGreaterThan(200);
  });
  it("liveness: the layouts above really met the rule (some placements were refused as seals_path)", () => {
    expect(sealRefusals).toBeGreaterThan(0);
  });
});

describe("Story 12.1 (AC 6): new cover clears buildings within one player body (no refund)", () => {
  const COVER: DecayMutation = { name: "test_wreck", action: "add", stage: 2, variant: -1, kind: "car", target: "", radiusM: 0, minX: 20, minY: 10.2, maxX: 22, maxY: 12 };
  it("a barricade 0.5 m from new cover is destroyed (cause cleared, no refund), one 1.0 m away stays, a mine 0.2 m away stays", () => {
    const world = setup(openMap([], [COVER]));
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    const near = put(world, "wood_barricade", 22.5, 10, 1, "p0"); // x [22.5, 23]: 0.5 m east of the wreck
    const far = put(world, "wood_barricade", 23, 13, 0, "p1"); // [23, 25] × [13, 13.5]: 1.0 m beyond its corner on x, 1.0 m on y → 1.41 m
    const far2 = put(world, "wood_barricade", 18, 10.5, 1, "p1"); // x [18, 18.5]: 1.5 m west
    const edge = put(world, "wood_barricade", 20, 13, 0, "p2"); // [20, 22] × [13, 13.5]: exactly 1.0 m south
    const mine = put(world, "mine", 20.5, 9.5, 0, "p3"); // [20.5, 21] × [9.5, 10]: 0.2 m north
    const wallets = [...world.players.values()].map((p) => p.wallet);
    expect(changeDecayStage(world, 2)).toBe(true);
    world.events.flush();
    const ids = world.buildings.list.map((b) => b.id);
    expect(ids).not.toContain(near.id);
    expect(ids).toEqual(expect.arrayContaining([far.id, far2.id, edge.id, mine.id]));
    const lost = events.filter((e): e is Extract<SimEvent, { type: "building.destroyed" }> => e.type === "building.destroyed");
    expect(lost.map((e) => [e.buildingId, e.cause])).toEqual([[near.id, "cleared"]]);
    expect([...world.players.values()].map((p) => p.wallet)).toEqual(wallets); // no refund
    expect(events.some((e) => e.type === "money.earned")).toBe(false);
  });

  it("the margin is 2 × player.radiusM (balance), measured box to box", () => {
    expect(2 * R).toBeCloseTo(0.8, 9);
  });
});


/** Review L3: a map loads with every free lattice vertex in the pad's region (Epic 11's generated maps will run the same check). */
describe("Story 12.1 review L3: Downtown has no free vertex outside the main region", () => {
  it("every stage 1–5, every legal decay mask: 0 vertices outside the pad's region", () => {
    const masks = gameplayDecayMasks(DOWNTOWN_MAP);
    const bad: string[] = [];
    let checked = 0;
    for (let stage = 1; stage <= 5; stage++) {
      for (const mask of masks) {
        const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
        applyDecayStage(world, stage, mask);
        const n = verticesOutsideMainRegion(world);
        checked++;
        if (n > 0 && bad.length < 8) bad.push(`stage ${stage} mask ${mask}: ${n}`);
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  });
});

/**
 * Story 12.1 H1 (designer 2026-11-26: A): a decay stage must not finish a seal the walls started. After a
 * stage's mutations the path rule runs again; walls that now cut part of the old main region off (while the
 * map alone still joins it) are cleared, highest id first, cause `cleared`, no refund.
 */
describe("Story 12.1 H1: a decay stage re-checks paths; walls that now seal are cleared", () => {
  const lost = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: "building.destroyed" }> => e.type === "building.destroyed");
  it("the Downtown parking lot, stages 2 → 4 with the alley-2 rubble (review probe 3): no pocket is left, the sealing wall is cleared, no refund", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    for (let i = 0; i < 2; i++) addPlayer(world, `p${i}`, 24 + i, 16).wallet = 1000;
    world.decay.variants = 1 << 10;
    applyDecayStage(world, 2, world.decay.variants);
    for (const [x, y] of [[20, 22], [19.5, 24], [19.5, 26], [19.5, 28], [19.5, 30]] as const) put(world, "wood_barricade", x, y, 1, "p0");
    expect(verticesOutsideMainRegion(world), "stage 2: nothing sealed yet").toBe(0);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    const wallets = [...world.players.values()].map((p) => p.wallet);
    expect(changeDecayStage(world, 4)).toBe(true);
    world.events.flush();
    expect(verticesOutsideMainRegion(world), "stage 4: no pocket left").toBe(0);
    const cleared = lost(events).filter((e) => e.cause === "cleared");
    expect(cleared.length, "liveness: the re-check really cleared a wall").toBeGreaterThan(0);
    expect(world.buildings.list.length).toBeGreaterThan(0); // only the sealing wall(s), not all five
    expect([...world.players.values()].map((p) => p.wallet)).toEqual(wallets);
  });

  it("a 0.85 m gap left by new cover (wider than the 0.8 m margin, read as closed by the grid): the wall is cleared by the re-check", () => {
    // The north-east corner [45, 48] × [0, 4]: a west wall x [44.5, 45] and a south wall [44, 46] × [4, 4.5] leave a 2 m mouth
    // x [46, 48]; at stage 2 a wreck lands at [46.85, 48] × [4, 4.5], 0.85 m from the wall's end.
    const wreck: DecayMutation = { name: "flip_wreck", action: "add", stage: 2, variant: -1, kind: "car", target: "", radiusM: 0, minX: 46.85, minY: 4, maxX: 48, maxY: 4.5 };
    const world = setup(openMap([], [wreck]));
    const w1 = put(world, "wood_barricade", 44.5, 0, 1, "p0");
    const w2 = put(world, "wood_barricade", 44.5, 2, 1, "p0");
    const w3 = put(world, "wood_barricade", 44, 4, 0, "p0");
    expect(verticesOutsideMainRegion(world)).toBe(0);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    expect(changeDecayStage(world, 2)).toBe(true);
    world.events.flush();
    expect(verticesOutsideMainRegion(world)).toBe(0);
    const cleared = lost(events).filter((e) => e.cause === "cleared").map((e) => e.buildingId);
    expect(cleared.length).toBeGreaterThan(0);
    expect(cleared[0]).toBe(Math.max(...[w1.id, w2.id, w3.id].filter((id) => cleared.includes(id)))); // highest id first
    expect(events.some((e) => e.type === "money.earned")).toBe(false);
  });

  /** Re-review round 1 P1/P2: area R (x 0–10, y 0–8) with exits A (east, a car) and X (south); stage 2 drives the car off and blocks X. */
  function areaR(extra: (w: World) => void = () => {}) {
    const solids = [box("e1", 10, 0, 11.5, 2), box("e2", 10, 4, 11.5, 8), box("s1", 0, 8, 4, 8.5), box("s2", 6, 8, 11.5, 8.5)];
    const car = { name: "c1", minX: 10, minY: 2, maxX: 11, maxY: 4, kind: "car" as const, minStage: 1 };
    const decay: DecayMutation[] = [
      { name: "c1_drives_off", action: "remove", stage: 2, variant: -1, kind: "", target: "c1", radiusM: 0, minX: 10, minY: 2, maxX: 11, maxY: 4 },
      { name: "x_blocked", action: "block", stage: 2, variant: -1, kind: "", target: "", radiusM: 0, minX: 4, minY: 8, maxX: 6, maxY: 8.5 },
    ];
    const world = setup({ ...openMap(solids, decay), cover: [car] });
    const wall = put(world, "wood_barricade", 11, 2, 1, "p0"); // x [11, 11.5], flush behind the car
    extra(world);
    expect(verticesOutsideMainRegion(world), "stage 1: R joined through X").toBe(0);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    expect(changeDecayStage(world, 2)).toBe(true);
    world.events.flush();
    return { world, wall, cleared: lost(events).filter((e) => e.cause === "cleared").map((e) => e.buildingId) };
  }

  it("re-review P1 (H1-a): the wall's pocket side touches only ground the stage freed (a car drove off): it is still cleared", () => {
    const { world, wall, cleared } = areaR();
    expect(cleared).toEqual([wall.id]);
    expect(verticesOutsideMainRegion(world)).toBe(0);
  });

  it("re-review P2 (H1-b): a higher-id turret inside the pocket is kept; only the sealing wall goes", () => {
    let turret = 0;
    const { world, wall, cleared } = areaR((w) => void (turret = put(w, "auto_turret", 5, 4, 0, "p1").id));
    expect(turret).toBeGreaterThan(wall.id);
    expect(cleared).toEqual([wall.id]);
    expect(world.buildings.list.map((b) => b.id)).toContain(turret);
    expect(verticesOutsideMainRegion(world)).toBe(0);
  });

  it("re-review P3 (H1-b): a ring round the pad left with two 0.85 m gaps: the fewest ring walls (one) are cleared, the far barricades (higher ids) kept", () => {
    // Inside [22, 28] × [14, 18]; the north wall's middle [24, 26] is open until stage 2 drops a barrier [24.85, 25.15]:
    // two 0.85 m gaps (wider than the 0.8 m margin, closed for the grid).
    const barrier: DecayMutation = { name: "ring_barrier", action: "add", stage: 2, variant: -1, kind: "barrier", target: "", radiusM: 0, minX: 24.85, minY: 13.5, maxX: 25.15, maxY: 14 };
    const world = setup(openMap([], [barrier]));
    const ring: number[] = [];
    const add = (x: number, y: number, rot: BuildingRotation) => ring.push(put(world, "wood_barricade", x, y, rot, "old").id);
    add(22, 13.5, 0);
    add(26, 13.5, 0);
    for (const x of [22, 24, 26]) add(x, 18, 0);
    for (const y of [13.5, 15.5, 17.5]) {
      add(21.5, y, 1);
      add(28, y, 1);
    }
    // The corner pieces (y 17.5) overlap the south wall's ends: lifting one alone opens only a 0.5 m slot. The east
    // middle piece (y 15.5) is the highest-id wall whose removal alone joins the ring's inside back.
    const eastMiddle = world.buildings.list.find((b) => b.minX === 28 && b.minY === 15.5)?.id ?? -1;
    const far = [put(world, "wood_barricade", 5, 25, 0, "old").id, put(world, "wood_barricade", 8, 25, 0, "old").id, put(world, "wood_barricade", 11, 25, 0, "old").id];
    expect(verticesOutsideMainRegion(world)).toBe(0);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    expect(changeDecayStage(world, 2)).toBe(true);
    world.events.flush();
    const all = lost(events).map((e) => [e.buildingId, e.cause]);
    expect(all).toEqual([[eastMiddle, "cleared"]]); // one pass, one ring wall, nothing else
    expect(ring).toContain(eastMiddle);
    expect(world.buildings.list.map((b) => b.id)).toEqual(expect.arrayContaining(far));
    expect(verticesOutsideMainRegion(world)).toBe(0);
  });

  /** Re-review round 2 HIGH-1: area R with exit A open (a corridor y 2–4 up to `end`) holding walls at `xs`; stage 2 blocks X. */
  function thickR(xs: number[], end: number) {
    const solids = [box("e1", 10, 0, end, 2), box("e2", 10, 4, end, 8), box("s1", 0, 8, 4, 8.5), box("s2", 6, 8, end, 8.5)];
    const decay: DecayMutation[] = [{ name: "x_blocked", action: "block", stage: 2, variant: -1, kind: "", target: "", radiusM: 0, minX: 4, minY: 8, maxX: 6, maxY: 8.5 }];
    const world = setup(openMap(solids, decay));
    const ids = xs.map((x) => put(world, "wood_barricade", x, 2, 1, "p0").id);
    expect(verticesOutsideMainRegion(world), "stage 1: R joined through X").toBe(0);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    expect(changeDecayStage(world, 2)).toBe(true);
    world.events.flush();
    return { world, ids, cleared: lost(events).filter((e) => e.cause === "cleared").map((e) => e.buildingId) };
  }

  it("re-review round 2 HIGH-1: a wall two pieces thick: both pieces are cleared (highest id first), nothing is left sealed", () => {
    const { world, ids, cleared } = thickR([10.5, 11], 11.5);
    expect(cleared).toEqual([...ids].sort((a, b) => b - a));
    expect(verticesOutsideMainRegion(world)).toBe(0);
    expect(stageSealsUnresolved(world)).toBe(0);
  });

  it("re-review round 2 HIGH-1: two walls 0.5 m apart: both cleared, nothing sealed", () => {
    const { world, ids, cleared } = thickR([10.5, 11.5], 12);
    expect([...cleared].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    expect(cleared[0]).toBe(Math.max(...ids));
    expect(verticesOutsideMainRegion(world)).toBe(0);
  });

  it("re-review round 2 HIGH-1: a wall three pieces thick: all three cleared, nothing sealed", () => {
    const { world, ids, cleared } = thickR([10.5, 11, 11.5], 12);
    expect([...cleared].sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    expect(verticesOutsideMainRegion(world)).toBe(0);
  });

  it("a stage that seals nothing clears nothing (a wall 1 m from new cover stays)", () => {
    const wreck: DecayMutation = { name: "far_wreck", action: "add", stage: 2, variant: -1, kind: "car", target: "", radiusM: 0, minX: 20, minY: 10, maxX: 22, maxY: 12 };
    const world = setup(openMap([], [wreck]));
    const keep = put(world, "wood_barricade", 23, 10, 1, "p0"); // x [23, 23.5]: 1 m east
    expect(changeDecayStage(world, 2)).toBe(true);
    expect(world.buildings.list.map((b) => b.id)).toEqual([keep.id]);
  });
});
