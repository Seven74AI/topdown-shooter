import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { shotLineClear } from "../combat/cover";
import { DOWNTOWN_MAP } from "../map/downtown";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { DistrictMap } from "../map/districtMap";
import { downPlayer } from "../player/downed";
import { addPlayer, type PlayerState } from "../player/player";
import { endRun, startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, type Building } from "./buildings";
import { inHealReach } from "./medStation";
import { buyGear } from "../economy/gear";

/**
 * Story 5.10: med station healing (fairness ACs 5–8, Beat the rule B1–B8, B15). One mechanic per
 * test: no wave director, zombies stand still. Liveness: every heal test asserts HP really rose.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const MED = "med_station";
const HEAL = balance.buildings.types[MED]?.heal as { radiusM: number; hpPerS: number };
const R = balance.player.radiusM;
const PER_TICK = HEAL.hpPerS * TICK_DT_S;

function setup(opts: { map?: DistrictMap; phase?: "lobby" | "build" | "wave" } = {}) {
  const world = createWorld({ balance, seed: 1, systems: STILL, ...(opts.map ? { map: opts.map } : {}) });
  const phase = opts.phase ?? "wave";
  if (phase !== "lobby") startBuild(world);
  if (phase === "wave") startWave(world);
  let nextId = 1;
  /** A building with its min corner at (x, y) metres; returns it. */
  const place = (x: number, y: number, type = MED): Building =>
    addBuildingAt(world, { id: nextId++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  return { world, place };
}
const run = (world: World, ticks: number): void => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};
function player(world: World, id: string, x: number, y: number, hp: number): PlayerState {
  addPlayer(world, id, x, y);
  const p = world.players.get(id) as PlayerState;
  p.hp = hp;
  return p;
}

