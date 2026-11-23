import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { worldDigest } from "../core/worldSnapshot";
import { addBuildingAt, damageBuilding, removeBuilding, type Building } from "../buildings/buildings";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { skipWave, startBuild, startWave } from "../run/runStateMachine";
import { lightsOf, updateLightState } from "./lightState";

/** Story 5.10 (AC 2): the derived light-source list (floodlights + burning fires). */
const noop: SystemFn = () => {};
const balance = loadBalance();
const FLOOD = balance.buildings.types.floodlight;

function setup(stageByWave: number[] | null = null) {
  const w = createWorld({ balance, seed: 7, map: DOWNTOWN_MAP, systems: { waves: noop } });
  w.debug.godMode = true;
  w.debug.decayStageByWave = stageByWave;
  const at = { x: 0, y: 0 };
  teamSpawnPoint(w, 0, at);
  addPlayer(w, "p0", at.x, at.y);
  startBuild(w);
  let id = 100;
  const place = (x: number, y: number, type = "floodlight"): Building =>
    addBuildingAt(w, { id: id++, type, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: 0, hp: balance.buildings.types[type]?.hp ?? 1 }) as Building;
  /** A spot near the team spawn (free at every stage). */
  const near = (dx: number, dy: number) => [Math.round(at.x + dx), Math.round(at.y + dy)] as const;
  return { w, place, near };
}
const tick = (w: World, n = 1): void => {
  for (let i = 0; i < n; i++) step(w, TICK_DT_S);
};
function nextBuild(w: World): void {
  startWave(w);
  tick(w, 3);
  skipWave(w);
  tick(w);
}

describe("Story 5.10 light state (AC 2)", () => {
  it("balance: the floodlight is 150 HP, price 100, 1 × 1 m, not in the shop, light 4 m (6 m in blackout, Epic 6 D5)", () => {
    expect(FLOOD).toMatchObject({ price: 100, hp: 150, widthM: 1, depthM: 1, inShop: false, light: { radiusM: 4, blackoutRadiusM: 6 } });
  });

  it("a placed floodlight is one light at its centre with radius 4; other buildings are not lights", () => {
    const { w, place } = setup();
    expect(lightsOf(w)).toEqual([]);
    const b = place(20, 16);
    place(24, 16, "med_station");
    place(26, 16, "auto_turret");
    tick(w); // the buildings system brings it up to date
    expect(w.lights.list).toEqual([{ kind: "floodlight", x: 20.5, y: 16.5, radiusM: 4, blackoutRadiusM: 6, buildingId: b.id }]);
  });

  it("destroyed → gone (damage to 0 on the real path)", () => {
    const { w, place } = setup();
    const b = place(20, 16);
    tick(w);
    expect(w.lights.list).toHaveLength(1);
    damageBuilding(w, b, 1000);
    tick(w);
    expect(w.lights.list).toEqual([]);
  });

  it("stage-3 fires are lights (fires first, then floodlights by id); out at expiry → gone", () => {
    const { w, place, near } = setup([1, 3, 3, 3, 3]);
    const b2 = place(...near(3, 0));
    const b1 = place(...near(-3, 0));
    expect(b1.id).toBeGreaterThan(b2.id);
    nextBuild(w); // coming wave 2: stage 3, fires lit at the build start
    expect(w.decay.fires).toHaveLength(2);
    const l = w.lights.list;
    expect(l.map((e) => e.kind)).toEqual(["fire", "fire", "floodlight", "floodlight"]);
    expect(l.slice(0, 2).map((e) => [e.x, e.y, e.radiusM])).toEqual(w.decay.fires.map((f) => [f.x, f.y, f.radiusM]));
    expect(l.slice(2).map((e) => e.buildingId)).toEqual([b2.id, b1.id]);
    nextBuild(w); // wave 3: still burning
    expect(w.lights.list).toHaveLength(4);
    nextBuild(w); // wave 4: out
    expect(w.decay.fires).toEqual([]);
    expect(w.lights.list.map((e) => e.kind)).toEqual(["floodlight", "floodlight"]);
  });

  it("no rebuild when nothing changed: same array, same entry objects, no rebuild count; a change reuses the entries", () => {
    const { w, place } = setup();
    place(20, 16);
    place(22, 16);
    tick(w);
    const list = w.lights.list;
    const first = list[0];
    const n = w.lights.rebuilds;
    tick(w, 50);
    expect(w.lights.rebuilds).toBe(n);
    expect(updateLightState(w)).toBe(false);
    expect(w.lights.list).toBe(list);
    removeBuilding(w, (w.buildings.list[1] as Building).id);
    expect(updateLightState(w)).toBe(true);
    expect(w.lights.rebuilds).toBe(n + 1);
    expect(w.lights.list).toBe(list); // same array
    expect(w.lights.list[0]).toBe(first); // same entry object
  });

  it("derived, not snapshotted: the digest ignores it (a rebuilt-from-scratch copy digests the same)", () => {
    const { w, place } = setup();
    place(20, 16);
    tick(w);
    const d = worldDigest(w);
    w.lights.list.length = 0;
    w.lights.buildingsVersion = -1;
    expect(worldDigest(w)).toBe(d);
    expect(lightsOf(w)).toHaveLength(1);
  });
});
