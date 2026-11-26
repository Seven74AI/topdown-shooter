import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { buildingStats, footprint, placeBuilding, placementError, type Box } from "../buildings/buildings";
import { shotBlockT } from "../combat/cover";
import { createWorld, type World } from "../core/world";
import { gameplayDecayMasks } from "../decay/decayState";
import { changeDecayStage } from "../decay/decaySystem";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild } from "../run/runStateMachine";
import { flowCellAt } from "../zombies/flowField";
import { DOWNTOWN_MAP } from "./downtown";
import { MAP_STAGE_COUNT, type MapBox } from "./districtMap";
import { shopfrontsOf } from "./shopfronts";

/**
 * Story 4.6 (Evening, stage 1, FR59): parked cars along the curbs are cover from wave 1; lit shop
 * fronts are map data that mark good build spots (a barricade fits there and no decay ever lands on it).
 */
const balance = loadBalance();
const DT = DOWNTOWN_MAP;
const CURB_CARS = ["curb_car_west_far", "curb_car_west_n", "curb_car_west_s", "curb_car_north", "curb_car_south"];

function run(seed = 1): World {
  const w = createWorld({ balance, seed, map: DT, systems: { waves: () => {} } });
  const at = { x: 0, y: 0 };
  teamSpawnPoint(w, 0, at);
  addPlayer(w, "p0", at.x, at.y).wallet = 10_000;
  startBuild(w);
  return w;
}

describe("Story 4.6 Evening: parked cars along the curbs", () => {
  it("the curb cars are car cover from wave 1: they stop bodies (nav walls) and shots", () => {
    const w = run();
    expect(w.decay.stage).toBe(1);
    for (const name of CURB_CARS) {
      const c = DT.cover.find((x) => x.name === name);
      expect(c, name).toMatchObject({ kind: "car", minStage: 1 });
      if (!c) continue;
      expect(w.obstacles.solids.map((s) => s.name)).toContain(name);
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      expect(w.pathing.nav.wallAt[flowCellAt(w.pathing.nav, cx, cy)], name).toBe(1);
      // A shot through the car's long axis from 1 m outside stops at its face.
      const horizontal = c.maxX - c.minX > c.maxY - c.minY;
      const t = horizontal ? shotBlockT(w, c.minX - 1, cy, c.maxX + 1, cy) : shotBlockT(w, cx, c.minY - 1, cx, c.maxY + 1);
      expect(t, name).toBeGreaterThan(0);
    }
  });
});

describe("Story 4.6 Evening: lit shop fronts", () => {
  it("five shop fronts, each the sidewalk strip in front of its shop, with the face that glows", () => {
    expect(shopfrontsOf(DT).map((f) => `${f.name}:${f.shop}:${f.face}`)).toEqual([
      "shopfront_corner_shop:nw_corner_shop:n",
      "shopfront_apartments:nw_apartments:n",
      "shopfront_diner:sw_diner:s",
      "shopfront_offices:se_offices:s",
      "shopfront_gas_kiosk:gas_kiosk:n",
    ]);
    // Data only: they are not obstacles at any stage.
    const w = run();
    for (let stage = 1; stage <= MAP_STAGE_COUNT; stage++) {
      changeDecayStage(w, stage);
      for (const f of shopfrontsOf(DT)) expect(w.obstacles.solids.map((s) => s.name)).not.toContain(f.name);
    }
    expect(shopfrontsOf(DT)).toBe(shopfrontsOf(DT)); // cached: no allocation after the first call
  });

  it("each is a good build spot: a barricade fits inside it at stage 1 and survives every decay stage of every combination", () => {
    const wood = buildingStats(balance, "wood_barricade");
    if (!wood) throw new Error("wood");
    const box = { minX: 0, minY: 0, maxX: 0, maxY: 0 } as Box;
    // Story 12.1 (AC 6): a wall within one player body of cover a later stage adds is cleared, so the good spot keeps
    // 2 × player.radiusM from every box any stage can add (block / add mutations, later cover).
    const margin = 2 * balance.player.radiusM;
    const later = [...DT.decay.filter((m) => m.action === "block" || m.action === "add"), ...DT.cover.filter((c) => c.minStage > 1)];
    const nearLater = (b: Box): boolean => later.some((s) => Math.max(0, s.minX - b.maxX, b.minX - s.maxX) ** 2 + Math.max(0, s.minY - b.maxY, b.minY - s.maxY) ** 2 < margin * margin);
    let survived = 0;
    for (const mask of gameplayDecayMasks(DT)) {
      const w = run();
      w.decay.variants = mask; // force each combination (the run would draw one from streams.decay)
      const placed: number[] = [];
      for (const f of shopfrontsOf(DT)) {
        let id = -1;
        for (let gy = Math.round(f.minY / 0.5); gy < Math.round(f.maxY / 0.5) && id < 0; gy++) {
          for (let gx = Math.round(f.minX / 0.5); gx < Math.round(f.maxX / 0.5) && id < 0; gx++) {
            for (const rot of [0, 1] as const) {
              const fp = footprint(wood, gx, gy, rot, box);
              if (fp.minX < f.minX || fp.maxX > f.maxX || fp.minY < f.minY || fp.maxY > f.maxY) continue; // fully inside the strip
              if (nearLater(fp)) continue; // Story 12.1: not next to cover a later stage adds
              if (placementError(w, "p0", { type: "wood_barricade", gx, gy, rot }) !== null) continue;
              const r = placeBuilding(w, "p0", { type: "wood_barricade", gx, gy, rot });
              if (r.ok) {
                id = r.value.id;
                break;
              }
            }
          }
        }
        expect(id, `${f.name}: no legal barricade inside`).toBeGreaterThan(0);
        placed.push(id);
      }
      for (let stage = 2; stage <= MAP_STAGE_COUNT; stage++) {
        expect(changeDecayStage(w, stage)).toBe(true);
        expect(w.buildings.list.map((b) => b.id), `mask ${mask} stage ${stage}`).toEqual(placed);
      }
      survived += placed.length;
    }
    expect(survived).toBe(135 * 5); // Story 4.8: 45 combinations, Story 6.2: × 3 alleys; liveness: every combination, every shop front
  });

  it("the strips touch their shop (a strip touching nothing would lose its glow: skipped, and this test fails)", () => {
    const props = (DT.stages[0] ?? []).filter((p) => p.kind === "shopfront");
    expect(props).toHaveLength(5);
    expect(shopfrontsOf(DT)).toHaveLength(props.length);
    for (const f of shopfrontsOf(DT)) {
      const shop = DT.solids.find((s) => s.name === f.shop) as MapBox;
      const along = f.face === "n" || f.face === "s" ? Math.min(f.maxX, shop.maxX) - Math.max(f.minX, shop.minX) : Math.min(f.maxY, shop.maxY) - Math.max(f.minY, shop.minY);
      expect(along, f.name).toBeGreaterThanOrEqual(4); // a real frontage, not a corner touch
    }
  });
});