describe("Story 5.10 med station (AC 4–8)", () => {
  it("balance: 300 HP, price 400, 1 × 1 m, heals 5 HP/s within 2 m; in the shop", () => {
    expect(balance.buildings.types[MED]).toMatchObject({ price: 400, hp: 300, widthM: 1, depthM: 1, inShop: true, heal: { radiusM: 2, hpPerS: 5 } });
    expect(PER_TICK).toBe(0.25);
  });

  it("liveness + cap: 50 → 100 in exactly 200 ticks (+5 HP/s), then stays at 100", () => {
    const { world, place } = setup();
    place(20, 16); // centre (20.5, 16.5)
    const p = player(world, "p0", 21.5, 16.5, 50);
    run(world, 20);
    expect(p.hp).toBeCloseTo(55, 9); // 1 s = 5 HP
    run(world, 179);
    expect(p.hp).toBeCloseTo(99.75, 9);
    run(world, 1);
    expect(p.hp).toBe(100);
    run(world, 40);
    expect(p.hp).toBe(p.maxHp);
  });

  it("review L1: the cap is exact: maxHp − 0.1 reaches exactly maxHp in one tick (100 and an armored 125), never above", () => {
    for (const armored of [false, true]) {
      const { world, place } = setup({ phase: "build" });
      place(20, 16);
      const p = player(world, "p0", 21.5, 16.5, 100);
      p.wallet = 1000;
      if (armored) expect(buyGear(world, "p0", "body_armor_1").ok).toBe(true);
      const max = p.maxHp;
      expect(max).toBe(armored ? 125 : 100);
      p.hp = max - 0.1;
      run(world, 1);
      expect(p.hp).toBe(max);
      run(world, 5);
      expect(p.hp).toBe(max);
    }
  });

  it("the ring is the edge: a body touching it (d < 2 + r) heals, d = 2 + r does not (strict)", () => {
    const inside = setup();
    const b = inside.place(20, 16);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const pIn = player(inside.world, "p0", cx + HEAL.radiusM + R - 1e-6, cy, 50);
    run(inside.world, 1);
    expect(pIn.hp).toBeCloseTo(50 + PER_TICK, 9);
    expect(inHealReach(inside.world, pIn.x, pIn.y, R)).toBe(true);

    const edge = setup();
    edge.place(20, 16);
    const pOut = player(edge.world, "p0", cx + HEAL.radiusM + R + 1e-9, cy, 50); // at the edge (+1e-9: float rounding of 20.5 + 2.4)
    run(edge.world, 40);
    expect(pOut.hp).toBe(50);
    expect(inHealReach(edge.world, pOut.x, pOut.y, R)).toBe(false);
    // Review nit: exactly d = r + r_body (a distance that is exact in binary) is outside (strict).
    const exact = setup();
    exact.place(20, 16); // centre (20.5, 16.5)
    const reach = HEAL.radiusM + 0.5; // a 0.5 m body: 2.5 m, exact
    expect(inHealReach(exact.world, 20.5 + reach, 16.5, 0.5)).toBe(false);
    expect(inHealReach(exact.world, 20.5, 16.5 - reach, 0.5)).toBe(false);
    expect(inHealReach(exact.world, 20.5 + reach - 2 ** -20, 16.5, 0.5)).toBe(true);
  });

  it("downed and out players are never healed; their countdown runs as without a station (B2); a revive then heals from the next tick (B3)", () => {
    const { world, place } = setup();
    place(20, 16);
    const a = player(world, "p0", 21.5, 16.5, 50);
    player(world, "p1", 30, 30, 100); // someone standing: no wipe
    downPlayer(world, a);
    expect(a.status).toBe("downed");
    const left = a.downedTicksLeft;
    run(world, 10);
    expect(a.hp).toBe(0);
    expect(a.downedTicksLeft).toBe(left - 10);
    // Out: still nothing.
    a.status = "out";
    a.downedTicksLeft = 0;
    run(world, 10);
    expect(a.hp).toBe(0);
    // Back alive (as a revive leaves them): healed from the next tick.
    a.status = "alive";
    a.hp = 30;
    run(world, 1);
    expect(a.hp).toBeCloseTo(30 + PER_TICK, 9);
  });

  it("phases: no heal in the lobby, on Results or after a team wipe; heals in build and wave (B7)", () => {
    const lobby = setup({ phase: "lobby" });
    lobby.place(20, 16);
    const pl = player(lobby.world, "p0", 21.5, 16.5, 50);
    run(lobby.world, 20);
    expect(pl.hp).toBe(50);

    const build = setup({ phase: "build" });
    build.place(20, 16);
    const pb = player(build.world, "p0", 21.5, 16.5, 50);
    run(build.world, 20);
    expect(pb.hp).toBeCloseTo(55, 9);

    const results = setup();
    results.place(20, 16);
    const pr = player(results.world, "p0", 21.5, 16.5, 50);
    endRun(results.world);
    run(results.world, 20);
    expect(pr.hp).toBe(50);

    const wiped = setup();
    wiped.place(20, 16);
    const pw = player(wiped.world, "p0", 21.5, 16.5, 50);
    wiped.world.teamWiped = true;
    run(wiped.world, 20);
    expect(pw.hp).toBe(50);
  });

  it("no stacking: two and three stations in reach still give 0.25 HP per tick (B1)", () => {
    for (const n of [2, 3]) {
      const { world, place } = setup();
      place(20, 16);
      place(22, 16);
      if (n === 3) place(21, 18);
      const p = player(world, "p0", 21.5, 17.2, 50);
      let reached = 0;
      for (const b of world.buildings.list) {
        const d = Math.hypot(p.x - (b.minX + b.maxX) / 2, p.y - (b.minY + b.maxY) / 2);
        if (d < HEAL.radiusM + R) reached++;
      }
      expect(reached).toBe(n);
      run(world, 20);
      expect(p.hp, `${n} stations`).toBeCloseTo(55, 9);
    }
  });

  it("no pulse to beat: stepping in and out every tick gives exactly 0.25 per tick inside (B4)", () => {
    const { world, place } = setup();
    place(20, 16);
    const p = player(world, "p0", 21.5, 16.5, 50);
    for (let t = 0; t < 40; t++) {
      p.x = t % 2 === 0 ? 21.5 : 30;
      step(world, TICK_DT_S);
    }
    expect(p.hp).toBeCloseTo(50 + 20 * PER_TICK, 9);
  });

  it("an aura: heals through a barricade and through a car (B5)", () => {
    // Barricade between (wood, 2 × 0.5 m, stops bodies; the line from station to player crosses it).
    const a = setup();
    a.place(20, 16); // station centre (20.5, 16.5)
    a.place(19.5, 17.5, "wood_barricade"); // y 17.5–18
    const pa = player(a.world, "p0", 20.5, 18.4, 50); // just past the barricade, d = 1.9
    expect(a.world.buildings.list.some((b) => b.type === "wood_barricade")).toBe(true);
    run(a.world, 20);
    expect(pa.hp).toBeCloseTo(55, 9);

    // A thin car between (shot-blocking cover).
    const car = { minX: 20, minY: 17.4, maxX: 21, maxY: 17.7 };
    const map: DistrictMap = { ...PLACEHOLDER_MAP, name: "med-car", cover: [{ name: "test_car", kind: "car", minStage: 1, ...car }] };
    const c = setup({ map });
    c.place(20, 16);
    const pc = player(c.world, "p0", 20.5, 18.2, 50);
    expect(shotLineClear(c.world, 20.5, 16.5, pc.x, pc.y)).toBe(false); // the car really is between
    run(c.world, 20);
    expect(pc.hp).toBeCloseTo(55, 9);
  });

  it("heals up to 4 players at once, each at the full rate", () => {
    const { world, place } = setup();
    place(20, 16);
    const ps = [player(world, "p0", 21.5, 16.5, 40), player(world, "p1", 19.5, 16.5, 50), player(world, "p2", 20.5, 15.4, 60), player(world, "p3", 20.5, 17.6, 70)];
    run(world, 20);
    expect(ps.map((p) => Math.round(p.hp * 1000) / 1000)).toEqual([45, 55, 65, 75]);
  });

  it("fire still hurts while healing: a stage-3 car fire next to a station is net −5 HP/s (B6)", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: STILL });
    world.debug.decayStageByWave = [3]; // the build start lights the stage-3 fires
    startBuild(world);
    startWave(world);
    expect(world.decay.stage).toBe(3);
    const f = world.decay.fires[0];
    if (!f) throw new Error("no fire");
    const carBox = world.obstacles.cover.find((c) => c.name === f.target);
    if (!carBox) throw new Error("no car");
    const px = carBox.maxX + R + 0.05; // beside the burning car
    expect(px - f.x).toBeLessThan(f.radiusM + R); // the player is in the fire
    const gx = Math.ceil((px + R) / BUILD_GRID_M);
    const gy = Math.round((f.y - 0.5) / BUILD_GRID_M);
    addBuildingAt(world, { id: 1, type: MED, ownerId: "p0", gx, gy, rot: 0, hp: 300 });
    const p = player(world, "p0", px, f.y, 80);
    expect(inHealReach(world, p.x, p.y, R)).toBe(true);
    run(world, 40); // 2 s: fire −20, heal +10
    expect(p.status).toBe("alive");
    expect(p.hp).toBeCloseTo(70, 6);
  });

  it("caps at the player's own maxHp with real 5.11 armor (body armor I: 125 heals to 125, never above) (B8)", () => {
    const { world, place } = setup({ phase: "build" });
    place(20, 16);
    const p = player(world, "p0", 21.5, 16.5, 100);
    p.wallet = 1000;
    expect(buyGear(world, "p0", "body_armor_1").ok).toBe(true);
    expect(p.maxHp).toBe(125);
    p.hp = 110;
    run(world, 200);
    expect(p.hp).toBe(125);
    p.maxHp = 100; // armor lost: above the cap is never healed further (and never raised)
    run(world, 20);
    expect(p.hp).toBe(125);
  });

  it("zombies and buildings are never healed (B15)", () => {
    const { world, place } = setup();
    const b = place(20, 16);
    const wall = place(21.5, 16, "wood_barricade");
    b.hp = 100;
    wall.hp = 50;
    player(world, "p0", 30, 30, 100);
    const z = spawnZombie(world, "walker", 21.6, 17.2);
    world.zombies.hp[z] = 3;
    run(world, 40);
    expect(b.hp).toBe(100);
    expect(wall.hp).toBe(50);
    expect(world.zombies.hp[z]).toBe(3);
  });
});
