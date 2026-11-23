import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, type RawBalanceFiles } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { addBuildingAt as addBuildingOrNull, type Building } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import type { CoverObject, DistrictMap, MapBox } from "../map/districtMap";
import { DEG_TO_RAD } from "../math/vec";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import type { ZombieTypeId } from "../zombies/zombieTypes";
import { applyKnockback, applyZombieDamage, knockbacks } from "./damage";
import { setLoadout } from "./loadout";

/**
 * Story 5.2 (F2, F3): the Fire Axe's 1.5 m knockback through 5.3's shared swept `applyKnockback`:
 * it stops at the first car, bus, building box, barrier, sandbags, barricade, turret or the map
 * edge (touching the face, never inside, never through). One mechanic per test: zombies stand still.
 */
const noop: SystemFn = () => {};
const STILL = { waves: noop, zombies: noop };
const balance = loadBalance();
const R = balance.zombies.types.walker?.radiusM ?? 0;
const KNOCK = (balance.weapons.fire_axe as { knockbackM: number }).knockbackM;
const EPS = 1e-6;
const addBuildingAt = (...a: Parameters<typeof addBuildingOrNull>): Building => {
  const b = addBuildingOrNull(...a);
  if (!b) throw new Error("building not placed");
  return b;
};

function axeWorld(map: DistrictMap = PLACEHOLDER_MAP, b = balance) {
  const world = createWorld({ balance: b, seed: 1, map, systems: STILL });
  return world;
}
/** One axe swing from (px, py) along (dx, dy). */
function swing(world: World, px: number, py: number, dx: number, dy: number): void {
  const p = world.players.get("p0") ?? addPlayer(world, "p0", px, py);
  p.hp = 1e9;
  p.x = p.prevX = px;
  p.y = p.prevY = py;
  setLoadout(world.balance, p.loadout, ["fire_axe", null]);
  setInput(world, "p0", { ...NEUTRAL_INPUT, seq: world.tick + 1, aimX: dx, aimY: dy, fire: true });
  step(world, TICK_DT_S);
}
const tough = (world: World, x: number, y: number, type: ZombieTypeId = "walker") => {
  const id = spawnZombie(world, type, x, y);
  world.zombies.hp[id] = 1e6;
  return id;
};
const mapWith = (solids: MapBox[], cover: CoverObject[] = []): DistrictMap => ({ ...PLACEHOLDER_MAP, name: "kb", solids, cover });
const inside = (x: number, y: number, b: Pick<MapBox, "minX" | "minY" | "maxX" | "maxY">) => circleOverlapsBox(x, y, R - 1e-5, b.minX, b.minY, b.maxX, b.maxY);

describe("axe knockback in the open (AC 2)", () => {
  it("axe knocks back exactly 1.5 m in the open", () => {
    const w = axeWorld();
    const z = tough(w, 11.5, 16);
    swing(w, 10, 16, 1, 0);
    expect(w.zombies.x[z]).toBeCloseTo(11.5 + KNOCK, 9);
    expect(KNOCK).toBe(1.5);
    expect(w.zombies.y[z]).toBeCloseTo(16, 9);
  });

  it("a Brute moves 20 % (knockbackTakenPct on its type; any type can carry it)", () => {
    const raw = bundledBalanceFiles() as RawBalanceFiles & { zombies: { types: Record<string, Record<string, unknown>> } };
    (raw.zombies.types.walker as Record<string, unknown>).knockbackTakenPct = 20; // 5.7's Brute value on a stand-in type
    const b = loadBalance(raw);
    const w = axeWorld(PLACEHOLDER_MAP, b);
    const z = tough(w, 11.5, 16);
    swing(w, 10, 16, 1, 0);
    expect(w.zombies.x[z]).toBeCloseTo(11.5 + 0.3, 5);
    // and the small hit pushback scales the same way (D3)
    const z2 = tough(w, 20, 16);
    applyZombieDamage(w, z2, 1, 1, 0, 0.25, "p0", "machete");
    expect(w.zombies.x[z2]).toBeCloseTo(20.05, 5);
    expect(applyKnockback(w, z2, 1, 0, 1.5)).toBeCloseTo(0.3, 9);
  });
});

