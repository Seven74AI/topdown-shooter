import { describe, expect, it } from "vitest";
import { BUILD_GRID_M, TICK_DT_S, addBuildingAt, addPlayer, buildingStats, createWorld, loadBalance, mineCounters, spawnZombie, startBuild, startWave, step, type Building } from "@topdown/shared";
import { MINE_BLINK_ON_MS, MINE_BLINK_PERIOD_MS, TRAP_SHADOW_M, buildingShadowHeightM, mineBlinkOn, mineRingRadii } from "./mineLook";
import { BAR_STEPS, barFraction, boxDrawKey, buildingDrawKey } from "./buildingLook";
import { MINE_SHAKE_MAX, MINE_SHAKE_RADIUS_M, mineShakeIntensity } from "./mineBlast";
import { BUILDING_SHEETS, buildingFrame, buildingsAtlasSpecs, BUILDINGS_PX_PER_M, isStanding, sheetSpecs, standingFrame, textureOfFrame } from "./city/buildingsAtlas";
import { MAX_ATLAS_PX, isFrameName, packAtlas } from "./city/atlasLayout";

const balance = loadBalance();
const noop = (): void => {};

/** A wave World with one mine centred at (cx, cy) and one Walker at (zx, zy); returns whether one tick set it off. */
function triggers(cx: number, cy: number, zx: number, zy: number): boolean {
  const world = createWorld({ balance, seed: 1, systems: { waves: noop, zombies: noop } });
  addPlayer(world, "p0", 40, 28);
  startBuild(world);
  startWave(world);
  addBuildingAt(world, { id: 1, type: "mine", ownerId: "p0", gx: (cx - 0.25) / BUILD_GRID_M, gy: (cy - 0.25) / BUILD_GRID_M, rot: 0, hp: 1 }) as Building;
  world.zombies.hp[spawnZombie(world, "walker", zx, zy)] = 1e6;
  const before = mineCounters.exploded;
  step(world, TICK_DT_S);
  return mineCounters.exploded > before;
}

describe("Story 5.9 F4: the mine's circles are drawn at the sim's radii", () => {
  it("the rings are the balance radii (never a copy), none for other types", () => {
    const rings = mineRingRadii(buildingStats(balance, "mine"));
    expect(rings).toEqual({ triggerM: 1, blastM: 2.5 });
    expect(mineRingRadii(buildingStats(balance, "spike_trap"))).toBeNull();
    expect(mineRingRadii(undefined)).toBeNull();
  });

  it("a Walker whose body touches the drawn inner ring sets the mine off; one just outside doesn't (the sim's own test)", () => {
    const ring = (mineRingRadii(buildingStats(balance, "mine")) as { triggerM: number }).triggerM;
    const rz = balance.zombies.types.walker?.radiusM ?? 0;
    for (const a of [0, 1, 2.5, 4]) {
      const at = (d: number): [number, number] => [20.25 + Math.cos(a) * d, 16.25 + Math.sin(a) * d];
      expect(triggers(20.25, 16.25, ...at(ring + rz - 1e-3))).toBe(true);
      expect(triggers(20.25, 16.25, ...at(ring + rz + 1e-3))).toBe(false);
    }
  });

  it("the armed light blinks (on 550 of every 1400 ms), offset per mine", () => {
    let on = 0;
    for (let t = 0; t < MINE_BLINK_PERIOD_MS; t += 10) if (mineBlinkOn(t, 7)) on++;
    expect(on * 10).toBe(MINE_BLINK_ON_MS);
    expect(mineBlinkOn(0, 0)).toBe(true);
    expect(mineBlinkOn(MINE_BLINK_ON_MS + 10, 0)).toBe(false);
    expect(mineBlinkOn(0, 0)).not.toBe(mineBlinkOn(0, 3)); // neighbours out of step
  });
});

