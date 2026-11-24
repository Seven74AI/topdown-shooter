import { describe, expect, it } from "vitest";
import { setLoadout } from "../combat/loadout";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { NEUTRAL_INPUT } from "../net/input";
import { createHeadlessWorld } from "../replay/inputLog";
import { setBuildReady } from "../run/runStateMachine";
import type { SimEvent } from "./simEvents";
import { setInput, step } from "./world";

/**
 * Story 4.4 review M1 (a player-visible property, brief line 10): "shooting doesn't move where
 * zombies come from". Two solo runs from one seed, identical except that in one the survivor fires
 * SMG bursts (solo spread draws from the `combat` stream) while the wave spawns. The spawn position
 * of every wave-1 zombie must be the same in both.
 */
const balance = loadBalance();
const TICKS = 400; // 20 s: wave 1 solo (16 Walkers) spawns completely

function spawnsOf(fire: boolean): { spawns: string[]; shots: number } {
  const { world } = createHeadlessWorld(balance, 2468, 1);
  const p = world.players.get("p0");
  if (!p) throw new Error("no p0");
  setLoadout(balance, p.loadout, ["smg", null]); // 8° spread: every shot draws
  setBuildReady(world, "p0", true); // the wave starts on the next tick
  let shots = 0;
  world.events.subscribe((e: SimEvent) => {
    if (e.type === "weapon.fired") shots++;
  });
  const seen = new Set<string>();
  const spawns: string[] = [];
  const z = world.zombies;
  for (let seq = 1; seq <= TICKS; seq++) {
    // Aim straight down; fire only in the firing run (and never move: spawn picks depend on positions).
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq, aimX: 0, aimY: 1, fire, isMouse: true });
    step(world, TICK_DT_S);
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const key = `${id}:${z.generation[id]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spawns.push(`${(z.x[id] as number).toFixed(4)},${(z.y[id] as number).toFixed(4)}`);
    }
  }
  return { spawns, shots };
}

describe("named streams in a real run (Story 4.4 review M1)", () => {
  it("solo shots (combat stream) don't move any zombie's spawn position", () => {
    const quiet = spawnsOf(false);
    const firing = spawnsOf(true);
    expect(quiet.shots).toBe(0);
    expect(firing.shots).toBeGreaterThan(20); // liveness: the spread really drew
    expect(quiet.spawns.length).toBe(14); // liveness: the whole of wave 1 spawned (40 × 0.35 solo)
    expect(firing.spawns.slice(0, 14)).toEqual(quiet.spawns);
  });
});
