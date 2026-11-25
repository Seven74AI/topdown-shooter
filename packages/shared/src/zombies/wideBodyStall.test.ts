import { beforeEach, describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, type BuildingRotation } from "../buildings/buildings";
import { distanceToBox } from "../buildings/collision";
import { ticksFor } from "../core/time";
import { createWorld, step } from "../core/world";
import { applyDecayStage } from "../decay/applyDecayStage";
import { DOWNTOWN_MAP } from "../map/downtown";
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

function build(l: Layout): WideTrial {
  const world = createWorld({ balance, seed: l.seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  world.decay.variants = l.variants;
  applyDecayStage(world, l.stage, l.variants);
  world.debug.godMode = true;
  let id = 1;
  for (const [x, y, rot] of l.walls) {
    const hp = buildingStats(balance, "wood_barricade")?.hp ?? 0;
    expect(addBuildingAt(world, { id: id++, type: "wood_barricade", ownerId: "p0", gx: Math.round(x / BUILD_GRID_M), gy: Math.round(y / BUILD_GRID_M), rot, hp }), `${l.name}: wall at (${x}, ${y})`).not.toBeNull();
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
