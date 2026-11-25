import { beforeEach, describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, type Balance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, removeBuilding, type BuildingRotation } from "../buildings/buildings";
import { distanceToBox, segmentHitsBuildings } from "../buildings/collision";
import { ticksFor } from "../core/time";
import { createWorld, step } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { DOWNTOWN_MAP } from "../map/downtown";
import { snapshotPathing } from "./flowField";
import { addPlayer, type PlayerState } from "../player/player";
import { STILL_S, runTrial, type WideTrial } from "./wideBody.testkit";
import { wideStallStats } from "./zombieAi";
import { spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 6.13 (6.8 review M1): the wide-body stall. Three Downtown layouts found by the wide-body
 * fuzz (`wideBody.fuzz.test.ts`, trials 128, 2084, 2485): campers in a barricade box whose corners
 * leave 0.5 m diagonal gaps (or a 1 m mouth against map cover), too narrow for a wide body. The wide
 * field is seeded round the players, so the mouth is the field's end; before the fix the body
 * shuttled there for the whole 45 s (705–799 ticks without moving 0.25 m), touching map cover only,
 * so a Bloater never swelled and "1 remaining" never ended. Now: after `wideStuckS` it goes for the
 * box's barricade and attacks it (a Bloater swells on it) well within the bound, and it never stands
 * still longer than the fairness rule's `STILL_S`.
 */
const balance = loadBalance();
const PATH = balance.zombies.pathing;

interface Layout {
  name: string;
  seed: number;
  stage: number;
  variants: number;
  /** Barricades: min corner (m) and rotation. */
  walls: [number, number, BuildingRotation][];
  players: [number, number][];
  type: ZombieTypeId;
  rush: boolean;
  at: [number, number];
  /** Review H1: solid non-wall buildings inside the box (type, min corner). */
  inner?: [string, number, number][];
}

const LAYOUTS: Layout[] = [
  // The M1 shape: north wall [24, 26] × [19.5, 20] and east wall [26, 26.5] × [20.5, 22.5] meet at a
  // 0.5 m diagonal gap; the RUSH Bloater comes from the north-east.
  { name: "RUSH Bloater, 0.5 m diagonal gap (fuzz 2485, stage 4)", seed: 2485, stage: 4, variants: 1359, walls: [[24, 19.5, 0], [23, 20.5, 1], [26, 20.5, 1]], players: [[24.54202585427556, 21.94099220565986], [25.392953085759654, 22.019499387522227]], type: "bloater", rush: true, at: [27.480440139770508, 19.946823120117188] },
  // A 1 m mouth between rubble_pile_3 and the east barricade (fuzz 128, stage 5).
  { name: "RUSH Bloater, 1 m mouth against rubble (fuzz 128, stage 5)", seed: 128, stage: 5, variants: 1431, walls: [[37.5, 5, 0], [40, 2.5, 1]], players: [[39.4830103476299, 3.458763698139228]], type: "bloater", rush: true, at: [38.512699127197266, 6.8173699378967285] },
  // A Brute (CHASE) at the 0.5 m diagonal gap between [8, 10] × [10.5, 11] and [10, 10.5] × [9, 11] (fuzz 2084, stage 1).
  { name: "Brute, 0.5 m diagonal gap (fuzz 2084, stage 1)", seed: 2084, stage: 1, variants: 2426, walls: [[8, 10.5, 0], [10, 9, 1]], players: [[8.499911322630942, 9.842021998763084]], type: "brute", rush: false, at: [1.9444670677185059, 11.61085319519043] },
];

const BRUTE_2084 = LAYOUTS[2] as Layout;
/** Review H1: layout 2084 with a solid non-wall building inside the box, nearer the camper than the walls. */
const INNER: Layout[] = [
  { ...BRUTE_2084, name: "Brute, 0.5 m diagonal gap, floodlight in the box (review H1)", inner: [["floodlight", 9, 9]] },
  { ...BRUTE_2084, name: "Brute, 0.5 m diagonal gap, med station in the box (review H1)", inner: [["med_station", 9, 9]] },
];

/** Steps `t` until the net has fired (fails after `maxS`); returns the tick count. */
function untilStuck(t: WideTrial, maxS = 20): number {
  const pr = t.world.pathing.progress;
  for (let k = 1; k <= ticksFor(maxS); k++) {
    step(t.world, TICK_DT_S);
    if (pr.stuck[t.id] === 1) return k;
  }
  throw new Error(`${t.label}: the net never fired`);
}

function build(l: Layout, bal: Balance = balance): WideTrial {
  const world = createWorld({ balance: bal, seed: l.seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  world.decay.variants = l.variants;
  applyDecayStage(world, l.stage, l.variants);
  world.debug.godMode = true;
  let id = 1;
  for (const [x, y, rot] of l.walls) {
    const hp = buildingStats(balance, "wood_barricade")?.hp ?? 0;
    expect(addBuildingAt(world, { id: id++, type: "wood_barricade", ownerId: "p0", gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot, hp }), `${l.name}: wall at (${x}, ${y})`).not.toBeNull();
  }
  for (const [type, x, y] of l.inner ?? []) {
    const hp = buildingStats(balance, type)?.hp ?? 0;
    expect(addBuildingAt(world, { id: id++, type, ownerId: "p0", gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot: 0, hp }), `${l.name}: ${type}`).not.toBeNull();
  }
  const players: PlayerState[] = l.players.map(([x, y], i) => {
    const p = addPlayer(world, `p${i}`, x, y);
    p.hp = 1e9;
    p.maxHp = 1e9;
    return p;
  });
  const zid = spawnZombie(world, l.type, l.at[0], l.at[1]);
  if (l.rush) world.zombies.state[zid] = ZOMBIE_STATE.RUSH;
  return { world, id: zid, type: l.type, rush: l.rush, players, closed: false, label: l.name };
}

beforeEach(() => {
  wideStallStats.fired = 0;
});

describe("Story 6.13: a wide body shut out of a barricade box never stalls (6.8 review M1)", () => {
  for (const l of LAYOUTS) {
    it(`${l.name}: the net fires once and it attacks the box's barricade within 45 s, never still > ${STILL_S} s`, () => {
      const t = build(l);
      const r = runTrial(t, ticksFor(45));
      expect(r.outcome, `${l.name} (@${r.atTick}, still ${r.longestStill})`).toBe("building");
      expect(r.longestStill).toBeLessThanOrEqual(ticksFor(STILL_S));
      expect(r.inBox).toBeNull();
      expect(wideStallStats.fired).toBe(1); // liveness: it was the new net, not luck
      // The building it went for is one of the box's barricades, in reach.
      const bid = t.world.pathing.progress.stuckBuilding[t.id] as number;
      const b = t.world.buildings.list.find((x) => x.id === bid);
      expect(b, "the stuck target is a live barricade").toBeDefined();
      const rz = balance.zombies.types[l.type]?.radiusM ?? 0;
      const z = t.world.zombies;
      if (b) expect(distanceToBox(z.x[t.id] as number, z.y[t.id] as number, b.minX, b.minY, b.maxX, b.maxY)).toBeLessThanOrEqual(rz + 0.05);
      if (l.type === "bloater") expect(z.state[t.id]).toBe(ZOMBIE_STATE.SWELL); // it swells on the barricade (its blast reaches the campers)
    });
  }

  for (const l of INNER) {
    it(`${l.name}: it goes for a barricade it can touch, never the building inside; never still > ${STILL_S} s`, () => {
      const t = build(l);
      const innerId = t.world.buildings.list.find((b) => b.type === (l.inner?.[0]?.[0] ?? ""))?.id ?? -1;
      let pickedInner = false;
      const r = runTrial(t, ticksFor(45), () => {
        if (t.world.pathing.progress.stuckBuilding[t.id] === innerId) pickedInner = true;
      });
      expect(pickedInner, "the building inside the box is never the stuck target (nearest the body)").toBe(false);
      expect(r.outcome, `${l.name} (@${r.atTick}, still ${r.longestStill})`).toBe("building");
      expect(r.longestStill).toBeLessThanOrEqual(ticksFor(STILL_S));
      expect(wideStallStats.fired).toBeGreaterThanOrEqual(1);
      const bid = t.world.pathing.progress.stuckBuilding[t.id] as number;
      expect(bid).not.toBe(innerId);
      expect(t.world.buildings.list.find((b) => b.id === bid)?.type).toBe("wood_barricade");
      expect(t.world.buildings.list.find((b) => b.id === innerId)?.hp, "the building inside is untouched").toBe(buildingStats(balance, l.inner?.[0]?.[0] ?? "")?.hp);
    });
  }

  it("review H1: a stuck target it can't touch is given up after wideStuckS, excluded, and a reachable barricade is picked", () => {
    const t = build(INNER[0] as Layout);
    untilStuck(t);
    const pr = t.world.pathing.progress;
    const innerId = t.world.buildings.list.find((b) => b.type === "floodlight")?.id ?? -1;
    pr.stuckBuilding[t.id] = innerId; // the pre-review pick: nearest the camper, behind the 0.5 m gap
    pr.stuckDist[t.id] = 0; // it can never get closer than this
    let gaveUp = -1;
    for (let k = 1; k <= ticksFor(5) && gaveUp < 0; k++) {
      step(t.world, TICK_DT_S);
      if (pr.stuckSkip[t.id] === innerId) gaveUp = k;
    }
    expect(gaveUp, "gave the floodlight up").toBeGreaterThan(0);
    expect(gaveUp).toBeLessThanOrEqual(ticksFor(PATH.wideStuckS) + 1);
    expect(pr.stuck[t.id]).toBe(1); // picked again at once, never the excluded floodlight
    expect(pr.stuckBuilding[t.id]).not.toBe(innerId);
    expect(pr.stuckBuilding[t.id]).toBeGreaterThan(0);
  });

  it("AC 3 (review M1): a wide body held still on an ordinary field cell (the field has a next cell) never fires the net", () => {
    // A Brute slowed to a crawl (as if packed in a crowd) behind a 6 m wall with the player beyond:
    // the line is blocked, it moves < 0.25 m in 10 s next to a barricade, but its field leads round.
    const files = bundledBalanceFiles() as unknown as { zombies: { types: Record<string, { speedMps: number }> } };
    (files.zombies.types.brute as { speedMps: number }).speedMps = 0.01;
    const slow = loadBalance(files as unknown as Parameters<typeof loadBalance>[0]);
    const world = createWorld({ balance: slow, seed: 1, systems: { waves: () => {} } });
    world.debug.godMode = true;
    const hp = buildingStats(balance, "wood_barricade")?.hp ?? 0;
    for (const [i, x] of [19, 21, 23].entries()) addBuildingAt(world, { id: i + 1, type: "wood_barricade", ownerId: "p0", gx: x / BUILD_GRID_M, gy: 10.5 / BUILD_GRID_M, rot: 0, hp });
    addPlayer(world, "p0", 22, 8);
    const id = spawnZombie(world, "brute", 22, 11.8);
    for (let k = 0; k < ticksFor(10); k++) step(world, TICK_DT_S);
    expect(Math.hypot((world.zombies.x[id] as number) - 22, (world.zombies.y[id] as number) - 11.8)).toBeLessThan(PATH.wideStuckProgressM);
    expect(wideStallStats.fired).toBe(0);
    for (const b of world.buildings.list) expect(b.hp).toBe(hp);
  });

  it("exits: the line clears → record cleared; the stuck building is gone → record cleared and it reaches the player", () => {
    // Line clears: a body resting on a wall always counts as blocked (LOS margin), so shove the Brute
    // 1.9 m west into the open street and put the camper 1.2 m south of it (clear line, not touching).
    const a = build(LAYOUTS[2] as Layout);
    untilStuck(a);
    const pa = a.world.pathing.progress;
    const p = a.players[0] as PlayerState;
    // The first open spot west of it (searched: the layout's street cover is not hard-coded here).
    let zx = 0;
    let zy = 0;
    for (let dx = 1; dx <= 6 && zx === 0; dx += 0.5) {
      for (let dy = -3; dy <= 3 && zx === 0; dy += 0.5) {
        const cx = (a.world.zombies.x[a.id] as number) - dx;
        const cy = (a.world.zombies.y[a.id] as number) + dy;
        if (!segmentHitsBuildings(a.world, cx, cy, cx, cy + 1.2, 0.7)) {
          zx = cx;
          zy = cy;
        }
      }
    }
    expect(zx, "an open spot").toBeGreaterThan(0);
    a.world.zombies.x[a.id] = zx;
    a.world.zombies.y[a.id] = zy;
    p.x = zx;
    p.y = zy + 1.2;
    pa.anchorX[a.id] = p.x; // not the "target moved" exit: only the clear line can end it
    pa.anchorY[a.id] = p.y;
    step(a.world, TICK_DT_S);
    expect(pa.stuck[a.id]).toBe(0);
    expect(pa.stuckBuilding[a.id]).toBe(0);
    // Building gone (sold or broken).
    const b = build(LAYOUTS[2] as Layout);
    untilStuck(b);
    const pb = b.world.pathing.progress;
    removeBuilding(b.world, pb.stuckBuilding[b.id] as number);
    step(b.world, TICK_DT_S);
    expect(pb.stuck[b.id]).toBe(0);
    const r = runTrial(b, ticksFor(20));
    expect(r.outcome).toBe("player");
  });

  // Review L1: when another wall falls the body leaves the stuck state (here by the clear-line exit as
  // the field and its line change together; the open-way rule is the backstop and has no isolated test).
  it("exit (review L1): another wall falls → it leaves the stuck state without giving its wall up", () => {
    const t = build(LAYOUTS[2] as Layout);
    untilStuck(t);
    const pr = t.world.pathing.progress;
    const stuckOn = pr.stuckBuilding[t.id] as number;
    for (const b of [...t.world.buildings.list]) if (b.id !== stuckOn) removeBuilding(t.world, b.id);
    const hp = t.world.buildings.list.find((b) => b.id === stuckOn)?.hp ?? 0;
    // Keep the stuck wall standing (it can't break it) so only the open-way rule can end the state.
    let cleared = -1;
    for (let k = 1; k <= ticksFor(6) && cleared < 0; k++) {
      const b = t.world.buildings.list.find((x) => x.id === stuckOn);
      if (b) b.hp = hp;
      step(t.world, TICK_DT_S);
      if (pr.stuck[t.id] === 0) cleared = k;
    }
    expect(cleared, "left the stuck state").toBeGreaterThan(0);
    expect(pr.stuckSkip[t.id], "not by giving the wall up").toBe(0);
  });

  it("exit (review L1): the target moved more than wideStuckReachM from where it stood when the net fired → record cleared", () => {
    const t = build(LAYOUTS[2] as Layout);
    untilStuck(t);
    const pr = t.world.pathing.progress;
    pr.anchorX[t.id] = (pr.anchorX[t.id] as number) - (PATH.wideStuckReachM + 0.1); // as if the camper had walked off
    step(t.world, TICK_DT_S);
    expect(pr.stuck[t.id]).toBe(0);
    expect(pr.stuckBuilding[t.id]).toBe(0);
  });

  it("a reused slot (new pool generation) starts a fresh record", () => {
    const t = build(LAYOUTS[2] as Layout);
    untilStuck(t);
    const pr = t.world.pathing.progress;
    pr.gen[t.id] = ((t.world.zombies.generation[t.id] as number) + 1) & 0xff; // the record of the slot's previous owner
    step(t.world, TICK_DT_S);
    expect(pr.stuck[t.id]).toBe(0);
    expect(pr.stuckBuilding[t.id]).toBe(0);
    expect(pr.ticks[t.id]).toBeLessThanOrEqual(1);
  });

  it("reach and review L3: with nothing in wideStuckReachM it never fires, and it rescans once per wideStuckS (the count restarts)", () => {
    const files = bundledBalanceFiles() as unknown as { zombies: { pathing: { wideStuckReachM: number } } };
    files.zombies.pathing.wideStuckReachM = 0.3; // the barricades it rests on are 0.6 m from its centre
    const near = loadBalance(files as unknown as Parameters<typeof loadBalance>[0]);
    const t = build(LAYOUTS[2] as Layout, near);
    const pr = t.world.pathing.progress;
    let maxTicks = 0;
    let restarts = 0;
    let last = 0;
    for (let k = 0; k < ticksFor(15); k++) {
      step(t.world, TICK_DT_S);
      const v = pr.ticks[t.id] as number;
      maxTicks = Math.max(maxTicks, v);
      if (v < last && last >= ticksFor(near.zombies.pathing.wideStuckS)) restarts++;
      last = v;
    }
    expect(wideStallStats.fired).toBe(0);
    expect(maxTicks).toBeLessThanOrEqual(ticksFor(near.zombies.pathing.wideStuckS));
    expect(restarts, "the count restarted after each empty scan").toBeGreaterThan(0);
  });

  it("determinism: every field of the stuck record is in the pathing snapshot hash", () => {
    const base = build(LAYOUTS[2] as Layout).world.pathing;
    const h0 = snapshotPathing(base).progressHash;
    const pr = base.progress;
    for (const [arr, v] of [[pr.stuckBuilding, 3], [pr.stuckOpen, 2], [pr.stuckSkip, 4], [pr.stuckDist, 1.5]] as const) {
      const old = arr[0] as number;
      arr[0] = v;
      expect(snapshotPathing(base).progressHash).not.toBe(h0);
      arr[0] = old;
    }
    expect(snapshotPathing(base).progressHash).toBe(h0);
  });

  it("balance: wideStuckS must be whole ticks", () => {
    const files = bundledBalanceFiles() as unknown as { zombies: { pathing: { wideStuckS: number } } };
    files.zombies.pathing.wideStuckS = 0.07;
    expect(() => loadBalance(files as unknown as Parameters<typeof loadBalance>[0])).toThrow(/wideStuckS/);
  });

  it("the stuck record is cleared once the line is clear, and an ordinary detour round a wall never fires the net", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    world.debug.godMode = true;
    const hp = buildingStats(balance, "wood_barricade")?.hp ?? 0;
    // A 6 m wall between a Brute and the player: it walks round (the field always has a next cell).
    for (const [i, x] of [19, 21, 23].entries()) addBuildingAt(world, { id: i + 1, type: "wood_barricade", ownerId: "p0", gx: x / BUILD_GRID_M, gy: 10.5 / BUILD_GRID_M, rot: 0, hp });
    addPlayer(world, "p0", 22, 8);
    const id = spawnZombie(world, "brute", 22, 14);
    let touched = -1;
    for (let k = 0; k < ticksFor(30) && touched < 0; k++) {
      step(world, TICK_DT_S);
      if (Math.hypot((world.zombies.x[id] as number) - 22, (world.zombies.y[id] as number) - 8) < 1.2) touched = k;
    }
    expect(touched).toBeGreaterThan(0);
    expect(wideStallStats.fired).toBe(0);
    for (const b of world.buildings.list) expect(b.hp).toBe(hp);
    const pr = world.pathing.progress;
    expect(pr.stuck[id]).toBe(0);
    expect(pr.stuckBuilding[id]).toBe(0);
  });

  it("balance: the net's numbers come from zombies.json (2 s, 0.25 m, 2.5 m)", () => {
    expect(PATH.wideStuckS).toBe(2);
    expect(PATH.wideStuckProgressM).toBe(0.25);
    expect(PATH.wideStuckReachM).toBe(2.5);
  });
});