describe("Story 5.9: floor looks and the redraw key", () => {
  it("shadow heights: walls tall, a trap a few cm, a mine none", () => {
    expect(buildingShadowHeightM(buildingStats(balance, "metal_barricade"), 1.6)).toBe(1.6);
    expect(buildingShadowHeightM(buildingStats(balance, "spike_trap"), 1.6)).toBe(TRAP_SHADOW_M);
    expect(buildingShadowHeightM(buildingStats(balance, "mine"), 1.6)).toBe(0);
  });

  it("a worn trap does not change the redraw key on every spike (AC 16), only per bar step", () => {
    const trap = { id: 3, hp: 300, maxHp: 300 } as Building;
    const keys = new Set<number>();
    for (let hp = 300; hp > 0; hp--) {
      trap.hp = hp;
      keys.add(buildingDrawKey([trap]));
    }
    expect(keys.size).toBeLessThanOrEqual(BAR_STEPS + 1);
    expect(keys.size).toBeGreaterThan(BAR_STEPS / 2); // liveness: it still follows the wear
    expect(barFraction({ hp: 299, maxHp: 300 })).toBeLessThan(1); // the first hit shows
    expect(barFraction({ hp: 300, maxHp: 300 })).toBe(1);
    expect(barFraction({ hp: 1, maxHp: 300 })).toBeGreaterThan(0);
  });

  it("mine blast shake: within 6 m only, strongest on top", () => {
    expect(mineShakeIntensity(0)).toBe(MINE_SHAKE_MAX);
    expect(mineShakeIntensity(MINE_SHAKE_RADIUS_M + 0.01)).toBe(0);
    expect(mineShakeIntensity(3)).toBeGreaterThan(mineShakeIntensity(5));
  });
});

describe("Story 5.9: the buildings atlas", () => {
  it("frames follow category_name_variant, fit 2048², and match the balance footprints", () => {
    const specs = buildingsAtlasSpecs();
    for (const sheet of BUILDING_SHEETS) {
      const layout = packAtlas(sheetSpecs(sheet));
      expect(layout.width).toBeLessThanOrEqual(MAX_ATLAS_PX);
      expect(layout.height).toBeLessThanOrEqual(MAX_ATLAS_PX);
    }
    for (const type of ["wood_barricade", "reinforced_barricade", "metal_barricade", "spike_trap", "mine"]) {
      const f = buildingFrame(type);
      expect(f?.texture).toBe(textureOfFrame(f?.frame ?? ""));
      expect(BUILDING_SHEETS).toContain(f?.texture);
      const spec = specs.find((s) => s.name === f?.frame);
      expect(spec && isFrameName(spec.name)).toBe(true);
      const stats = buildingStats(balance, type);
      if (isStanding(type)) {
        // photoreal group 3: a standing picture is as long as the footprint and taller than it (the face rises)
        const st = standingFrame(type, 0, 0);
        expect(spec?.w).toBe((stats?.widthM ?? 0) * BUILDINGS_PX_PER_M);
        expect(st && st.hM > (stats?.depthM ?? 0)).toBe(true);
        continue;
      }
      expect([spec?.w, spec?.h]).toEqual([(stats?.widthM ?? 0) * BUILDINGS_PX_PER_M, (stats?.depthM ?? 0) * BUILDINGS_PX_PER_M]);
    }
    expect(buildingFrame("auto_turret")).toBeNull(); // keeps its plank box + turret plate
  });

  it("review M1: a turret next to wearing traps never changes the re-lay key; the turret's own wear does", () => {
    const isBox = (type: string) => buildingFrame(type) === null;
    const turret = { id: 1, type: "auto_turret", hp: 300, maxHp: 300 } as Building;
    const traps = Array.from({ length: 12 }, (_, i) => ({ id: 2 + i, type: "spike_trap", hp: 300, maxHp: 300 }) as Building);
    const list = [turret, ...traps];
    const box0 = boxDrawKey(list, isBox);
    const draws = new Set<number>();
    for (let hp = 300; hp > 0; hp -= 3) {
      for (const t of traps) t.hp = hp;
      draws.add(buildingDrawKey(list));
      expect(boxDrawKey(list, isBox)).toBe(box0); // no re-lay while only traps wear
    }
    expect(draws.size).toBeGreaterThan(5); // liveness: the wear itself still redraws bars
    turret.hp = 200;
    expect(boxDrawKey(list, isBox)).not.toBe(box0);
  });
});
