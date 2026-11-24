import type { World } from "../core/world";
import { inFlashlightCone, type FlashlightCone } from "../player/flashlight";
import { isEndlessWave, lookPick } from "./ruinsLook";

/**
 * Story 6.4 (Collapse, stage 5; FR63, FR87): power out and fog, as shared pure rules over the synced
 * World (stage, phase, wave, variants). Nothing here is state: every copy derives the same answer.
 *
 * The fog is a VIEW rule with exactly one sim consumer: touch aim assist (`combat/aimAssist.ts`)
 * never snaps to a zombie the shooter's fog hides (own beam only: deterministic on the server and in
 * the Predictor). The client hides zombies (and their eyes, and spit in flight) by `fogVisibility`
 * from the camera's survivor with every standing survivor's beam (D2). Zombies hidden by the fog
 * still move, bite, take bullets and count.
 */

/** Story 6.4 (D7): the weather styles, in the art's order (CO1 haze, CO2 fog bank, CO3 ash, CO4 flood). */
export const COLLAPSE_STYLES = ["haze", "fog_bank", "ash", "flood"] as const;
export type CollapseStyle = (typeof COLLAPSE_STYLES)[number];
export const COLLAPSE_STYLE_GROUP = "collapse_style";

/** Story 6.4: the streetlights, shop glow, neon, canopy and running car are off (stage ≥ `powerOutFromStage`). */
export function isPowerOut(world: Readonly<World>): boolean {
  return world.decay.stage >= world.balance.decay.collapse.powerOutFromStage;
}

/** The fog's two radii now: visible up to `clearM`, fading to hidden at `radiusM` (Infinity: no fog). */
export interface FogRadii {
  clearM: number;
  radiusM: number;
}

export function createFogRadii(): FogRadii {
  return { clearM: Infinity, radiusM: Infinity };
}

/**
 * Story 6.4 (F3, D1): the fog radii of the current phase into `out`: a wave at stage ≥ `fog.fromStage`
 * 9 → 10 m, a build phase 13 → 14 m; no fog (Infinity) below that stage and in every other phase
 * (lobby, results; 6.11 adds the vote / dawn here). Returns `out`.
 */
export function fogRadiiOf(world: Readonly<World>, out: FogRadii): FogRadii {
  const f = world.balance.decay.collapse.fog;
  const phase = world.run.phase;
  if (world.decay.stage < f.fromStage || (phase !== "wave" && phase !== "build")) {
    out.clearM = Infinity;
    out.radiusM = Infinity;
  } else if (phase === "wave") {
    out.clearM = f.waveClearM;
    out.radiusM = f.waveRadiusM;
  } else {
    out.clearM = f.buildClearM;
    out.radiusM = f.buildRadiusM;
  }
  return out;
}

/** One flashlight beam that reveals zombies through the fog (a standing survivor's). */
export interface FogBeam {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  cone: FlashlightCone | null;
}

export function createFogBeam(): FogBeam {
  return { x: 0, y: 0, facingX: 1, facingY: 0, cone: null };
}

/**
 * Story 6.4 (F3): how visible (0…1) a zombie centred at (x, y) is from the viewer at (vx, vy):
 * 1 within `clearM`, linear to 0 at `radiusM`, 0 beyond; 1 anywhere inside one of the first
 * `beamCount` beams (`inFlashlightCone`, the same test the drawn beam uses). No allocation.
 */
export function fogVisibility(radii: Readonly<FogRadii>, vx: number, vy: number, x: number, y: number, beams: readonly FogBeam[], beamCount: number): number {
  if (radii.radiusM === Infinity) return 1;
  const dx = x - vx;
  const dy = y - vy;
  const d2 = dx * dx + dy * dy;
  if (d2 <= radii.clearM * radii.clearM) return 1;
  for (let i = 0; i < beamCount; i++) {
    const b = beams[i] as FogBeam;
    if (b.cone && inFlashlightCone(b.x, b.y, b.facingX, b.facingY, b.cone, x, y)) return 1;
  }
  if (d2 >= radii.radiusM * radii.radiusM) return 0;
  const d = Math.sqrt(d2);
  return (radii.radiusM - d) / (radii.radiusM - radii.clearM);
}

/**
 * Story 6.4 (D7): the weather style now (index into `COLLAPSE_STYLES`), or -1 below stage 5: the
 * run's pick (the `collapse_style` look, from the `decay` stream; CO1 haze when the map has none)
 * up to wave 10; in endless one step per wave in order: `(pick + wave − 10) mod 4`. Pure.
 */
export function collapseStyleAt(world: Readonly<World>): number {
  if (world.decay.stage < world.balance.decay.collapse.fog.fromStage) return -1;
  const k = lookPick(world.map, world.decay.variants, COLLAPSE_STYLE_GROUP, COLLAPSE_STYLES);
  const pick = k < 0 ? 0 : k;
  const wave = world.waves.number;
  if (!isEndlessWave(world, wave)) return pick;
  const n = COLLAPSE_STYLES.length;
  return (((pick + wave - world.balance.decay.stageByWave.length) % n) + n) % n;
}
