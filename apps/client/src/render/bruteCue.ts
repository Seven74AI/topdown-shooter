import type { SimEvent } from "@topdown/shared";

/**
 * Story 5.7 (AC 4; Beat the rule 9): what a `zombie.brute_spawned` shows. A roar for every Brute
 * (panned by where it appeared, clamped to the screen edges: it is a team-wide cue, heard off screen
 * too), and the "Brute!" banner for the run's first Brute only (`first`, set by the simulation once
 * per run, so never twice). A woken tab's backlog (`ageS`, NetSimHost) plays neither once stale:
 * no roar older than 1 s, no banner older than 3 s (the Brute is on the map by then; a late banner
 * would announce something already there).
 */
export const BRUTE_BANNER = "Brute!";
export const BRUTE_ROAR_MAX_AGE_S = 1;
export const BRUTE_BANNER_MAX_AGE_S = 3;

export interface BruteCue {
  roar: boolean;
  banner: boolean;
  /** Stereo pan −1 … 1 of the roar. */
  pan: number;
}

/** Fills `out` for event `e` seen from a camera view (world rect). No allocation. */
export function bruteSpawnCue(e: Extract<SimEvent, { type: "zombie.brute_spawned" }>, view: { x: number; y: number; width: number; height: number }, out: BruteCue): BruteCue {
  const age = e.ageS ?? 0;
  out.roar = age <= BRUTE_ROAR_MAX_AGE_S;
  out.banner = e.first && age <= BRUTE_BANNER_MAX_AGE_S;
  const half = Math.max(1e-6, view.width / 2);
  out.pan = Math.max(-1, Math.min(1, (e.x - (view.x + half)) / half));
  return out;
}
