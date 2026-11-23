import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint } from "../buildings/buildings";
import { circleHitsBuilding, circleOverlapsBox, PUSH_STUCK, pushOutOfBuildings, pushed } from "../buildings/collision";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { DistrictMap, MapBox } from "../map/districtMap";
import { downPlayer, returnOutPlayers } from "../player/downed";
import { boxBlocked, findFreeSpotNear, spotBlocked } from "../player/freeSpot";
import { addPlayer, type PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { applyDecayStage } from "./applyDecayStage";
import { legalDecayMasks, type FireRecord } from "./decayState";
import { decayMutate, moveOutOfNewFires, relocateBodies, relocated } from "./decaySystem";
import { circleInFire } from "./fire";

/**
 * Story 4.8 re-review (2026-11-23): nobody the sim places at a build start lands in a fire.
 * H1 (returns), relocation from a box, the run-start placement, L1 (the push-out's ring fallback and
 * the all-failed count) and L2 (the burn clock restarts at every build start).
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const noop: SystemFn = () => {};
const QUIET = { waves: noop, zombies: noop, buildings: noop, combat: noop };
const PULSE_TICKS = Math.round(balance.decay.fire.pulseS / TICK_DT_S);
const FIRE_VARIANTS = ["fire_parked_car_1", "fire_parked_car_2", "fire_street_car_west"] as const;

function maskOf(map: DistrictMap, ...names: string[]): number {
  let m = 0;
  for (const n of names) {
    const i = map.decayVariants.findIndex((v) => v.name === n);
    if (i < 0) throw new Error(`no variant ${n}`);
    m |= 1 << i;
  }
  return m >>> 0;
}
/** Every pair of the three candidates (a run burns two). */
const PAIRS: [string, string][] = [
  [FIRE_VARIANTS[0], FIRE_VARIANTS[1]],
  [FIRE_VARIANTS[0], FIRE_VARIANTS[2]],
  [FIRE_VARIANTS[1], FIRE_VARIANTS[2]],
];
const place = (p: PlayerState, x: number, y: number) => {
  p.x = p.prevX = x;
  p.y = p.prevY = y;
};
const inFire = (w: World, p: PlayerState) => circleInFire(w.decay.fires, p.x, p.y, p.radiusM);

/** A build-phase Downtown World with the pair burning (stage 3), the given players placed at (1, 1). */
function burning(pair: [string, string], ids: string[]) {
  const w = createWorld({ balance, seed: 5, map: DT, systems: QUIET });
  const players = ids.map((id) => addPlayer(w, id, 1, 1));
  startBuild(w);
  applyDecayStage(w, 3, maskOf(DT, ...pair));
  expect(w.decay.fires).toHaveLength(2);
  return { w, players };
}

describe("Story 4.8 re-review H1: a player returned at a build start never lands in a fire", () => {
  it("teammate swept round every burning car (inside the zone and pushed out by M1, at the ring, just outside): every return is outside every fire", () => {
    let returns = 0;
    let naiveInFire = 0; // liveness: the fire-blind search would have put them in the fire
    let pushedByM1 = 0;
    const tmp = { x: 0, y: 0 };
    for (const pair of PAIRS) {
      const { w, players } = burning(pair, ["mate", "back"]);
      const [mate, back] = players as [PlayerState, PlayerState];
      for (const f of [...w.decay.fires]) {
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * 2 * Math.PI;
          for (const extra of [-1.2, -0.4, 0, 0.3, 0.8]) {
            const d = f.radiusM + mate.radiusM + 1e-6 + extra;
            place(mate, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d);
            place(back, 40, 3);
            back.status = "alive";
            downPlayer(w, back); // downed before M1's step (it spares downed bodies)
            if (boxBlocked(w, mate.x, mate.y, mate.radiusM)) continue;
            if (extra < 0) {
              // The build-start order: M1 pushes the standing teammate out of a new fire first.
              moveOutOfNewFires(w, w.decay.fires);
              if (relocated.outOfFire !== 1) continue;
              pushedByM1++;
            }
            if (inFire(w, mate)) continue;
            if (findFreeSpotNear(w, mate.x, mate.y, back, tmp, balance.player.returnSearchRings, false, false) && circleInFire(w.decay.fires, tmp.x, tmp.y, back.radiusM)) naiveInFire++;
            returnOutPlayers(w);
            expect(back.status).toBe("alive");
            returns++;
            expect(inFire(w, back), `${f.target} angle ${k} extra ${extra}: returned at (${back.x}, ${back.y})`).toBe(false);
            expect(spotBlocked(w, back.x, back.y, back.radiusM, back)).toBe(false);
            expect(w.decay.fires).toHaveLength(2);
          }
        }
      }
    }
    expect(returns).toBeGreaterThan(300);
    expect(pushedByM1).toBeGreaterThan(50);
    expect(naiveInFire).toBeGreaterThan(30);
  });

  it("the real build start (stage 3 lit now): a downed player returns beside a teammate M1 pushed to the ring, outside both fires", () => {
    let checked = 0;
    for (const pair of PAIRS) {
      for (let k = 0; k < 8; k++) {
        const w = createWorld({ balance, seed: 5, map: DT, systems: QUIET });
        w.debug.decayStageByWave = [3, 3, 3, 3, 3];
        w.decay.variants = (w.decay.variants & ~maskOf(DT, ...FIRE_VARIANTS)) | maskOf(DT, ...pair);
        const car = DT.cover.find((c) => c.name === pair[0].replace("fire_", "")) as MapBox;
        const cx = (car.minX + car.maxX) / 2;
        const cy = (car.minY + car.maxY) / 2;
        const a = (k / 8) * 2 * Math.PI;
        const mate = addPlayer(w, "mate", cx + Math.cos(a) * 2.2, cy + Math.sin(a) * 2.2);
        if (circleHitsBuilding(w, mate.x, mate.y, mate.radiusM)) continue;
        const back = addPlayer(w, "back", 40, 3);
        downPlayer(w, back);
        startBuild(w);
        expect(w.decay.fires).toHaveLength(2);
        expect(relocated.outOfFire).toBe(1);
        expect(back.status).toBe("alive");
        expect(inFire(w, mate)).toBe(false);
        expect(inFire(w, back), `${pair[0]} angle ${k}`).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8);
  });
});

describe("Story 4.8 re-review: relocation and run-start placement avoid fires", () => {
  it("a player pushed out of a box (here: the burning car itself) never lands in a fire still burning", () => {
    let moved = 0;
    let pushInFire = 0; // liveness: the plain push-out lands in the fire
    for (const pair of PAIRS) {
      const { w, players } = burning(pair, ["p"]);
      const p = players[0] as PlayerState;
      for (const f of w.decay.fires) {
        const car = DT.cover.find((c) => c.name === f.target) as MapBox;
        for (let x = car.minX + 0.1; x < car.maxX; x += 0.4) {
          for (let y = car.minY + 0.1; y < car.maxY; y += 0.4) {
            place(p, x, y);
            if (pushOutOfBuildings(w, x, y, p.radiusM, x, y) !== PUSH_STUCK && circleInFire(w.decay.fires, pushed.x, pushed.y, p.radiusM)) pushInFire++;
            relocateBodies(w);
            expect(relocated.players).toBe(1);
            moved++;
            expect(inFire(w, p), `${f.target} from (${x.toFixed(1)}, ${y.toFixed(1)}) to (${p.x}, ${p.y})`).toBe(false);
            expect(circleHitsBuilding(w, p.x, p.y, p.radiusM)).toBe(false);
          }
        }
      }
    }
    expect(moved).toBeGreaterThan(100);
    expect(pushInFire).toBeGreaterThan(50);
  });

  it("run-start placement (no mid-run join exists: players join at the team starts): with stage 3 from the first build start, nobody stands in a fire, for every combination", () => {
    const at = { x: 0, y: 0 };
    let checked = 0;
    for (const mask of legalDecayMasks(DT)) {
      const w = createWorld({ balance, seed: 5, map: DT, systems: QUIET });
      w.debug.decayStageByWave = [3, 3, 3, 3, 3];
      w.decay.variants = mask;
      const ps: PlayerState[] = [];
      for (let slot = 0; slot < 4; slot++) ps.push(addPlayer(w, `p${slot}`, teamSpawnPoint(w, slot, at).x, at.y));
      // A fifth "late" body standing on a burning car's ring at the run start (the dev stage table).
      const f0 = DT.decay.find((m) => m.action === "ignite" && m.variant >= 0 && ((mask >>> m.variant) & 1) === 1);
      if (!f0) throw new Error("no fire in the mask");
      const gap = balance.player.radiusM + 0.05; // just off the car's long face, inside the 2 m zone
      const narrow = f0.maxX - f0.minX < f0.maxY - f0.minY;
      ps.push(addPlayer(w, "late", narrow ? f0.minX - gap : (f0.minX + f0.maxX) / 2, narrow ? (f0.minY + f0.maxY) / 2 : f0.minY - gap));
      startBuild(w);
      expect(w.decay.fires).toHaveLength(2);
      expect(relocated.outOfFire).toBe(1); // liveness: the late body stood in a fire that lit now
      for (const p of ps) {
        expect(p.status).toBe("alive");
        expect(inFire(w, p), `mask ${mask} ${p.id}`).toBe(false);
      }
      checked++;
    }
    expect(checked).toBe(45);
  });
});

describe("Fix re-review (2026-11-23): relocation's team-start step and the counts", () => {
  /** A player at street_car_west's centre (inside the car box and its new fire), ring 1 only. */
  function stuckInCar() {
    const b = { ...balance, player: { ...balance.player, returnSearchRings: 1 }, decay: { ...balance.decay, relocateSearchRings: 1 } };
    const w = createWorld({ balance: b, seed: 5, map: DT, systems: QUIET });
    const p = addPlayer(w, "p", 1, 1);
    startBuild(w);
    applyDecayStage(w, 3, maskOf(DT, "fire_street_car_west"));
    const f = w.decay.fires[0] as FireRecord;
    place(p, f.x, f.y); // ring 1 (1.5 m) lies inside the 2 m zone in every direction
    return { w, p, f };
  }

  it("L1: with every ring spot in the fire, relocation skips a team start that is in a fire and takes the next one", () => {
    const { w, p } = stuckInCar();
    const at = { x: 0, y: 0 };
    const s0 = { ...teamSpawnPoint(w, 0, at) };
    const s1 = { ...teamSpawnPoint(w, 1, at) };
    // A (test-only) fire on team start 0.
    (w.decay.fires as FireRecord[]).push({ name: "test_fire", target: "none", x: s0.x, y: s0.y, radiusM: 1, stage: 3, index: 31 });
    relocateBodies(w);
    expect(relocated.players).toBe(1);
    expect(relocated.leftInFire).toBe(0);
    expect([p.x, p.y]).toEqual([s1.x, s1.y]); // liveness: the team-start step was reached, slot 0 skipped
    expect(inFire(w, p)).toBe(false);
  });

  it("L2: a build start that changes nothing leaves no stale relocation counts", () => {
    const { w } = stuckInCar();
    relocateBodies(w);
    expect(relocated.players).toBe(1);
    relocated.leftInFire = 3; // as if an earlier build start had counted some
    expect(decayMutate(w, 3)).toBe(false); // stage 3 again: nothing changes
    expect(relocated.players).toBe(0);
    expect(relocated.leftInFire).toBe(0);
  });
});

describe("Story 4.8 re-review L1: the push-out out of a new fire", () => {
  /** street_car_west alone, lit as new; a player at its centre's north edge inside the zone. */
  function setup(overrides: { rings?: number } = {}) {
    const b = overrides.rings === undefined ? balance : { ...balance, decay: { ...balance.decay, relocateSearchRings: overrides.rings } };
    const w = createWorld({ balance: b, seed: 5, map: DT, systems: QUIET });
    const p = addPlayer(w, "p", 1, 1);
    startBuild(w);
    applyDecayStage(w, 3, maskOf(DT, "fire_street_car_west"));
    const f = w.decay.fires[0] as FireRecord;
    const car = DT.cover.find((c) => c.name === "street_car_west") as MapBox;
    place(p, f.x, car.minY - p.radiusM - 0.05);
    expect(inFire(w, p)).toBe(true);
    // Every one of the 16 exits round the zone taken by a zombie.
    const d = f.radiusM + p.radiusM + 1e-6;
    const a0 = Math.atan2(p.y - f.y, p.x - f.x);
    for (let k = 0; k < 16; k++) spawnZombie(w, "walker", f.x + Math.cos(a0 + (k * Math.PI) / 8) * d, f.y + Math.sin(a0 + (k * Math.PI) / 8) * d);
    return { w, p, f };
  }

  it("with every exit taken it takes the first ring spot round the fire that is outside every fire (not the team starts)", () => {
    const { w, p, f } = setup();
    expect(moveOutOfNewFires(w, w.decay.fires)).toBe(1);
    expect(inFire(w, p)).toBe(false);
    expect(spotBlocked(w, p.x, p.y, p.radiusM, p)).toBe(false);
    const at = { x: 0, y: 0 };
    for (let slot = 0; slot < 4; slot++) expect(Math.hypot(p.x - teamSpawnPoint(w, slot, at).x, p.y - at.y)).toBeGreaterThan(1);
    expect(Math.hypot(p.x - f.x, p.y - f.y)).toBeLessThan(balance.decay.relocateSearchRings * balance.player.spawnOffsetM + 1e-9);
  });

  it("when every candidate fails the player is counted (relocated.leftInFire), like playersStuck", () => {
    const { w, p } = setup({ rings: 1 }); // ring 1 round the centre (1.5 m) is inside the 2 m zone
    const at = { x: 0, y: 0 };
    for (let slot = 0; slot < 4; slot++) spawnZombie(w, "walker", teamSpawnPoint(w, slot, at).x, at.y);
    const x0 = p.x;
    expect(moveOutOfNewFires(w, w.decay.fires)).toBe(0);
    expect(p.x).toBe(x0);
    expect(relocated.leftInFire).toBe(1);
  });
});

/** A wood barricade (placed after the ignition) whose footprint overlaps `f`, clear of solids. */
function buildingInFire(w: World, f: FireRecord) {
  const stats = buildingStats(balance, "wood_barricade");
  if (!stats) throw new Error("wood");
  const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (let gy = 0; gy < 64; gy++) {
    for (let gx = 0; gx < 96; gx++) {
      footprint(stats, gx, gy, 0, box);
      if (!circleOverlapsBox(f.x, f.y, f.radiusM, box.minX, box.minY, box.maxX, box.maxY)) continue;
      if (w.obstacles.solids.some((s) => box.minX < s.maxX && box.maxX > s.minX && box.minY < s.maxY && box.maxY > s.minY)) continue;
      const b = addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p", gx, gy, rot: 0, hp: stats.hp });
      if (b) return b;
    }
  }
  throw new Error("no spot in the fire");
}

describe("Story 4.8 re-review L2: a body's burn clock restarts at every build start", () => {
  it("9 ticks of fire in one wave and 1 in the next cost nothing (players, zombies, buildings); within a wave the clock is kept", () => {
    const w = createWorld({ balance, seed: 5, map: DT, systems: QUIET });
    w.debug.decayStageByWave = [3, 3, 3, 3, 3];
    w.decay.variants = (w.decay.variants & ~maskOf(DT, ...FIRE_VARIANTS)) | maskOf(DT, "fire_street_car_west", "fire_parked_car_1");
    const p = addPlayer(w, "p", 1, 1);
    startBuild(w); // lit now (stage 3 from wave 1)
    const f = w.decay.fires.find((g) => g.target === "street_car_west") as FireRecord;
    const car = DT.cover.find((c) => c.name === "street_car_west") as MapBox;
    const inY = car.minY - p.radiusM - 0.05;
    const outY = f.y - f.radiusM - p.radiusM - 0.5;
    const z = spawnZombie(w, "walker", f.x, car.maxY + 0.4);
    w.zombies.hp[z] = 100;
    const wood = buildingStats(balance, "wood_barricade");
    if (!wood) throw new Error("wood");
    const b = buildingInFire(w, f);
    const zx = w.zombies.x[z] as number;
    const zy = w.zombies.y[z] as number;
    startWave(w);
    place(p, f.x, inY);
    for (let t = 0; t < PULSE_TICKS - 1; t++) step(w, TICK_DT_S);
    expect(circleInFire(w.decay.fires, zx, zy, 0.35)).toBe(true);
    expect([p.fireTicks, w.zombies.fireTicks[z], b.fireTicks]).toEqual([PULSE_TICKS - 1, PULSE_TICKS - 1, PULSE_TICKS - 1]); // kept within the wave
    expect([p.hp, w.zombies.hp[z], b.hp]).toEqual([100, 100, wood.hp]);
    place(p, f.x, outY);
    w.zombies.x[z] = w.zombies.prevX[z] = 40; // the zombie steps out too
    w.zombies.y[z] = w.zombies.prevY[z] = 3;
    startBuild(w); // the next build start: the clocks restart
    expect([p.fireTicks, w.zombies.fireTicks[z], b.fireTicks]).toEqual([0, 0, 0]);
    expect(w.decay.fires).toHaveLength(2); // still burning (2 waves)
    startWave(w);
    place(p, f.x, inY);
    w.zombies.x[z] = w.zombies.prevX[z] = zx;
    w.zombies.y[z] = w.zombies.prevY[z] = zy;
    step(w, TICK_DT_S);
    expect([p.hp, w.zombies.hp[z], b.hp]).toEqual([100, 100, wood.hp]);
    // Liveness: staying in, the first hit comes a full pulse after this wave's first tick in fire.
    for (let t = 0; t < PULSE_TICKS - 1; t++) step(w, TICK_DT_S);
    expect([p.hp, w.zombies.hp[z], b.hp]).toEqual([95, 95, wood.hp - 5]);
  });
});
