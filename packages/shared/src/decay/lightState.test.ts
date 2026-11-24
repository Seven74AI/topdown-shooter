import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SystemFn } from "../core/systems";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld, worldDigest } from "../core/worldSnapshot";
import { addBuildingAt, damageBuilding, removeBuilding, type Building } from "../buildings/buildings";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { endRun, skipWave, startBuild, startWave } from "../run/runStateMachine";
import { darknessAlpha, isBlackout, lightRadiusOf, lightsOf, refreshBlackout, setForcedBlackout, updateLightState, type LightSource } from "./lightState";

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
  it("balance: the floodlight is 150 HP, price 100, 1 × 1 m, in the shop from wave 1 (Story 6.3 D8), light 4 m (6 m in blackout, Epic 6 D5)", () => {
    expect(FLOOD).toMatchObject({ price: 100, hp: 150, widthM: 1, depthM: 1, inShop: true, light: { radiusM: 4, blackoutRadiusM: 6 } });
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

describe("Story 6.3 blackout light state (AC 1–4; F1, F7)", () => {
  const withBlackout = (patch: (b: Record<string, unknown>) => void) => {
    const raw = bundledBalanceFiles() as unknown as { decay: { blackout: Record<string, unknown> } };
    patch(raw.decay.blackout);
    return loadBalance(raw as never);
  };
  const worldOf = (b = balance) => {
    const w = createWorld({ balance: b, seed: 7, map: DOWNTOWN_MAP, systems: { waves: noop } });
    w.debug.godMode = true;
    const at = { x: 0, y: 0 };
    teamSpawnPoint(w, 0, at);
    addPlayer(w, "p0", at.x, at.y);
    return w;
  };

  it("balance defaults: every lightPctByWave entry 0, power failure 20 %, endless 5 %, half 0.5 (off), glow 1.6 m, fire 4 m", () => {
    expect(balance.decay.blackout).toMatchObject({ lightPctByWave: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], powerFailureLightPct: 20, endlessLightPct: 5, halfDarkK: 0.5, halfDarkInBuild: false, glowM: 1.6, fireLightM: 4, muzzleLightM: 3, muzzleLightS: 0.1, flameLightM: 3, explosionLightM: 5, explosionLightS: 0.15, eyesM: 14, maxStamps: 48, maxEyes: 150, maxSparkles: 160 });
  });

  it("table 0 → no blackout in any phase of a normal run", () => {
    const w = worldOf();
    startBuild(w);
    expect(isBlackout(w)).toBe(false);
    startWave(w);
    expect(w.lights.blackoutPct).toBe(0);
    expect(darknessAlpha(w)).toBe(0);
  });

  it("refreshBlackout rule order: forced → wave table → power failure in a wave → half in build → 0", () => {
    const b = withBlackout((x) => {
      x.lightPctByWave = [0, 10, 0, 0, 0, 0, 0, 0, 10, 5];
      x.halfDarkInBuild = true;
    });
    const w = worldOf(b);
    startBuild(w); // coming wave 1: entry 0
    expect([w.lights.blackoutPct, w.lights.halfDark]).toEqual([0, false]);
    startWave(w); // wave 1: entry 0
    expect(w.lights.blackoutPct).toBe(0);
    w.lights.powerFailure = true;
    refreshBlackout(w); // a power failure mid-wave
    expect([w.lights.blackoutPct, w.lights.halfDark]).toEqual([20, false]);
    tick(w, 2);
    skipWave(w); // → build before wave 2: coming entry 10 → half dark
    expect([w.lights.blackoutPct, w.lights.halfDark]).toEqual([10, true]);
    expect(darknessAlpha(w)).toBeCloseTo(0.45, 9);
    startWave(w); // wave 2: the table (10) wins over the power failure (20)
    expect([w.lights.blackoutPct, w.lights.halfDark]).toEqual([10, false]);
    setForcedBlackout(w, 5); // forced wins over everything
    expect([w.lights.blackoutPct, w.lights.halfDark]).toEqual([5, false]);
    setForcedBlackout(w, -1);
    expect(w.lights.blackoutPct).toBe(10);
    endRun(w); // → Results → 0
    expect(w.run.phase).toBe("results");
    expect(w.lights.blackoutPct).toBe(0);
  });

  it("review H1 (FR87): a forced level only darkens — table 5 + forced 20 stays at 5 (alpha ≥ 0.95); half-dark build + forced 20 → 20; Results lit even when forced", () => {
    const w = worldOf(withBlackout((x) => ((x.lightPctByWave = [5, 5]), (x.halfDarkInBuild = true))));
    startBuild(w); // half of 5 % → alpha 0.475
    setForcedBlackout(w, 20); // alpha 0.8 > 0.475: the forced level darkens the build phase
    expect([w.lights.blackoutPct, w.lights.halfDark]).toEqual([20, false]);
    startWave(w); // wave 1: table 5 (0.95) is darker than forced 20 (0.8): the table stands
    expect(w.lights.blackoutPct).toBe(5);
    expect(darknessAlpha(w)).toBeGreaterThanOrEqual(0.95 - 1e-9);
    setForcedBlackout(w, 10);
    expect(w.lights.blackoutPct).toBe(5);
    endRun(w);
    expect(w.lights.blackoutPct).toBe(0); // review L8: Results are lit
  });

  it("review: a forced 100 % (no darkness) never turns a blackout on", () => {
    const w = worldOf();
    startBuild(w);
    setForcedBlackout(w, 100);
    expect(isBlackout(w)).toBe(false);
  });

  it("powerFailure counts only in a wave", () => {
    const w = worldOf();
    startBuild(w);
    w.lights.powerFailure = true;
    refreshBlackout(w);
    expect(w.lights.blackoutPct).toBe(0);
    startWave(w);
    expect(w.lights.blackoutPct).toBe(20);
  });

  it("halfDark only in a build phase (and only with halfDarkInBuild)", () => {
    const on = worldOf(withBlackout((x) => ((x.lightPctByWave = [5, 5]), (x.halfDarkInBuild = true))));
    startBuild(on);
    expect(on.lights.halfDark).toBe(true);
    startWave(on);
    expect(on.lights.halfDark).toBe(false);
    const off = worldOf(withBlackout((x) => (x.lightPctByWave = [5, 5])));
    startBuild(off);
    expect([off.lights.blackoutPct, off.lights.halfDark]).toEqual([0, false]);
  });

  it("darknessAlpha: 5 % → 0.95, half → 0.475 (halfDarkK applied), off → 0", () => {
    const w = worldOf();
    w.lights.blackoutPct = 5;
    expect(darknessAlpha(w)).toBeCloseTo(0.95, 9);
    w.lights.halfDark = true;
    expect(darknessAlpha(w)).toBeCloseTo(0.475, 9);
    const k3 = worldOf(withBlackout((x) => (x.halfDarkK = 0.3)));
    k3.lights.blackoutPct = 5;
    k3.lights.halfDark = true;
    expect(darknessAlpha(k3)).toBeCloseTo(0.285, 9);
    w.lights.blackoutPct = 0;
    expect(darknessAlpha(w)).toBe(0);
  });

  it("lightRadiusOf: a floodlight 4 m ↔ 6 m; a fire lights 4 m in a blackout (2 m zone otherwise)", () => {
    const { w, place, near } = setup([1, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const [x, y] = near(3, 0);
    place(x, y);
    nextBuild(w); // stage 3: fires
    const l = lightsOf(w);
    const fire = l.find((e) => e.kind === "fire") as LightSource;
    const flood = l.find((e) => e.kind === "floodlight") as LightSource;
    expect(fire).toBeDefined();
    expect(lightRadiusOf(w, flood)).toBe(4);
    expect(lightRadiusOf(w, fire)).toBe(2);
    setForcedBlackout(w, 5);
    expect(lightRadiusOf(w, flood)).toBe(6);
    expect(lightRadiusOf(w, fire)).toBe(4);
  });

  it("the light flags are in snapshotWorld (replay) and change the digest", () => {
    const w = worldOf();
    const d0 = worldDigest(w);
    setForcedBlackout(w, 10);
    expect(snapshotWorld(w).lights).toEqual({ blackoutPct: 10, halfDark: false, powerFailure: false, forcedPct: 10 });
    expect(worldDigest(w)).not.toBe(d0);
  });
});
