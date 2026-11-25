import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt } from "../buildings/buildings";
import { createWorld, setInput, step, type World } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { PLACEHOLDER_MAP } from "../map/placeholderMap";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { killZombie, spawnZombie } from "./zombiePool";
import { allRemainingHoldingSpitters } from "./spit";

/**
 * Spitter deadlock fix A (designer 2026-11-25, docs/epic-8-story-decisions.md "Designer answers";
 * docs/investigations/cut-test-stall-2026-11-25.md, Side Findings): 6 Spitters (one more than the
 * `lastRushCount` 5) hold their spot behind a camper's own barricade wall — acid passes barricades,
 * the camper's bullets stop on them. Before the fix nothing ever ended that wave; now the last rush
 * starts at once, the rushers walk in between spits and the camper shoots them. The full World runs
 * (real zombies AI, wave director, flow field built at the build start).
 */
const balance = loadBalance();

function campWorld(): { world: World; events: SimEvent[] } {
  const world = createWorld({ balance, seed: 11, map: PLACEHOLDER_MAP });
  // A wall of 4 wood barricades (rot 1: 0.5 m × 2 m, x 22–22.5, y 12–20) between the camper and the Spitters.
  for (let k = 0; k < 4; k++) addBuildingAt(world, { id: 1 + k, type: "wood_barricade", ownerId: "p0", gx: 44, gy: 24 + 4 * k, rot: 1, hp: 200 });
  const camper = addPlayer(world, "p0", 24.5, 16);
  startBuild(world); // the flow field sees the wall
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  world.run.buildTicksLeft = 1;
  step(world, TICK_DT_S); // → wave 1
  camper.hp = 1e9; // after the build-start heal (which caps at max HP)
  for (let i = 0; i < 2000 && world.waves.queued > 0; i++) step(world, TICK_DT_S);
  const z = world.zombies;
  for (let i = z.aliveCount - 1; i >= 0; i--) killZombie(world, z.aliveIds[i] as number, null, "cheat");
  for (let k = 0; k < 6; k++) spawnZombie(world, "spitter", 19.5, 13.5 + k, true); // all ≤ 5.6 m from the camper
  return { world, events };
}

/** The camper never moves: aims at the nearest zombie and holds fire (the wire bot's blind fire into the wall). */
function campTick(world: World, seq: number): void {
  const p = world.players.get("p0");
  const z = world.zombies;
  if (!p) return;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  const aimX = best < 0 ? 1 : (z.x[best] as number) - p.x;
  const aimY = best < 0 ? 0 : (z.y[best] as number) - p.y;
  setInput(world, "p0", { ...NEUTRAL_INPUT, seq, aimX, aimY, fire: best >= 0 });
  step(world, TICK_DT_S);
}

describe("Spitter deadlock fix A (6 Spitters holding behind a camper's barricade)", () => {
  it("the bullets really stop on the wall and every Spitter really holds (the stand-off exists)", () => {
    const { world } = campWorld();
    for (let t = 0; t < 3; t++) campTick(world, t + 1);
    expect(world.zombies.aliveCount).toBe(6);
    expect(allRemainingHoldingSpitters(world)).toBe(true);
  });

  it("the rush starts at once with 6 left (more than lastRushCount) and the wave ends", () => {
    const { world, events } = campWorld();
    expect(balance.waves.lastRushCount).toBe(5);
    let t = 0;
    for (; t < 20 * 90 && !events.some((e) => e.type === "wave.ended"); t++) campTick(world, t + 1);
    const rush = events.find((e) => e.type === "wave.rush_started");
    expect(rush).toEqual({ type: "wave.rush_started", count: 6 });
    expect(events.some((e) => e.type === "wave.ended"), `wave 1 ended within 90 s (ticks ${t})`).toBe(true);
    expect(events.filter((e) => e.type === "zombie.killed").length).toBeGreaterThanOrEqual(6);
  });

  it("only HOLDING Spitters count: one still walking in from afar keeps the normal ≤ 5 rule", () => {
    const { world } = campWorld();
    spawnZombie(world, "spitter", 45, 30, true); // 7 Spitters; this one is 25 m away (out of its 6 m range): walking
    expect(allRemainingHoldingSpitters(world)).toBe(false);
    campTick(world, 1);
    expect(world.waves.rushing).toBe(false);
  });

  it("review L5: the rush waits for the stand-off to last spitterStall.holdS (8 s): not after 7 s, yes by 9 s", () => {
    const { world, events } = campWorld();
    const hold = balance.waves.spitterStall.holdS;
    expect(hold).toBe(8);
    for (let t = 0; t < 20 * (hold - 1); t++) campTick(world, t + 1);
    expect(world.waves.rushing).toBe(false); // 7 s of all-holding: still an open fight
    for (let t = 0; t < 20 * 2; t++) campTick(world, t + 1000);
    expect(events.find((e) => e.type === "wave.rush_started")).toEqual({ type: "wave.rush_started", count: 6 });
  });

  it("review L5: a brief all-holding moment broken by a walker starts the 8 s over", () => {
    const { world } = campWorld();
    for (let t = 0; t < 20 * 5; t++) campTick(world, t + 1); // 5 s all-holding
    const walker = spawnZombie(world, "walker", 45, 30, true); // the stand-off is broken
    for (let t = 0; t < 20 * 5; t++) campTick(world, t + 200); // 10 s since the first moment
    expect(world.waves.rushing).toBe(false);
    killZombie(world, walker, null, "cheat"); // all-holding again: a fresh 8 s
    for (let t = 0; t < 20 * 7; t++) campTick(world, t + 400);
    expect(world.waves.rushing).toBe(false);
    for (let t = 0; t < 20 * 2; t++) campTick(world, t + 600);
    expect(world.waves.rushing).toBe(true);
  });

  it("nit: zombies still queued → never the early rush, however long the Spitters hold", () => {
    const { world } = campWorld();
    world.waves.queued = 3;
    world.waves.spawnTimerTicks = 1e9; // nothing leaves the queue in this test
    for (let t = 0; t < 20 * 12; t++) campTick(world, t + 1);
    expect(allRemainingHoldingSpitters(world)).toBe(true);
    expect(world.waves.rushing).toBe(false);
  });

  it("a mixed remainder (a Walker among the Spitters) waits for the normal ≤ 5 rule", () => {
    const { world } = campWorld();
    spawnZombie(world, "walker", 30, 30, true);
    expect(allRemainingHoldingSpitters(world)).toBe(false);
    campTick(world, 1);
    expect(world.waves.rushing).toBe(false);
  });
});
