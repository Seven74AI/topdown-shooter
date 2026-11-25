import type { World } from "../core/world";
import type { DistrictMap } from "../map/districtMap";

/**
 * Story 6.2 (D6): the Ruins materials, in the art's order: RU1 concrete + rebar, RU2 brick, RU3 wall
 * slabs, RU4 fire-gutted (the endless look). Waves up to the end of `decay.json › stageByWave` use
 * the run's pick (the `ruins_look` group's `look` variant, from the `decay` stream); endless waves
 * (past the table, wave 11+) always use RU4.
 */
export const RUINS_LOOKS = ["concrete", "brick", "slab", "gutted"] as const;
export type RuinsLook = (typeof RUINS_LOOKS)[number];
/** Index of RU4 in `RUINS_LOOKS`. */
export const RUINS_LOOK_GUTTED = 3;

/** The variant group and candidate names of the Ruins material (map data, `tools/maps/buildDowntown.ts`). */
export const RUINS_LOOK_GROUP = "ruins_look";

/**
 * Index (into `names`) of the candidate the run chose in `group` (`variants` = the synced mask), or
 * -1 when the map has no such group or nothing of it is chosen. A variant's name is `<prefix><name>`.
 * O(variants); no allocation.
 */
export function lookPick(map: Readonly<DistrictMap>, variants: number, group: string, names: readonly string[]): number {
  const vs = map.decayVariants;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i] as { name: string; group: string };
    if (v.group !== group || ((variants >>> i) & 1) === 0) continue;
    for (let k = 0; k < names.length; k++) if (v.name.endsWith(`_${names[k] as string}`)) return k;
  }
  return -1;
}

/** Story 6.2: the first wave past the run's table (11 on Downtown): endless. */
export function isEndlessWave(world: Readonly<World>, wave: number = world.waves.number): boolean {
  return wave > world.balance.decay.stageByWave.length;
}

/**
 * Story 6.2: the Ruins material now (index into `RUINS_LOOKS`): the run's pick in waves 1–10 (RU1
 * when the map has no pick), RU4 in endless. Pure: reads the synced `decay.variants` and wave number.
 */
export function ruinsLookAt(world: Readonly<World>): number {
  if (isEndlessWave(world)) return RUINS_LOOK_GUTTED;
  const k = lookPick(world.map, world.decay.variants, RUINS_LOOK_GROUP, RUINS_LOOKS);
  return k < 0 ? 0 : k;
}
