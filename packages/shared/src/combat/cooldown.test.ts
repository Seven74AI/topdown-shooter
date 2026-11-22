import { describe, expect, it } from "vitest";
import { TICK_DT_S } from "../config/constants";
import { cooldownIdle, cooldownReady, cooldownTickEnd, cooldownTickStart } from "./cooldown";

/** Runs the shared rule for `ticks` ticks; `held(t)` says whether the trigger is held on tick t. */
function shots(rateHz: number, ticks: number, held: (t: number) => boolean = () => true): number[] {
  let c = 0;
  const at: number[] = [];
  for (let t = 0; t < ticks; t++) {
    c = cooldownTickStart(c, TICK_DT_S);
    const fire = held(t) && cooldownReady(c);
    if (fire) at.push(t);
    c = cooldownTickEnd(c, fire, rateHz);
    expect(c).toBeGreaterThanOrEqual(-TICK_DT_S);
  }
  return at;
}

describe("cooldown rule (Story 2.7: shared by the server and the local fire clock)", () => {
  it("3/s gives exactly 30 shots in 10 s", () => {
    expect(shots(3, 200)).toHaveLength(30);
  });

  it("12/s gives 12 shots in 1 s (one per tick at most)", () => {
    expect(shots(12, 20)).toHaveLength(12);
  });

  it("idle never saves a burst: after a long pause shots come at the normal spacing", () => {
    const at = shots(3, 300, (t) => t < 10 || t >= 200);
    const after = at.filter((t) => t >= 200);
    expect(after[0]).toBe(200);
    for (let i = 1; i < after.length; i++) expect((after[i] as number) - (after[i - 1] as number)).toBeGreaterThanOrEqual(6);
  });

  it("idle ticks count down to 0 and never below", () => {
    expect(cooldownIdle(0.12, TICK_DT_S)).toBeCloseTo(0.07, 12);
    expect(cooldownIdle(0.01, TICK_DT_S)).toBe(0);
    expect(cooldownTickStart(0, TICK_DT_S)).toBe(0); // a ready weapon carries no credit
  });
});
