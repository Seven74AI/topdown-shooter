import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { buildingStats, footprint, placeBuilding, placementError, type Box } from "../buildings/buildings";
import { circleOverlapsBox, segmentHitsBuildings } from "../buildings/collision";
import { shotBlockT } from "../combat/cover";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { DecayMutation, MapBox } from "../map/districtMap";
import { shopfrontsOf } from "../map/shopfronts";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { skipWave, startBuild, startWave } from "../run/runStateMachine";
import { jitteredSpawn, spawnJitterFor } from "../waves/waveDirector";
import { FLOW_UNREACHED, flowCellAt, rebuildFlowFieldNow } from "../zombies/flowField";
import { ZOMBIE_TYPES, isWindupState, type ZombieTypeId } from "../zombies/zombieTypes";
import { killZombie, spawnZombie } from "../zombies/zombiePool";
import { applyDecayStage } from "./applyDecayStage";
import { circleInFire, fireRecordOf, legalDecayMasks } from "./decayState";
import { changeDecayStage, relocated } from "./decaySystem";

/**
 * Story 4.7 (Panic, stage 2, FR60): 4 of 6 curb cars move into the road (picked by `streams.decay`),
 * police barriers close some paths; the layout stays fun (no enclosed area, spawns clear, zombies
 * still reach us), the build-start order handles a car landing on a barricade or a player, and
 * barriers stop bodies but not shots. All on the real Downtown data through 4.5's engine.
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const MASKS = legalDecayMasks(DT);
const MOVERS = DT.decayVariants.filter((v) => v.group === "panic_cars_moved");
const moverBit = (name: string) => DT.decayVariants.findIndex((v) => v.name === name);
const mutation = (name: string) => DT.decay.find((m) => m.name === name) as DecayMutation;
/** The add (car in the road) and remove (car at the curb) of a mover candidate. */
const inRoadOf = (variant: number) => DT.decay.find((m) => m.variant === variant && m.action === "add") as DecayMutation;
const leavesOf = (variant: number) => DT.decay.find((m) => m.variant === variant && m.action === "remove") as DecayMutation;
const names = (l: readonly MapBox[]) => l.map((b) => b.name);
const overlaps = (a: MapBox, b: MapBox) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/** The run's World at its first build (stage 1), with `players` at the team start. */
function run(seed: number, players = 1): World {
  const w = createWorld({ balance, seed, map: DT, systems: { waves: () => {} } });
  w.debug.godMode = true;
  const at = { x: 0, y: 0 };
  for (let slot = 0; slot < players; slot++) {
    teamSpawnPoint(w, slot, at);
    addPlayer(w, `p${slot}`, at.x, at.y).wallet = 1000;
  }
  startBuild(w);
  return w;
}
/** Stage-1 World whose run picked `mask` (tests force each combination; the sim picks it from `streams.decay`). */
function runWithMask(mask: number, players = 1): World {
  const w = run(1, players);
  w.decay.variants = mask; // stage 1 does not depend on the mask; the DecaySystem applies it at stage 2
  return w;
}

