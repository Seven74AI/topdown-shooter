import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { circleHitsBuilding } from "../buildings/collision";
import { createWorld } from "../core/world";
import { changeDecayStage } from "./decaySystem";
import { DOWNTOWN_MAP } from "../map/downtown";
import { addPlayer } from "../player/player";
import { spawnZombie } from "../zombies/zombiePool";

/**
 * Fix bloater-car-corner (review B2): the push-out's escape (`pushOutOfBuildings › escapeInside`) is
 * opt-in, and decay relocation does not opt in, so its results stay exactly as they were. Walkers,
 * Brutes and 4 players stand on a 1 m grid over every stage-4 "add"/"block" mutation box (legal at
 * stage 3); the stage 3 → 4 change relocates them. The hash covers every body's Float32 position and
 * pool generation. It was computed on master 2a88929, before the fix.
 */
const balance = loadBalance();
const MASTER_HASH: Readonly<Record<number, number>> = { 1: 3124299695, 5: 222061733 };

function relocationHash(seed: number): { hash: number; zombies: number; players: number } {
  const w = createWorld({ balance, seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  changeDecayStage(w, 3);
  let players = 0;
  const ids: number[] = [];
  for (const m of DOWNTOWN_MAP.decay) {
    if (m.stage !== 4 || (m.action !== "add" && m.action !== "block")) continue;
    for (let x = m.minX + 0.25; x < m.maxX; x += 1) {
      for (let y = m.minY + 0.25; y < m.maxY; y += 1) {
        const big = (Math.round(x * 4) + Math.round(y * 4)) % 3 === 0;
        if (circleHitsBuilding(w, x, y, big ? 0.6 : 0.35)) continue;
        if (players < 4 && (Math.round(x * 2) + Math.round(y * 2)) % 7 === 0) {
          addPlayer(w, `p${players++}`, x, y);
          continue;
        }
        const id = spawnZombie(w, big ? "brute" : "walker", x, y);
        if (id >= 0) ids.push(id);
      }
    }
  }
  changeDecayStage(w, 4);
  let h = 2166136261 >>> 0;
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  const mix = (v: number): void => {
    f[0] = v;
    h = Math.imul(h ^ (u[0] as number), 16777619) >>> 0;
  };
  for (const id of ids) {
    mix(w.zombies.x[id] as number);
    mix(w.zombies.y[id] as number);
    mix(w.zombies.generation[id] as number);
  }
  for (const p of [...w.players.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    mix(p.x);
    mix(p.y);
  }
  return { hash: h, zombies: ids.length, players };
}

describe("decay relocation is unchanged by the push-out escape (fix bloater-car-corner, review B2)", () => {
  for (const seed of [1, 5]) {
    it(`seed ${seed}: stage 3 → 4 relocation gives master's positions`, () => {
      const r = relocationHash(seed);
      expect(r.zombies, "liveness: bodies stood in the new boxes").toBe(65);
      expect(r.players).toBe(4);
      expect(r.hash).toBe(MASTER_HASH[seed]);
    });
  }
});
