import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, setInput, step } from "../core/world";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";
import { setLoadout } from "./loadout";

/** One mechanic: no waves, zombies stand still. */
const SYSTEMS = { waves: () => {}, zombies: () => {} };
const balance = loadBalance();

function setup(weapon: "hunting_rifle" | "pistol", advanceS: number) {
  const world = createWorld({ balance, seed: 1, systems: SYSTEMS });
  const p = addPlayer(world, "p0", 5, 16);
  p.hp = 1e9;
  p.shotAdvanceS = advanceS;
  setLoadout(balance, p.loadout, [weapon, null]);
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  // Mouse aim: no assist; the rifle has no spread.
  setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1, aimX: 1, aimY: 0, fire: true, isMouse: true });
  const muzzleX = p.x + p.radiusM + 0.1;
  return { world, p, events, muzzleX };
}

describe("shot advance (Story 2.7, AC 1)", () => {
  it("with 75 ms the first sweep is 3 + 4.5 m and hits a Walker 6 m out on tick 1", () => {
    const { world, events, muzzleX } = setup("hunting_rifle", 0.075);
    const zid = spawnZombie(world, "walker", muzzleX + 6, 16);
    step(world, TICK_DT_S);
    expect(events.some((e) => e.type === "zombie.hit" && e.zombieId === zid && e.sourceId === "p0")).toBe(true);
  });

  it("without advance the same Walker is not hit on tick 1 (3 m first sweep)", () => {
    const { world, events, muzzleX } = setup("hunting_rifle", 0);
    spawnZombie(world, "walker", muzzleX + 6, 16);
    step(world, TICK_DT_S);
    expect(events.some((e) => e.type === "zombie.hit")).toBe(false);
    step(world, TICK_DT_S);
    expect(events.some((e) => e.type === "zombie.hit")).toBe(true);
  });

  it("applies only to the first step, then resets", () => {
    const { world, muzzleX } = setup("hunting_rifle", 0.075);
    step(world, TICK_DT_S);
    const pool = world.projectiles;
    const id = pool.aliveIds[0] as number;
    expect(pool.x[id]).toBeCloseTo(muzzleX + 7.5, 4);
    expect(pool.advanceM[id]).toBe(0);
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 2, aimX: 1, aimY: 0, isMouse: true });
    step(world, TICK_DT_S);
    expect(pool.x[id]).toBeCloseTo(muzzleX + 10.5, 4);
  });

  it("never extends past the weapon's range", () => {
    const range = balance.weapons.hunting_rifle?.rangeM ?? 0;
    const { world, events, muzzleX } = setup("hunting_rifle", 0.15); // 9 m advance
    const beyond = spawnZombie(world, "walker", muzzleX + range + 0.5, 16); // edge 0.15 m past range
    step(world, TICK_DT_S);
    setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 2, aimX: 1, aimY: 0, isMouse: true });
    const id = world.projectiles.aliveIds[0] as number;
    expect(world.projectiles.x[id]).toBeCloseTo(muzzleX + 12, 4);
    for (let t = 0; t < 5; t++) step(world, TICK_DT_S);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.projectiles.x[id]).toBeCloseTo(muzzleX + range, 4);
    expect(events.some((e) => e.type === "zombie.hit" && e.zombieId === beyond)).toBe(false);
  });

  it("an advance larger than the range is cut at the range on the first step", () => {
    const { world, muzzleX } = setup("pistol", 1); // 60 m advance, 9 m range
    step(world, TICK_DT_S);
    const id = 0;
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.projectiles.x[id]).toBeCloseTo(muzzleX + (balance.weapons.pistol?.rangeM ?? 0), 1);
  });
});