describe("Story 4.7 Panic: 4 cars into the road (decay stream)", () => {
  it("each run moves exactly 4 of the 6 curb cars: gone from the curb, in the road; same seed → same cars, other seeds → other cars", () => {
    expect(MOVERS).toHaveLength(6);
    const picks = new Map<string, number>();
    const moved = new Map<string, number>();
    for (let seed = 1; seed <= 64; seed++) {
      const a = run(seed);
      const b = run(seed);
      expect(a.decay.variants, `seed ${seed}`).toBe(b.decay.variants);
      const curbBefore = names(a.obstacles.cover);
      expect(changeDecayStage(a, 2)).toBe(true); // the DecaySystem's path (the build start before wave 3)
      expect(changeDecayStage(b, 2)).toBe(true);
      expect(names(a.obstacles.solids)).toEqual(names(b.obstacles.solids));
      const cover = names(a.obstacles.cover);
      const inRoad = cover.filter((n) => n.endsWith("_in_road"));
      const left = MOVERS.map((_, i) => leavesOf(moverBit(MOVERS[i]?.name as string)).target).filter((t) => !cover.includes(t));
      expect(inRoad, `seed ${seed}`).toHaveLength(4);
      // The 4 that left the curb are exactly the 4 now in the road (and they were there at stage 1).
      expect(inRoad.map((n) => n.replace(/_in_road$/, "")).sort()).toEqual(left.filter((t) => t !== "parked_car_3").sort());
      for (const t of left) expect(curbBefore).toContain(t);
      // The moved cars stop bodies and shots (car rules) and are nav walls from the build start.
      for (const n of inRoad) {
        const c = a.obstacles.cover.find((x) => x.name === n) as MapBox;
        expect(names(a.obstacles.shotBlockers)).toContain(n);
        expect(a.pathing.nav.wallAt[flowCellAt(a.pathing.nav, (c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2)]).toBe(1);
      }
      const key = inRoad.sort().join(",");
      picks.set(key, (picks.get(key) ?? 0) + 1);
      for (const n of inRoad) moved.set(n, (moved.get(n) ?? 0) + 1);
    }
    // Different seeds pick different cars: many of the 15 sets occur, every car moves in some run.
    expect(picks.size).toBeGreaterThanOrEqual(10);
    expect(moved.size).toBe(6);
  });

  it("police barriers close paths for bodies but let shots pass (4.2 rules); the moved cars stop both", () => {
    const w = runWithMask(MASKS[0] as number);
    expect(changeDecayStage(w, 2)).toBe(true);
    const lot = mutation("police_line_lot");
    const gas = mutation("police_line_gas");
    for (const line of [lot, gas]) {
      expect(names(w.obstacles.solids)).toContain(line.name);
      expect(names(w.obstacles.shotBlockers)).not.toContain(line.name);
    }
    // A shot north → south across the lot line flies over it; one across a moved car stops at it.
    expect(shotBlockT(w, 15, 21, 15, 24)).toBe(-1);
    const first = MOVERS.findIndex((_, i) => ((MASKS[0] as number) >>> i) & 1); // movers are bits 0–5
    const car = inRoadOf(first);
    const cy = (car.minY + car.maxY) / 2;
    expect(shotBlockT(w, car.minX - 1, cy, car.maxX + 1, cy)).toBeGreaterThan(0);
    // A survivor walking south into the lot line stops at it (bodies), every tick of 3 s.
    const p = w.players.get("p0");
    if (!p) throw new Error("p0");
    p.x = p.prevX = 15;
    p.y = p.prevY = 20.8;
    startWave(w);
    let seq = 0;
    let minGap = Infinity;
    for (let t = 0; t < 60; t++) {
      setInput(w, "p0", { ...NEUTRAL_INPUT, seq: ++seq, moveY: 1 });
      step(w, TICK_DT_S);
      minGap = Math.min(minGap, lot.minY - p.y);
    }
    expect(p.y).toBeGreaterThan(21); // liveness: it really walked south
    expect(minGap).toBeGreaterThanOrEqual(p.radiusM - 1e-6);
  });

  it("a path can still be closed: the 1.5 m gap the lot line leaves at the lot's NW corner takes one barricade", () => {
    const w = run(2);
    expect(changeDecayStage(w, 2)).toBe(true);
    const wood = buildingStats(balance, "wood_barricade");
    if (!wood) throw new Error("wood");
    // Review L: judged against the obstacles (map boxes, cover incl. the police line) and buildings,
    // for a body's radius, and by the zombies' own flow field (a detour, not a line test alone).
    const r = balance.player.radiusM;
    const p0 = w.players.get("p0");
    if (!p0) throw new Error("p0");
    p0.x = p0.prevX = 15; // the zombies' target inside the lot
    p0.y = p0.prevY = 26;
    const { nav, chase } = w.pathing;
    const westOfGap = flowCellAt(nav, 8.5, 23.25); // alley 2's head, west of the gap
    rebuildFlowFieldNow(chase, nav, w);
    const before = chase.front[westOfGap] as number;
    expect(before).toBeLessThan(FLOW_UNREACHED);
    expect(segmentHitsBuildings(w, 9, 23.25, 12, 23.25, r)).toBe(false); // a body fits through the gap
    const req = { type: "wood_barricade", gx: 21, gy: 45, rot: 1 }; // x 10.5–11, y 22.5–24.5
    const box = footprint(wood, req.gx, req.gy, req.rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 } as Box);
    expect([box.minX, box.maxX, box.minY, box.maxY]).toEqual([10.5, 11, 22.5, 24.5]);
    expect(placementError(w, "p0", req)).toBe(null);
    expect(placeBuilding(w, "p0", req).ok).toBe(true);
    for (let y = 22.6; y < 24; y += 0.2) expect(segmentHitsBuildings(w, 9, y, 12, y, 0), `y ${y.toFixed(1)}`).toBe(true);
    rebuildFlowFieldNow(chase, nav, w);
    const after = chase.front[westOfGap] as number;
    // The way round (or through the barricade, which zombies must break: costly) is much longer.
    expect(after).toBeGreaterThan(before * 1.5); // measured 35 → 87 (field cost units)
  });

});