describe("axe knockback stops at every obstacle kind (F2)", () => {
  const box = { minX: 13, minY: 14, maxX: 15, maxY: 18 };
  for (const kind of ["car", "bus", "barrier", "sandbags"] as const) {
    it(`stops at a ${kind}'s face`, () => {
      const w = axeWorld(mapWith([], [{ name: `t_${kind}`, kind, minStage: 1, ...box }]));
      const z = tough(w, 11.5, 16);
      swing(w, 10, 16, 1, 0);
      const x = w.zombies.x[z] as number;
      expect(x).toBeLessThanOrEqual(13 - R + EPS);
      expect(x).toBeGreaterThan(13 - R - 1e-3); // it went all the way to the face
      expect(inside(x, 16, box)).toBe(false);
    });
  }

  it("stops at a building box (map solid)", () => {
    const w = axeWorld(mapWith([{ name: "bldg", ...box }]));
    const z = tough(w, 11.5, 16);
    swing(w, 10, 16, 1, 0);
    expect(w.zombies.x[z]).toBeCloseTo(13 - R, 3);
    expect(inside(w.zombies.x[z] as number, 16, box)).toBe(false);
  });

  it("stops at a turret", () => {
    const w = axeWorld();
    addBuildingAt(w, { id: 7, type: "auto_turret", ownerId: "p0", gx: 13 / BUILD_GRID_M, gy: 15.5 / BUILD_GRID_M, rot: 0, hp: 300 }); // 13–14 × 15.5–16.5
    const z = tough(w, 11.5, 16);
    swing(w, 10, 16, 1, 0);
    expect(w.zombies.x[z]).toBeCloseTo(13 - R, 3);
  });

  it("stops at the map edge", () => {
    const w = axeWorld();
    const z = tough(w, 47, 16);
    swing(w, 45.6, 16, 1, 0);
    expect(w.zombies.x[z]).toBeCloseTo(48 - R, 3);
    expect(w.zombies.x[z] as number).toBeLessThanOrEqual(48 - R + EPS);
    const z2 = tough(w, 10, 1.0);
    swing(w, 10, 2.4, 0, -1);
    expect(w.zombies.y[z2]).toBeCloseTo(R, 3);
    expect(w.zombies.y[z2] as number).toBeGreaterThanOrEqual(R - EPS);
  });

  it("axe stops at a wood barricade face and never crosses it (both rotations, approach 0–90° step 5°)", () => {
    for (const rot of [0, 1] as const) {
      for (let deg = 0; deg <= 90; deg += 5) {
        const w = axeWorld();
        // rot 1: x 20–20.5, y 15–17 (2 m along y); rot 0: x 19–21, y 16–16.5
        const b: Building =
          rot === 1
            ? addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 40, gy: 30, rot: 1, hp: 200 })
            : addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 38, gy: 32, rot: 0, hp: 200 });
        // The zombie sits 0.2 m in front of the face it is knocked toward, the swinger 1 m behind it
        // along the approach angle (0° = straight at the face).
        const a = deg * DEG_TO_RAD;
        const nx = rot === 1 ? Math.cos(a) : Math.sin(a);
        const ny = rot === 1 ? Math.sin(a) * 0.5 : Math.cos(a);
        const l = Math.hypot(nx, ny);
        const dx = nx / l;
        const dy = ny / l;
        const zx = rot === 1 ? b.minX - R - 0.2 : 20;
        const zy = rot === 1 ? 16 : b.minY - R - 0.2;
        const z = tough(w, zx, zy);
        swing(w, zx - dx, zy - dy, dx, dy);
        const x = w.zombies.x[z] as number;
        const y = w.zombies.y[z] as number;
        expect(inside(x, y, b), `rot ${rot} deg ${deg}`).toBe(false);
        if (rot === 1) expect(x, `rot ${rot} deg ${deg}: never on the far side`).toBeLessThan(b.minX);
        else expect(y, `rot ${rot} deg ${deg}: never on the far side`).toBeLessThan(b.minY);
      }
    }
  });

  it("a zombie pressed against a barricade with the swinger on the other side's angle is not pushed through (Beat the rule 1)", () => {
    const w = axeWorld();
    const b = addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 40, gy: 30, rot: 1, hp: 200 }); // x 20–20.5
    const z = tough(w, b.minX - R - 1e-4, 16);
    swing(w, b.minX - R - 1.2, 16, 1, 0);
    expect(w.zombies.x[z] as number).toBeLessThanOrEqual(b.minX - R + EPS);
    expect(inside(w.zombies.x[z] as number, 16, b)).toBe(false);
  });

  it("a gap narrower than a body between two barricades is not crossed (Beat the rule 1)", () => {
    const w = axeWorld();
    // two rot-1 barricades x 20–20.5, y 13–15 and y 15.5–17.5: a 0.5 m gap (< 0.7 m body)
    addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 40, gy: 26, rot: 1, hp: 200 });
    addBuildingAt(w, { id: 2, type: "wood_barricade", ownerId: "p0", gx: 40, gy: 31, rot: 1, hp: 200 });
    const z = tough(w, 19.3, 15.25);
    swing(w, 18.1, 15.25, 1, 0);
    expect(w.zombies.x[z] as number).toBeLessThan(20 - R + EPS);
  });

  it("may push into a car fire (allowed, D4; a fire zone doesn't block bodies) and it then burns there", () => {
    const w = axeWorld();
    w.decay.fires.push({ name: "t_fire", target: "t_car", x: 14, y: 16, radiusM: 1, stage: 3, index: 0 });
    w.run.phase = "wave";
    w.waves.paused = false;
    const z = tough(w, 11.5, 16);
    const before = knockbacks.applied;
    swing(w, 10, 16, 1, 0);
    expect(knockbacks.applied - before).toBe(1);
    expect(w.zombies.x[z]).toBeCloseTo(13, 5); // the full 1.5 m, into the fire's circle (13 + 0.35 > 14 − 1)
    const hp = w.zombies.hp[z] as number;
    for (let t = 0; t < 40; t++) step(w, TICK_DT_S);
    expect(w.zombies.hp[z] as number).toBeLessThan(hp);
  });
});
