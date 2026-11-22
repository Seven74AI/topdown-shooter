import { DOWNTOWN_MAP, createObstacles, fireRecordOf, type FireRecord } from "@topdown/shared";
import type { CityScene } from "./drawCity";
import { DOWNTOWN_DRESSING } from "./dressing";
import type { AtlasCanvas } from "./spriteAtlas";

/** Test helper: Downtown at `stage` with the decay variants `variants` (bit i = candidate i; 4.5). */
export function downtownScene(stage: number, variants = 0): CityScene {
  const o = createObstacles(DOWNTOWN_MAP, stage, variants);
  const fires: FireRecord[] = DOWNTOWN_MAP.decay
    .filter((m) => m.action === "ignite" && m.stage <= stage && (m.variant < 0 || (variants & (1 << m.variant)) !== 0))
    .map(fireRecordOf);
  return { map: DOWNTOWN_MAP, dressing: DOWNTOWN_DRESSING, stage, cover: o.cover, walls: o.walls, fires, atlas: { canvas: null, frames: new Map() } as unknown as AtlasCanvas };
}