describe("Story 4.7 Panic keeps the map fun (every combination, every stage)", () => {
  it("every stage × every combination: no enclosed cell, no slot narrower than a body, spawns' jitter areas and the team start clear", () => {
    const radii = [...new Set(Object.values(balance.zombies.types).map((t) => t.radiusM))];
    const lo = { x: 0, y: 0 };
    const hi = { x: 0, y: 0 };
    const at = { x: 0, y: 0 };
    let checked = 0;
    for (let stage = 1; stage <= 5; stage++) {
      for (const mask of MASKS) {
        const w = createWorld({ balance, seed: 1, map: DT });
        applyDecayStage(w, stage, mask);
        addPlayer(w, "p0", DT.widthM / 2, DT.heightM / 2);
        const { nav, chase } = w.pathing;
        rebuildFlowFieldNow(chase, nav, w);
        let unreached = 0;
        let closed = 0;
        for (let c = 0; c < nav.cells; c++) {
          if (nav.wallAt[c] === 0 && (chase.front[c] as number) >= FLOW_UNREACHED) unreached++;
          if (nav.closedE[c] !== 0 || nav.closedS[c] !== 0) closed++;
        }
        expect([unreached, closed], `stage ${stage} mask ${mask}`).toEqual([0, 0]);
        for (const rz of radii) {
          const jitter = spawnJitterFor(balance, rz); // Story 5.7: per type (a wide body jitters less)
          for (const sp of DT.spawnPoints) {
            jitteredSpawn(w, sp, -jitter, rz, lo);
            jitteredSpawn(w, sp, jitter, rz, hi);
            const area: MapBox = { name: sp.name, minX: Math.min(lo.x, hi.x) - rz, maxX: Math.max(lo.x, hi.x) + rz, minY: Math.min(lo.y, hi.y) - rz, maxY: Math.max(lo.y, hi.y) + rz };
            for (const s of w.obstacles.solids) expect(overlaps(area, s), `stage ${stage} mask ${mask}: ${sp.name} (r ${rz}) vs ${s.name}`).toBe(false);
          }
        }
        for (let slot = 0; slot < 4; slot++) {
          teamSpawnPoint(w, slot, at);
          for (const s of w.obstacles.solids) expect(circleOverlapsBox(at.x, at.y, balance.player.radiusM, s.minX, s.minY, s.maxX, s.maxY), `team start ${slot} in ${s.name}`).toBe(false);
        }
        checked++;
      }
    }
    expect(checked).toBe(5 * 45); // Story 4.8: 45 combinations (fires pick 2 of 3); liveness: every combination ran
  });

  it("nothing that appears at a decay stage lands within spawnClearM of a spawn, on another active obstacle or on a lit shop front", () => {
    const clear = balance.buildings.spawnClearM;
    const appearing: MapBox[] = [
      ...DT.decay.filter((m) => m.action === "add" || m.action === "block"),
      ...DT.cover.filter((c) => c.minStage >= 2),
    ];
    expect(appearing.filter((b) => b.name.endsWith("_in_road"))).toHaveLength(6); // liveness: the movers are in the list
    for (const b of appearing) {
      for (const sp of DT.spawnPoints) expect(circleOverlapsBox(sp.x, sp.y, clear, b.minX, b.minY, b.maxX, b.maxY), `${b.name} within ${clear} m of ${sp.name}`).toBe(false);
      for (const f of shopfrontsOf(DT)) expect(overlaps(b, f), `${b.name} on ${f.name}`).toBe(false);
    }
    // A moved car never lands on another obstacle active with it (any combination, stages 2–5).
    for (const mask of MASKS) {
      for (let stage = 2; stage <= 5; stage++) {
        const w = createWorld({ balance, seed: 1, map: DT });
        applyDecayStage(w, stage, mask);
        const solids = w.obstacles.solids;
        for (const car of solids.filter((s) => s.name.endsWith("_in_road"))) {
          for (const s of solids) if (s !== car) expect(overlaps(car, s), `mask ${mask} stage ${stage}: ${car.name} on ${s.name}`).toBe(false);
        }
      }
    }
  });

  it("4.3 re-review L2 (in 4.8 rr): no fire an ignite can light touches any spawn's whole jitter segment (every spawn, every stage), for the largest zombie", () => {
    const w = createWorld({ balance, seed: 1, map: DT });
    const ignites = DT.decay.filter((m) => m.action === "ignite");
    expect(ignites).toHaveLength(3); // liveness: the three candidate cars
    const lo = { x: 0, y: 0 };
    const hi = { x: 0, y: 0 };
    let margin = Infinity;
    for (const m of ignites) for (const rz of [...new Set(Object.values(balance.zombies.types).map((t) => t.radiusM))]) {
      const jitter = spawnJitterFor(balance, rz); // Story 5.7: per type
      const fire = fireRecordOf(m, 0, balance.decay.fire.radiusM);
      for (const sp of DT.spawnPoints) {
        jitteredSpawn(w, sp, -jitter, rz, lo);
        jitteredSpawn(w, sp, jitter, rz, hi);
        // The point of the segment lo–hi closest to the fire's centre (the jitter is a straight segment).
        const dx = hi.x - lo.x;
        const dy = hi.y - lo.y;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((fire.x - lo.x) * dx + (fire.y - lo.y) * dy) / len2)) : 0;
        const cx = lo.x + dx * t;
        const cy = lo.y + dy * t;
        expect(circleInFire([fire], cx, cy, rz), `${m.name} touches ${sp.name}'s jitter segment`).toBe(false);
        for (let k = 0; k <= 8; k++) expect(circleInFire([fire], lo.x + (dx * k) / 8, lo.y + (dy * k) / 8, rz)).toBe(false);
        margin = Math.min(margin, Math.hypot(cx - fire.x, cy - fire.y) - (fire.radiusM + rz));
      }
    }
    expect(margin).toBeGreaterThan(0); // closest today: parking_lot_south vs parked_car_2 (≈ 3.25 m vs 2.35 m needed)
  });

  it("zombies reach us after Panic, on the real map, for every combination: a Walker from every spawn open at stage 2 (all types for 3 combinations)", () => {
    let spawnedTotal = 0;
    for (const [k, mask] of MASKS.entries()) {
      const w = runWithMask(mask, 2);
      const types: readonly ZombieTypeId[] = k % 10 === 0 ? ZOMBIE_TYPES : ["walker"];
      changeStageAtBuild(w);
      expect(w.decay.stage).toBe(2);
      expect(names(w.obstacles.cover).filter((n) => n.endsWith("_in_road"))).toHaveLength(4);
      startWave(w);
      const spawned: number[] = [];
      const out = { x: 0, y: 0 };
      for (const sp of DT.spawnPoints) {
        if (sp.minStage > 2) continue;
        for (const type of types) {
          jitteredSpawn(w, sp, 0, balance.zombies.types[type]?.radiusM ?? 0, out);
          spawned.push(spawnZombie(w, type, out.x, out.y));
        }
      }
      const reached = new Set<number>();
      for (let t = 0; t < 20 * 90 && reached.size < spawned.length; t++) {
        step(w, TICK_DT_S);
        const z = w.zombies;
        for (const id of spawned) {
          if (reached.has(id) || z.alivePos[id] === -1) continue;
          if (isWindupState(z.state[id] as number)) reached.add(id); // Story 5.6: a Spitter "reaches" us when it winds up (in range, clear line)
          for (const p of w.players.values()) {
            if (Math.hypot(p.x - (z.x[id] as number), p.y - (z.y[id] as number)) <= 3 && !segmentHitsBuildings(w, z.x[id] as number, z.y[id] as number, p.x, p.y, 0)) reached.add(id);
          }
        }
        // Story 5.7: a zombie that reached us leaves (killed), so the crowd round the team never fills the 3 m
        // circle: with a 1.2 m Brute per spawn the bodies no longer fit, and late arrivals would stay outside it.
        for (const id of reached) if (z.alivePos[id] !== -1) killZombie(w, id, null, "cheat"); // Story 5.8: removed, not killed (a Bloater would burst)
      }
      expect(spawned.length, `mask ${mask}`).toBe(14 * types.length); // liveness: 14 spawns open at stage 2
      expect(reached.size, `mask ${mask}: ${spawned.length - reached.size} never reached us: ${spawned.filter((id) => !reached.has(id)).map((id) => `${w.zombies.type[id]}@${(w.zombies.x[id] as number).toFixed(2)},${(w.zombies.y[id] as number).toFixed(2)}`).join(" ")}`).toBe(spawned.length);
      spawnedTotal += spawned.length;
    }
    expect(spawnedTotal).toBe(40 * 14 + 5 * 14 * ZOMBIE_TYPES.length); // Story 4.8: 45 combinations, every 10th with all types
  }, 180_000);
});

