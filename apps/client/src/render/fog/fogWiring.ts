/**
 * Story 6.10 follow-up (6.2 re-review R1): the Game scene's fog hookups in one place. The zombies,
 * the Crawlers' blood trails and the spit in flight are hidden by the fog on MY screen only (brief
 * 26), so each of those views must hold the scene's `ScreenFog`. `GameScene` calls this at create
 * and every frame in `updateScreenFog` (a view created later — acid on the first spit — is picked
 * up); `fogWiring.test.ts` checks both the wiring and that the scene really calls it.
 */
export interface FogTaker {
  fog: { visibility(x: number, y: number): number } | null;
}

export interface FogTakers {
  zombieView: FogTaker | null;
  trailView: FogTaker | null;
  acidView: FogTaker | null;
}

/** Gives every present view `fog`; returns how many were wired. */
export function wireFog(t: Readonly<FogTakers>, fog: FogTaker["fog"]): number {
  let n = 0;
  for (const v of [t.zombieView, t.trailView, t.acidView]) {
    if (!v) continue;
    if (v.fog !== fog) v.fog = fog;
    n++;
  }
  return n;
}
