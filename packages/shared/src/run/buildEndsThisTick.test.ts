import { describe, expect, it } from "vitest";
import { createWorld, step } from "../core/world";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addPlayer } from "../player/player";
import { buildEndsThisTick, setBuildReady, startBuild } from "./runStateMachine";

describe("Story 8.4 (E8-S2): buildEndsThisTick", () => {
  const world = () => {
    const w = createWorld({ balance: loadBalance(), seed: 1 });
    addPlayer(w, "p0", 5, 5);
    addPlayer(w, "p1", 6, 5);
    startBuild(w);
    return w;
  };

  it("true exactly before the tick whose step starts the wave (timer)", () => {
    const w = world();
    let flagged = 0;
    for (let t = 0; t < 100_000 && w.run.phase === "build"; t++) {
      const ends = buildEndsThisTick(w);
      if (ends) flagged++;
      step(w, TICK_DT_S);
      expect((w.run.phase as string) === "wave").toBe(ends);
    }
    expect(flagged).toBe(1);
  });

  it("true when everyone is Ready (not while a late joiner loads); false outside a build", () => {
    const w = world();
    setBuildReady(w, "p0", true);
    expect(buildEndsThisTick(w)).toBe(false);
    setBuildReady(w, "p1", true);
    expect(buildEndsThisTick(w)).toBe(true);
    w.run.joinPending = true;
    expect(buildEndsThisTick(w)).toBe(false);
    w.run.joinPending = false;
    step(w, TICK_DT_S);
    expect(w.run.phase).toBe("wave");
    expect(buildEndsThisTick(w)).toBe(false);
  });
});
