import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import { ticksFor } from "../core/time";
import { createWorld, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { spotBlocked } from "../player/freeSpot";
import { addPlayer, type PlayerState } from "../player/player";
import { spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE, zombieTypeIndex, type ZombieTypeId } from "./zombieTypes";
import { wideStallStats } from "./zombieAi";
import { STILL_S, insideBox, runTrial, type WideTrial } from "./wideBody.testkit";
import { STILL_TICKS, runCrowd } from "./crowdCorner.testkit";
import { pushEscapes } from "../buildings/collision";

/**
 * Story 6.13 (brief lines 7 and 9): wide bodies (Brute 0.6 m, Bloater 0.5 m) round random barricade
 * boxes on Downtown, every wall of the box randomly shifted half a cell along and/or out, so its
 * corners leave 0.5 m diagonal gaps (too narrow for a wide body, the 6.8 review M1 shape); some boxes
 * have an open side (players reachable by walking), some are closed (the body must break in). 1–3
 * god-mode players camp inside, standing still; a third of the boxes also hold a floodlight or med
 * station (review H1: a solid building inside the box, nearer the campers than the walls). One wide
 * zombie (CHASE or RUSH) starts 2–8 m out.
 *
 * Every trial: (i) within `BOUND_S` the zombie reaches a player (contact, a Bloater swell, a Brute
 * windup) or attacks a building (a building lost HP, or a Bloater swelled against one);
 * (ii) the fairness rule: it never stands still (< `STILL_M` from where it was) for more than
 * `STILL_S` while not attacking (touching a player, winding up, swelling or a building losing HP);
 * (iii) no body inside a box. Liveness: both outcomes (player reached, building attacked) happen, and
 * so do both types, both states, closed boxes and the stall net (Story 6.13's fix) firing.
 * Without the fix, trials 128 (Bloater RUSH), 2084 (Brute) and 2485 (Bloater RUSH) of 1,500 stood
 * still for the whole bound (35–40 s): those three layouts are pinned in `wideBodyStall.test.ts`.
 */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const TRIALS = 240;
const BOUND_S = 45;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const TYPES: ZombieTypeId[] = ["bloater", "brute"];

/** One wall of a 2 × 2 m pocket whose min corner is (x0, y0): its own min corner and rotation, shifted by (along, out) half-cells. */
function wallSpec(side: number, x0: number, y0: number, along: number, out: number): { x: number; y: number; rot: BuildingRotation } {
  const a = along * BUILD_GRID_M;
  const o = out * BUILD_GRID_M;
  if (side === 0) return { x: x0 + a, y: y0 - 0.5 - o, rot: 0 }; // north (horizontal)
  if (side === 1) return { x: x0 + a, y: y0 + 2 + o, rot: 0 }; // south
  if (side === 2) return { x: x0 - 0.5 - o, y: y0 + a, rot: 1 }; // west (vertical)
  return { x: x0 + 2 + o, y: y0 + a, rot: 1 }; // east
}

function trial(seed: number): WideTrial | null {
  const rng: Rng = createRng(seed * 7919 + 13);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  const stage = [1, 4, 5][rng.int(0, 2)] as number;
  world.decay.variants = MASKS[rng.int(0, MASKS.length - 1)] as number;
  applyDecayStage(world, stage, world.decay.variants);
  world.debug.godMode = true;
  const x0 = rng.int(4, (map.widthM - 6) / BUILD_GRID_M) * BUILD_GRID_M;
  const y0 = rng.int(4, (map.heightM - 6) / BUILD_GRID_M) * BUILD_GRID_M;
  const open = rng.int(0, 2) === 0 ? rng.int(0, 3) : -1; // a third of the boxes have an open side
  let id = 1;
  let walls = 0;
  const desc: string[] = [];
  for (let side = 0; side < 4; side++) {
    if (side === open) continue;
    const w = wallSpec(side, x0, y0, rng.int(-1, 1), rng.int(0, 1));
    const type = rng.int(0, 1) === 0 ? "wood_barricade" : "metal_barricade";
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    const gx = Math.round(w.x / BUILD_GRID_M);
    const gy = Math.round(w.y / BUILD_GRID_M);
    if (footprintBlocked(world, footprint(stats, gx, gy, w.rot, box))) continue;
    addBuildingAt(world, { id: id++, type, ownerId: "p0", gx, gy, rot: w.rot, hp: stats.hp });
    walls++;
    desc.push(`${type}@(${w.x},${w.y},r${w.rot})`);
  }
  if (walls < 2) return null;
  // Review H1: a third of the boxes also hold a solid non-wall building (floodlight or med station,
  // 1 × 1 m) inside, nearer the campers than the walls (its own stream: the wall layouts stay as they were).
  const extra = createRng(seed * 31 + 5);
  let inner = false;
  if (extra.int(0, 2) === 0) {
    const type = extra.int(0, 1) === 0 ? "floodlight" : "med_station";
    const stats = buildingStats(balance, type);
    const gx = Math.round((x0 + extra.int(0, 2) * 0.5) / BUILD_GRID_M);
    const gy = Math.round((y0 + extra.int(0, 2) * 0.5) / BUILD_GRID_M);
    if (stats && !footprintBlocked(world, footprint(stats, gx, gy, 0, box))) {
      addBuildingAt(world, { id, type, ownerId: "p0", gx, gy, rot: 0, hp: stats.hp });
      desc.push(`${type}@(${gx * BUILD_GRID_M},${gy * BUILD_GRID_M})`);
      inner = true;
    }
  }
  const pr = balance.player.radiusM;
  const players: PlayerState[] = [];
  const want = rng.int(1, 3);
  for (let tries = 0; tries < 60 && players.length < want; tries++) {
    const x = x0 + rng.range(pr + 0.05, 2 - pr - 0.05);
    const y = y0 + rng.range(pr + 0.05, 2 - pr - 0.05);
    if (spotBlocked(world, x, y, pr, null)) continue;
    const p = addPlayer(world, `p${players.length}`, x, y);
    p.hp = 1e9;
    p.maxHp = 1e9;
    players.push(p);
  }
  if (players.length === 0) return null;
  const type = TYPES[rng.int(0, 1)] as ZombieTypeId;
  const rz = balance.zombies.types[type]?.radiusM ?? 0;
  const rush = rng.int(0, 1) === 0;
  for (let tries = 0; tries < 200; tries++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(2, 8);
    const x = x0 + 1 + Math.cos(a) * d;
    const y = y0 + 1 + Math.sin(a) * d;
    if (x < rz + 0.1 || y < rz + 0.1 || x > map.widthM - rz - 0.1 || y > map.heightM - rz - 0.1) continue;
    if (insideBox(world, x, y, rz + 0.05) || spotBlocked(world, x, y, rz, null)) continue;
    if (x > x0 - 1 && x < x0 + 3 && y > y0 - 1 && y < y0 + 3) continue; // outside the box
    const zid = spawnZombie(world, type, x, y);
    if (zid < 0) return null;
    if (rush) world.zombies.state[zid] = ZOMBIE_STATE.RUSH;
    return { world, id: zid, type, rush, players, closed: open < 0 && walls === 4, inner, label: `seed ${seed} stage ${stage} box (${x0},${y0}) open ${open} ${desc.join(" ")} ${type}${rush ? " RUSH" : ""} at (${x.toFixed(2)},${y.toFixed(2)}) players ${players.map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(" ")}` };
  }
  return null;
}

describe("Story 6.13: wide-body fuzz round barricade boxes with 0.5 m diagonal gaps", () => {
  it(`every Brute/Bloater reaches a player or attacks a building within ${BOUND_S} s, never stands still > ${STILL_S} s, never inside a box`, () => {
    const bound = ticksFor(BOUND_S);
    const stillMax = ticksFor(STILL_S);
    const fails: string[] = [];
    const seen = { player: 0, building: 0, bloater: 0, brute: 0, rush: 0, chase: 0, closed: 0, inner: 0, trials: 0 };
    const net0 = wideStallStats.fired;
    for (let seed = 1; seen.trials < TRIALS && seed < TRIALS * 4; seed++) {
      const t = trial(seed);
      if (!t) continue;
      seen.trials++;
      const r = runTrial(t, bound);
      seen[t.type === "bloater" ? "bloater" : "brute"]++;
      seen[t.rush ? "rush" : "chase"]++;
      if (t.closed) seen.closed++;
      if (t.inner) seen.inner++;
      if (r.outcome !== "none") seen[r.outcome]++;
      if (r.outcome === "none" || r.longestStill > stillMax || r.inBox) fails.push(`${t.label}: ${r.outcome} @${r.atTick} still ${r.longestStill} inBox ${r.inBox}`);
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[wide-body fuzz] ${JSON.stringify(seen)}; stall net fired ${wideStallStats.fired - net0}×`);
    expect(fails, fails.slice(0, 8).join("\n")).toEqual([]);
    expect(seen.trials).toBe(TRIALS);
    // Liveness (brief 9): both outcomes, both types, both states, and closed boxes really happened.
    for (const k of ["player", "building", "bloater", "brute", "rush", "chase", "closed", "inner"] as const) expect(seen[k], k).toBeGreaterThan(0);
    // The M1 shape really came up: the stall net fired (seed 128's layout, `wideBodyStall.test.ts`), and
    // only where a body was stuck (it fired 3× in 1,500 trials, exactly the 3 that stalled without it).
    expect(wideStallStats.fired - net0).toBeGreaterThan(0);
  }, 300_000);
});

/**
 * Fix bloater-car-corner (designer bug report 2026-11-25): concave corners made by TWO solids × large
 * crowds of wide bodies. Each trial builds one corner: two barricades (an L or a T: a vertical
 * barricade's end touching a horizontal one's long face, above or below, at its end or along it), or
 * the Downtown car L (`curb_car_west_n_in_road` + `curb_car_west_s_in_road`, decay stage 2+, in the
 * variants that move both). A god-mode player stands in the corner's pocket. Then 40–120 Brutes and
 * Bloaters come in the dev cheats' way (no solid check): a quarter with their centres inside the
 * junction of the two solids, the rest on a 2–9 m ring round the player (some inside other solids).
 *
 * Every trial, from the end of tick 1 on (the first push-out takes the dev-spawned centres out):
 * (i) no body ends a tick inside a solid; (ii) none stands still (< `STILL_M`) for more than
 * `STILL_S` while not attacking (swelling, winding up, touching the player). Liveness: both corner
 * kinds, both types, centres really started in a junction, and the push-out's escape really fired.
 * Without the fix, bodies with a centre in the car L's junction never leave it (`carCorner.test.ts`); the
 * barricade corners are the control: a 0.5 m barricade is thinner than a wide body, so the bounce
 * between the two boxes (it needs the horizontal box's nearest face to be the join) can't happen there.
 */
const CORNER_TRIALS = 60;
const CORNER_BOUND_S = 30;
const H_CAR = "curb_car_west_n_in_road";
const V_CAR = "curb_car_west_s_in_road";

/** The decay variants that move both west curb cars into the road (the car L), computed once. */
const CAR_MASKS = MASKS.filter((m) => {
  const w = createWorld({ balance, seed: 1, map, systems: { waves: () => {} } });
  applyDecayStage(w, 2, m);
  return w.obstacles.solids.some((s) => s.name === H_CAR) && w.obstacles.solids.some((s) => s.name === V_CAR);
});

interface CornerTrial {
  world: World;
  ids: number[];
  inJunction: number;
  car: boolean;
  label: string;
}

function cornerTrial(seed: number): CornerTrial | null {
  const rng: Rng = createRng(seed * 104_729 + 3);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  const stage = rng.int(2, 5);
  const wantCar = rng.int(0, 2) === 0;
  let h: Box | undefined;
  let v: Box | undefined;
  const desc: string[] = [];
  if (wantCar) {
    if (CAR_MASKS.length === 0) throw new Error("no decay variant puts both west curb cars in the road");
    world.decay.variants = CAR_MASKS[rng.int(0, CAR_MASKS.length - 1)] as number;
    applyDecayStage(world, stage, world.decay.variants);
    h = world.obstacles.solids.find((s) => s.name === H_CAR);
    v = world.obstacles.solids.find((s) => s.name === V_CAR);
    if (!h || !v) return null;
    desc.push("car L");
  } else {
    world.decay.variants = MASKS[rng.int(0, MASKS.length - 1)] as number;
    applyDecayStage(world, stage, world.decay.variants);
    const x0 = rng.int(4, (map.widthM - 6) / BUILD_GRID_M);
    const y0 = rng.int(6, (map.heightM - 6) / BUILD_GRID_M);
    const along = rng.int(0, 3); // 0 and 3: an L (the vertical at the horizontal's end); 1, 2: a T
    const below = rng.int(0, 1) === 0;
    const ht = rng.int(0, 1) === 0 ? "wood_barricade" : "metal_barricade";
    const vt = rng.int(0, 1) === 0 ? "wood_barricade" : "metal_barricade";
    const hs = buildingStats(balance, ht);
    const vs = buildingStats(balance, vt);
    if (!hs || !vs) return null;
    const hb = { ...footprint(hs, x0, y0, 0, box) };
    const vgx = x0 + along;
    const vgy = below ? Math.round(hb.maxY / BUILD_GRID_M) : y0 - 4;
    const vb = { ...footprint(vs, vgx, vgy, 1, box) };
    if (footprintBlocked(world, footprint(hs, x0, y0, 0, box))) return null;
    addBuildingAt(world, { id: 1, type: ht, ownerId: "p0", gx: x0, gy: y0, rot: 0, hp: hs.hp });
    if (footprintBlocked(world, footprint(vs, vgx, vgy, 1, box))) return null;
    addBuildingAt(world, { id: 2, type: vt, ownerId: "p0", gx: vgx, gy: vgy, rot: 1, hp: vs.hp });
    h = hb;
    v = vb;
    desc.push(`${ht}@(${hb.minX},${hb.minY}) ${vt}@(${vb.minX},${vb.minY})`);
  }
  // The two solids really make a concave corner: the vertical one's end on the horizontal one's long face.
  if (!(v.minY === h.maxY || v.maxY === h.minY) || v.minX < h.minX || v.maxX > h.maxX) throw new Error(`seed ${seed}: no L/T corner (${JSON.stringify([h, v])})`);
  world.debug.godMode = true;
  // The pocket: beside the vertical solid, against the horizontal one's face it touches.
  const below = v.minY >= h.maxY - 1e-9;
  const pr = balance.player.radiusM;
  const sides = [v.minX > h.minX + 2 * pr ? -1 : 0, v.maxX < h.maxX - 2 * pr ? 1 : 0].filter((s) => s !== 0);
  if (sides.length === 0) return null;
  const side = sides[rng.int(0, sides.length - 1)] as number;
  const px = side < 0 ? v.minX - pr - rng.range(0.05, 0.6) : v.maxX + pr + rng.range(0.05, 0.6);
  const py = below ? h.maxY + pr + rng.range(0.05, 0.6) : h.minY - pr - rng.range(0.05, 0.6);
  if (spotBlocked(world, px, py, pr, null)) return null;
  addPlayer(world, "p0", px, py);
  const n = rng.int(40, 120);
  const ids: number[] = [];
  let inJunction = 0;
  for (let i = 0; i < n; i++) {
    const type: ZombieTypeId = rng.int(0, 1) === 0 ? "bloater" : "brute";
    const rz = balance.zombies.types[type]?.radiusM ?? 0;
    let x: number;
    let y: number;
    if (rng.int(0, 3) === 0) {
      // A centre in the junction: in the horizontal solid next to where the vertical one meets it, or in the vertical one's end.
      if (rng.int(0, 1) === 0) {
        x = rng.range(Math.max(h.minX, v.minX - 0.6), Math.min(h.maxX, v.maxX + 0.6));
        y = rng.range(h.minY, h.maxY);
      } else {
        x = rng.range(v.minX, v.maxX);
        y = below ? rng.range(v.minY, Math.min(v.maxY, v.minY + 0.8)) : rng.range(Math.max(v.minY, v.maxY - 0.8), v.maxY);
      }
      inJunction++;
    } else {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2, 9);
      x = px + Math.cos(a) * d;
      y = py + Math.sin(a) * d;
    }
    x = Math.min(map.widthM - rz, Math.max(rz, x));
    y = Math.min(map.heightM - rz, Math.max(rz, y));
    const id = spawnZombie(world, type, x, y);
    if (id < 0) break;
    ids.push(id);
  }
  return { world, ids, inJunction, car: wantCar, label: `seed ${seed} stage ${stage} ${desc.join(" ")} player (${px.toFixed(2)},${py.toFixed(2)}) crowd ${ids.length}` };
}

describe("Fix bloater-car-corner: concave corners of two solids × crowds of wide bodies", () => {
  it(`${CORNER_TRIALS} corners (barricade L/T and the car L) × 40–120 Brutes/Bloaters: no body ends a tick in a solid, none stands still > ${STILL_S} s`, () => {
    const fails: string[] = [];
    const seen = { trials: 0, car: 0, barricades: 0, bodies: 0, inJunction: 0, bloater: 0, brute: 0, longestStill: 0, bloatersLeft: 0, bodyTicks: 0, heldTicks: 0, longestHeld: 0, notReached: 0 };
    const esc0 = pushEscapes.count;
    for (let seed = 1; seen.trials < CORNER_TRIALS && seed < CORNER_TRIALS * 20; seed++) {
      const t = cornerTrial(seed);
      if (!t) continue;
      seen.trials++;
      seen[t.car ? "car" : "barricades"]++;
      seen.bodies += t.ids.length;
      seen.inJunction += t.inJunction;
      for (const id of t.ids) seen[t.world.zombies.type[id] === zombieTypeIndex("bloater") ? "bloater" : "brute"]++;
      // Progress per body: it ends within 8 m of its player (the edge of a 120-body crowd round one player in a
      // corner), or at least 1 m nearer than it started.
      const r = runCrowd(t.world, t.ids, ticksFor(CORNER_BOUND_S), { approachOk: (s0, c) => c < 8 || c <= s0 - 1 });
      seen.longestStill = Math.max(seen.longestStill, r.longestStill);
      seen.bloatersLeft += r.bloatersLeft;
      seen.bodyTicks += r.bodyTicks;
      seen.heldTicks += r.heldTicks;
      seen.longestHeld = Math.max(seen.longestHeld, r.longestHeld);
      seen.notReached += r.notReached;
      if (r.inside.length > 0 || r.longestStill > STILL_TICKS || r.farFrom.length > 0) fails.push(`${t.label}: inside ${r.inside.slice(0, 3).join("; ")} | still ${r.longestStill} (body ${r.longestStillId}) | got nowhere ${r.farFrom.join(", ")}`);
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[corner fuzz] ${JSON.stringify(seen)}; escapes ${pushEscapes.count - esc0}`);
    expect(fails, fails.slice(0, 8).join("\n")).toEqual([]);
    expect(seen.trials).toBe(CORNER_TRIALS);
    for (const k of ["car", "barricades", "inJunction", "bloater", "brute"] as const) expect(seen[k], k).toBeGreaterThan(0);
    expect(seen.heldTicks / seen.bodyTicks, "liveness: the still rule checked a real share of free body-ticks").toBeLessThan(0.95);
    expect(pushEscapes.count - esc0, "liveness: the push-out's escape really fired").toBeGreaterThan(0);
  }, 300_000);
});
