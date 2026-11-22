import type { World } from "../core/world";
import { MAP_STAGE_COUNT, type MapBox } from "../map/districtMap";
import { FIRST_DECAY_STAGE } from "../map/decayStage";
import { fillObstacles, mutationApplies } from "../map/obstacles";
import { setNavWalls } from "../zombies/flowField";
import { fireRecordOf } from "./decayState";

const hasNamed = (list: readonly MapBox[], name: string): boolean => {
  for (let i = 0; i < list.length; i++) if ((list[i] as MapBox).name === name) return true;
  return false;
};

/**
 * Story 4.5 (brief line 2): THE shared apply of a decay stage, the same function on the server, in
 * solo, in the client's mirror World and in its Predictor. Brings the World's map state to
 * (`stage`, `variants`): the obstacle lists (map boxes, cover by `minStage`, the mutations of every
 * stage reached: `map/obstacles.ts › fillObstacles`), the nav grid's walls (`setNavWalls`: the next
 * pathing tick re-rasterizes), the fire records of the applied `ignite`s whose target still stands,
 * and `world.decay`. Spawn points follow through `currentDecayStage` (Story 4.3's filter).
 *
 * No side effects on bodies, buildings, money or events: those are the DecaySystem's
 * (`decay/decaySystem.ts`), which only the server and solo run. Recomputed from scratch, so it is
 * idempotent and can go back (dev cheat). Returns false (and does nothing) when nothing changes.
 * Never per tick: World creation, a build start, the dev cheat, and a client patch that changed them.
 */
export function applyDecayStage(world: World, stage: number, variants: number): boolean {
  const s = Math.min(MAP_STAGE_COUNT, Math.max(FIRST_DECAY_STAGE, Math.round(stage)));
  const v = variants >>> 0;
  const d = world.decay;
  if (d.stage === s && d.variants === v && world.obstacles.stage === s && world.obstacles.variants === v) return false;
  const o = world.obstacles;
  fillObstacles(o, world.map, s, v);
  o.version++;
  setNavWalls(world.pathing.nav, o.solids);
  d.fires.length = 0;
  for (const m of world.map.decay) {
    if (m.action !== "ignite" || !mutationApplies(m, s, v)) continue;
    if (!hasNamed(o.cover, m.target) && !hasNamed(o.walls, m.target)) continue; // the target was removed
    d.fires.push(fireRecordOf(m));
  }
  d.stage = s;
  d.variants = v;
  return true;
}
