/** Story 12.1 (AC 16): the browser side of `pathOpenBench.ts` (bundled by it; exposes `window.runPathOpenBench`). */
import { DOWNTOWN_MAP, PLACEHOLDER_MAP, addPlayer, buildingStats, createRng, createWorld, footprint, loadBalance, placeBuilding, placementError, type Box, type DistrictMap } from "@topdown/shared";
import { resetPathOpenCache, sealsPath } from "../../packages/shared/src/buildings/pathOpen";

function bench(map: DistrictMap, label: string, n: number): Record<string, number | string> {
  const balance = loadBalance();
  const world = createWorld({ balance, seed: 1, map, systems: { waves: () => {} } });
  for (let i = 0; i < 4; i++) addPlayer(world, `p${i}`, 1 + i, 1).wallet = 1e6;
  world.run.phase = "build";
  const rng = createRng(5);
  const cols = Math.floor(map.widthM / 0.5);
  const rows = Math.floor(map.heightM / 0.5);
  for (let t = 0; t < 2000 && world.buildings.list.length < 24; t++) {
    const owner = `p${world.buildings.list.length % 4}`;
    const r = { type: "wood_barricade", gx: rng.int(0, cols), gy: rng.int(0, rows), rot: rng.int(0, 3) };
    if (placementError(world, owner, r) === null) placeBuilding(world, owner, r);
  }
  const stats = buildingStats(balance, "wood_barricade");
  if (!stats) throw new Error("wood");
  const boxes: Box[] = [];
  for (let k = 0; k < n; k++) boxes.push(footprint(stats, rng.int(0, cols - 4), rng.int(0, rows - 1), rng.int(0, 3), { minX: 0, minY: 0, maxX: 0, maxY: 0 }));
  const box = (k: number): Box => boxes[k % n] as Box;
  for (let k = 0; k < 50; k++) {
    resetPathOpenCache();
    sealsPath(world, box(k)); // warm-up (JIT)
  }
  const time = (f: (k: number) => void): number => {
    const t0 = performance.now();
    for (let k = 0; k < n; k++) f(k);
    return +((performance.now() - t0) / n).toFixed(4);
  };
  // Fully cold: every cache dropped (the map layer is rebuilt: once after a decay stage change).
  const coldMs = time((k) => {
    resetPathOpenCache();
    sealsPath(world, box(k));
  });
  // Server, per placement: another wall landed since the last check (walls + before-flood + after-flood).
  const placementMs = time((k) => {
    world.buildings.wallVersion++;
    sealsPath(world, box(k));
  });
  // Client, the ghost dragged to a new spot (before cached, one after-flood).
  const newSpotMs = time((k) => void sealsPath(world, box(k)));
  // The ghost held still (the last answer).
  const heldMs = time(() => void sealsPath(world, box(0)));
  return { label, vertices: (cols + 1) * (rows + 1), buildings: world.buildings.list.length, coldMs, placementMs, newSpotMs, heldMs };
}

const big: DistrictMap = { ...PLACEHOLDER_MAP, widthM: 70, heightM: 70, eventSpots: [{ name: "evac_pad", kind: "evac_pad", x: 35, y: 35, minStage: 1 }] };
(globalThis as unknown as { runPathOpenBench: () => unknown }).runPathOpenBench = () => [bench(DOWNTOWN_MAP, "Downtown 48 × 32 m", 400), bench(big, "70 × 70 m (140 × 140 cells)", 400)];
