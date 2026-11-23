import { describe, expect, it } from "vitest";
import { BRUTE_BANNER_MAX_AGE_S, BRUTE_ROAR_MAX_AGE_S, bruteSpawnCue, type BruteCue } from "./bruteCue";

const view = { x: 10, y: 0, width: 20, height: 10 };
const ev = (first: boolean, x: number, ageS?: number) => ({ type: "zombie.brute_spawned" as const, zombieId: 4, x, y: 5, first, ...(ageS === undefined ? {} : { ageS }) });

describe("Story 5.7 Brute spawn cue (AC 4; Beat the rule 9)", () => {
  it("roar on every Brute, the banner on the run's first only", () => {
    const out: BruteCue = { roar: false, banner: false, pan: 0 };
    expect(bruteSpawnCue(ev(true, 20), view, out)).toEqual({ roar: true, banner: true, pan: 0 });
    expect(bruteSpawnCue(ev(false, 20), view, out)).toEqual({ roar: true, banner: false, pan: 0 });
  });

  it("panned by position, clamped off screen (heard from anywhere)", () => {
    const out: BruteCue = { roar: false, banner: false, pan: 0 };
    expect(bruteSpawnCue(ev(false, 25), view, out).pan).toBeCloseTo(0.5, 9);
    expect(bruteSpawnCue(ev(false, -40), view, out)).toMatchObject({ roar: true, pan: -1 });
    expect(bruteSpawnCue(ev(false, 90), view, out).pan).toBe(1);
  });

  it("a woken tab's backlog: no roar after 1 s, no banner after 3 s", () => {
    const out: BruteCue = { roar: false, banner: false, pan: 0 };
    expect(bruteSpawnCue(ev(true, 20, BRUTE_ROAR_MAX_AGE_S), view, out)).toMatchObject({ roar: true, banner: true });
    expect(bruteSpawnCue(ev(true, 20, 2), view, out)).toMatchObject({ roar: false, banner: true });
    expect(bruteSpawnCue(ev(true, 20, BRUTE_BANNER_MAX_AGE_S + 0.05), view, out)).toMatchObject({ roar: false, banner: false });
  });
});
