import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { NEUTRAL_INPUT, encodeNetEvent, loadBalance, spawnZombie, type NetEventContext } from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";
import { SLOW_TICK_MS } from "./slowTick";

const balance = loadBalance();
const WALKERS = 150;
const WARMUP_TICKS = 100;
const MEASURED_TICKS = 600; // 30 s of game time

/**
 * Server tick cost with 4 players and 150 Walkers (Story 2.4): one full `onTick` minus the socket
 * (controller.tick + syncState + event encoding) plus one patch encode, as the room does each 50 ms.
 * Players circle and fire (god mode keeps all 4 alive); the horde is topped up to 150 every tick.
 */
describe("server tick cost", () => {
  it("4 players + 150 Walkers stay far under the 40 ms slow-tick line", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const c = new RunController({ balance, seed: 99, players, pauseWaves: true });
    const world = c.world;
    world.debug.godMode = true;
    const state = new RunState({ phase: "wave", hostSlot: 0 });
    for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
    const encoder = new Encoder(state);
    encoder.encode();
    encoder.discardChanges();
    const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
    const points = world.map.spawnPoints;
    let spawnAt = 0;
    const topUp = (): void => {
      while (world.zombies.aliveCount < WALKERS) {
        const sp = points[spawnAt++ % points.length];
        if (!sp || spawnZombie(world, "walker", sp.x, sp.y, true) < 0) break;
      }
    };
    topUp();

    const times: number[] = [];
    let patchBytes = 0;
    let eventTuples = 0;
    for (let t = 1; t <= WARMUP_TICKS + MEASURED_TICKS; t++) {
      topUp();
      for (let i = 0; i < 4; i++) {
        const a = t * 0.05 + i * 1.6;
        c.queueInput(`p${i}`, { ...NEUTRAL_INPUT, seq: t, moveX: Math.cos(a) * 0.7, moveY: Math.sin(a) * 0.7, aimX: -Math.sin(a), aimY: Math.cos(a), fire: true });
      }
      const t0 = performance.now();
      const events = c.tick();
      syncState(state, c);
      for (const e of events) if (encodeNetEvent(e, ctx)) eventTuples++;
      const patch = encoder.encode();
      encoder.discardChanges();
      const ms = performance.now() - t0;
      if (t > WARMUP_TICKS) {
        times.push(ms);
        patchBytes += patch.length;
      }
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((s, v) => s + v, 0) / times.length;
    const p99 = times[Math.floor(times.length * 0.99)] ?? 0;
    const max = times[times.length - 1] ?? 0;
    console.log(
      `[tick cost] 4 players, ${WALKERS} Walkers, ${MEASURED_TICKS} ticks: mean ${mean.toFixed(3)} ms, ` +
        `p99 ${p99.toFixed(3)} ms, max ${max.toFixed(3)} ms; patch ${(patchBytes / MEASURED_TICKS).toFixed(0)} B/tick; ` +
        `${eventTuples} event tuples`,
    );
    expect(world.zombies.aliveCount).toBeGreaterThan(WALKERS - 10); // topped up before each tick
    expect(world.players.size).toBe(4);
    expect(mean).toBeLessThan(5);
    expect(p99).toBeLessThan(SLOW_TICK_MS);
  });
});
