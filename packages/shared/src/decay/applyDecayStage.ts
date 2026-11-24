import { updateLightState } from "./lightState";
import type { World } from "../core/world";
import { MAP_STAGE_COUNT, type MapBox } from "../map/districtMap";
import { FIRST_DECAY_STAGE } from "../map/decayStage";
import { fillObstacles, mutationApplies } from "../map/obstacles";
import { MAX_PATHING_ZOMBIE_RADIUS_M } from "../config/balance";
import { FLOW_UNITS_PER_M, setNavFires, setNavWalls } from "../zombies/flowField";
import type { FireRecord } from "./decayState";

const hasNamed = (list: readonly MapBox[], name: string): boolean => {
  for (let i = 0; i < list.length; i++) if ((list[i] as MapBox).name === name) return true;
  return false;
};

/**
 * Story 4.5 (brief line 2): THE shared apply of a decay stage, the same function on the server, in
 * solo, in the client's mirror World and in its Predictor. Brings the World's map state to
 * (`stage`, `variants`): the obstacle lists (map boxes, cover by `minStage`, the mutations of every
 * stage reached: `map/obstacles.ts › fillObstacles`), the nav grid's walls (`setNavWalls`: the next
 * pathing tick re-rasterizes), the burning fires (Story 4.8: the applied `ignite`s whose target still
 * stands and whose bit in `firesOut` is clear) and their nav cost (`setNavFires`), and `world.decay`. Spawn points follow through `currentDecayStage` (Story 4.3's filter).
 *
 * No side effects on bodies, buildings, money or events: those are the DecaySystem's
 * (`decay/decaySystem.ts`), which only the server and solo run. Recomputed from scratch, so it is
 * idempotent and can go back (dev cheat). Returns false (and does nothing) when nothing changes.
 * Never per tick: World creation, a build start, the dev cheat, and a client patch that changed them.
 */
export function applyDecayStage(world: World, stage: number, variants: number, firesOut: number = world.decay.firesOut): boolean {
  const s = Math.min(MAP_STAGE_COUNT, Math.max(FIRST_DECAY_STAGE, Math.round(stage)));
  const v = variants >>> 0;
  const out = firesOut >>> 0;
  const d = world.decay;
  if (d.stage === s && d.variants === v && d.firesOut === out && world.obstacles.stage === s && world.obstacles.variants === v) return false;
  const o = world.obstacles;
  fillObstacles(o, world.map, s, v);
  o.version++;
  setNavWalls(world.pathing.nav, o.solids);
  setNavWalls(world.pathing.wide, o.solids); // Story 5.7: grown on the wide grid
  // Story 5.7 review L3: the wide field (idle while no Brute lives, so not rebuilt at this build
  // start) describes the old walls: drop it, so the next Brute walks straight until a fresh one swaps in.
  world.pathing.wideChase.sourceTick = -1;
  world.pathing.wideChase.building = false;
  setNavWalls(world.pathing.boss, o.solids); // Story 6.5 (DD2): the boss grid's walls, only here (build starts)
  world.pathing.bossChase.sourceTick = -1;
  world.pathing.bossChase.building = false;
  d.fires.length = 0;
  let fi = 0;
  for (const m of world.map.decay) {
    if (m.action !== "ignite") continue;
    const index = fi++;
    if (!mutationApplies(m, s, v)) continue;
    if (((out >>> index) & 1) === 1) continue; // Story 4.8: burned out
    if (!hasNamed(o.cover, m.target) && !hasNamed(o.walls, m.target)) continue; // the target was removed
    d.fires.push(d.fireSlots[index] as FireRecord);
  }
  // Story 4.8: fire cells cost zombies `fire.navCostM` each (rebuilt with the fields at the build start).
  setNavFires(world.pathing.nav, d.fires, Math.round(world.balance.decay.fire.navCostM * FLOW_UNITS_PER_M), MAX_PATHING_ZOMBIE_RADIUS_M);
  // Story 5.7: on the wide grid a fire is grown by the largest wide body (a Brute touching it would burn).
  setNavFires(world.pathing.wide, d.fires, Math.round(world.balance.decay.fire.navCostM * FLOW_UNITS_PER_M), MAX_PATHING_ZOMBIE_RADIUS_M + world.balance.zombies.pathing.wideInflateM);
  d.stage = s;
  d.variants = v;
  d.firesOut = out;
  updateLightState(world); // Story 5.10: fires lit / out change the derived light list (every copy)
  return true;
}
