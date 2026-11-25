import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { circleOverlapsBox } from "../buildings/collision";
import { step, type World } from "../core/world";
import type { PlayerState } from "../player/player";
import { ZOMBIE_STATE, isWindupState, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 6.13: one wide body (Brute, Bloater) against campers in a barricade box, run to its outcome
 * (shared by `wideBody.fuzz.test.ts` and `wideBodyStall.test.ts`; test-only).
 */
const balance = loadBalance();
const EPS = 1e-5;
/** The fairness rule's N: a zombie never stands still (< `STILL_M` from where it was) for longer than this while not attacking. */
export const STILL_S = 4;
export const STILL_M = 0.25;

export interface WideTrial {
  world: World;
  id: number;
  type: ZombieTypeId;
  rush: boolean;
  players: PlayerState[];
  closed: boolean;
  label: string;
}

export function insideBox(world: World, x: number, y: number, r: number): string | null {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r - EPS, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r - EPS, b.minX, b.minY, b.maxX, b.maxY)) return `${b.type} ${b.id}`;
  return null;
}

/**
 * Runs one trial to its outcome; returns the outcome and the longest still-and-not-attacking stretch (ticks).
 * "player": it touched a player, wound up on one or burst; "building": a building lost HP or a Bloater
 * swelled away from every player (against a building); "none": neither within `boundTicks`.
 */
export function runTrial(t: WideTrial, boundTicks: number): { outcome: "player" | "building" | "none"; atTick: number; longestStill: number; inBox: string | null } {
  const { world, id } = t;
  const z = world.zombies;
  const rz = balance.zombies.types[t.type]?.radiusM ?? 0;
  const pr = balance.player.radiusM;
  const hp0 = new Map(world.buildings.list.map((b) => [b.id, b.hp]));
  const gen = z.generation[id];
  let ax = z.x[id] as number;
  let ay = z.y[id] as number;
  let still = 0;
  let longestStill = 0;
  let inBox: string | null = null;
  for (let tick = 1; tick <= boundTicks; tick++) {
    const hpBefore = world.buildings.list.reduce((s, b) => s + b.hp, 0);
    const countBefore = world.buildings.list.length;
    step(world, TICK_DT_S);
    if (z.generation[id] !== gen) return { outcome: "player", atTick: tick, longestStill, inBox }; // burst (only after a swell)
    const x = z.x[id] as number;
    const y = z.y[id] as number;
    inBox ??= insideBox(world, x, y, rz);
    let touching = false;
    for (const p of t.players) if (Math.hypot(p.x - x, p.y - y) <= rz + pr + 0.05) touching = true;
    const hpAfter = world.buildings.list.reduce((s, b) => s + b.hp, 0);
    const hit = hpAfter < hpBefore || world.buildings.list.length < countBefore;
    const swell = z.state[id] === ZOMBIE_STATE.SWELL;
    const windup = isWindupState(z.state[id] as number);
    const lost = world.buildings.list.some((b) => b.hp < (hp0.get(b.id) ?? b.hp)) || world.buildings.list.length < hp0.size;
    if (touching || (windup && !lost)) return { outcome: "player", atTick: tick, longestStill, inBox };
    if (swell) return { outcome: touching ? "player" : "building", atTick: tick, longestStill, inBox };
    if (hit || lost) return { outcome: "building", atTick: tick, longestStill, inBox };
    if (Math.hypot(x - ax, y - ay) >= STILL_M) {
      ax = x;
      ay = y;
      still = 0;
    } else {
      still++;
      longestStill = Math.max(longestStill, still);
    }
  }
  return { outcome: "none", atTick: boundTicks, longestStill, inBox };
}
