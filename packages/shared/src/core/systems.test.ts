import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { addPlayer } from "../player/player";
import { PREDICTION_SYSTEMS } from "./systems";
import { createWorld, setInput, step, type World } from "./world";

const balance = loadBalance();

/** A mixed walk: circles, stops, diagonals beyond length 1 (clamped), and a run into the wall. */
function inputAt(i: number): PlayerInput {
  const a = i * 0.21;
  const phase = Math.floor(i / 40) % 4;
  const moveX = phase === 0 ? Math.cos(a) : phase === 1 ? 0 : phase === 2 ? 1 : -1;
  const moveY = phase === 0 ? Math.sin(a) : phase === 1 ? 0 : phase === 2 ? 1 : 0.3;
  return { ...NEUTRAL_INPUT, seq: i + 1, moveX, moveY, aimX: Math.sin(a), aimY: -Math.cos(a), fire: i % 3 === 0, swap: i % 17 === 0 };
}

function run(world: World, n: number): void {
  for (let i = 0; i < n; i++) {
    setInput(world, "p0", inputAt(i));
    step(world, TICK_DT_S);
  }
}

describe("PREDICTION_SYSTEMS", () => {
  it("only input and movement run", () => {
    const w = createWorld({ balance, seed: 1, systems: PREDICTION_SYSTEMS });
    w.waves.paused = false;
    addPlayer(w, "p0", 24, 16);
    run(w, 400);
    expect(w.zombies.aliveCount).toBe(0); // waves never spawn in the prediction World
    expect(w.projectiles.aliveCount).toBe(0); // no combat: firing makes no projectiles
  });

  it("a predicted player ends exactly where the full World puts it", () => {
    const full = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
    const predicted = createWorld({ balance, seed: 0, systems: PREDICTION_SYSTEMS });
    addPlayer(full, "p0", 24, 16);
    addPlayer(predicted, "p0", 24, 16);
    for (let i = 0; i < 600; i++) {
      setInput(full, "p0", inputAt(i));
      setInput(predicted, "p0", inputAt(i));
      step(full, TICK_DT_S);
      step(predicted, TICK_DT_S);
      const a = full.players.get("p0");
      const b = predicted.players.get("p0");
      expect(b?.x).toBe(a?.x);
      expect(b?.y).toBe(a?.y);
      expect(b?.facingX).toBe(a?.facingX);
      expect(b?.facingY).toBe(a?.facingY);
    }
  });
});