/**
 * The run's own path into stage 2: waves 1 and 2 cleared (`skipWave` → `endWave` → `startBuild`);
 * the build start before wave 3 runs the DecaySystem (decay.json: wave 3 = stage 2).
 */
function changeStageAtBuild(w: World): void {
  for (let wave = 0; wave < 2; wave++) {
    startWave(w);
    skipWave(w);
  }
}

describe("Story 4.7 build-start order where a car moves (brief line 5)", () => {
  it("for every mover: a barricade where the car lands is destroyed and refunded 50 %; a survivor standing there is moved out; nobody is left inside", () => {
    const wood = buildingStats(balance, "wood_barricade") as { price: number };
    let destroyedTotal = 0;
    for (const v of MOVERS) {
      const bit = moverBit(v.name);
      const mask = (MASKS.find((m) => (m >>> bit) & 1) as number) >>> 0;
      const w = runWithMask(mask, 2);
      const car = inRoadOf(bit);
      // A barricade overlapping the car's road box (legal at stage 1: the road is free then).
      let placed = false;
      for (let gy = Math.floor(car.minY / BUILD_GRID_M); gy < Math.ceil(car.maxY / BUILD_GRID_M) && !placed; gy++) {
        for (let gx = Math.floor(car.minX / BUILD_GRID_M) - 3; gx < Math.ceil(car.maxX / BUILD_GRID_M) && !placed; gx++) {
          for (const rot of [0, 1] as const) {
            if (placed) break;
            const fp = footprint(buildingStats(balance, "wood_barricade") as never, gx, gy, rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 } as Box);
            if (!overlaps(fp as MapBox, car)) continue;
            if (placementError(w, "p0", { type: "wood_barricade", gx, gy, rot }) !== null) continue;
            placed = placeBuilding(w, "p0", { type: "wood_barricade", gx, gy, rot }).ok;
          }
        }
      }
      expect(placed, `${v.name}: a barricade fits where the car will land`).toBe(true);
      const p1 = w.players.get("p1");
      if (!p1) throw new Error("p1");
      p1.x = p1.prevX = (car.minX + car.maxX) / 2;
      p1.y = p1.prevY = (car.minY + car.maxY) / 2;
      const p0 = w.players.get("p0") as { wallet: number; earned: number };
      const before = { wallet: p0.wallet, earned: p0.earned };
      const seen: SimEvent[] = [];
      const off = w.events.subscribe((e) => seen.push(e));
      changeStageAtBuild(w);
      step(w, TICK_DT_S);
      off();
      expect(w.decay.stage).toBe(2);
      expect(names(w.obstacles.solids)).toContain(car.name);
      expect(w.buildings.list.filter((b) => overlaps(b as unknown as MapBox, car)), v.name).toEqual([]);
      expect(seen.filter((e) => e.type === "building.destroyed").length, v.name).toBeGreaterThanOrEqual(1);
      // The refund (wallet only, not earned: 4.5 D5); the two cleared waves' bonuses come on top.
      const refunds = seen.filter((e) => e.type === "money.earned" && e.reason === "refund") as Extract<SimEvent, { type: "money.earned" }>[];
      expect(refunds.map((e) => `${e.playerId}:${e.amount}`), v.name).toEqual([`p0:${Math.floor(wood.price * balance.decay.buildingRefundShare)}`]);
      const bonuses = seen.filter((e) => e.type === "money.earned" && e.reason !== "refund" && e.playerId === "p0").reduce((a, e) => a + (e as { amount: number }).amount, 0);
      expect(p0.wallet - before.wallet, v.name).toBe(bonuses + Math.floor(wood.price * balance.decay.buildingRefundShare));
      expect(p0.earned - before.earned).toBe(bonuses);
      expect(relocated.players, v.name).toBeGreaterThanOrEqual(1);
      for (const p of w.players.values()) for (const s of w.obstacles.solids) expect(circleOverlapsBox(p.x, p.y, p.radiusM - 1e-6, s.minX, s.minY, s.maxX, s.maxY), `${v.name}: ${p.id} in ${s.name}`).toBe(false);
      destroyedTotal++;
    }
    expect(destroyedTotal).toBe(6);
  });
});
