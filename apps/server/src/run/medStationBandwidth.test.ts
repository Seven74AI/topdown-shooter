import { describe, expect, it } from "vitest";
import { Encoder } from "@colyseus/schema";
import { pack } from "msgpackr";
import { PLACEHOLDER_MAP, BUILD_GRID_M, addBuildingAt, encodeNetEvent, loadBalance, startWave, TICK_DT_S, type NetEventContext } from "@topdown/shared";
import { RunController } from "./RunController";
import { PlayerState, RunState } from "../rooms/schema/RunState";
import { syncState } from "../rooms/schema/syncState";

const balance = loadBalance();
const SECONDS = 15;
const TICKS = SECONDS / TICK_DT_S;

interface Bw {
  /** Patches + events per client (B/s), everything to everyone (the worst case). */
  bps: number;
  eventBps: number;
  patchBps: number;
  /** HP gained by all players over the run (liveness). */
  healed: number;
}

/**
 * Story 5.10 (brief line 11, AC 12): 4 players standing still in a wave; `floods` floodlights and
 * `meds` med stations placed (into the schema once before measuring); `hurt` players start at 10 HP
 * inside a station's ring. Everything measured after placement is caused by the scenario: a
 * floodlight adds nothing (its light is derived), healing adds the HP field patches (~5 per second
 * per healing player: the schema sends `ceil(hp)`).
 */
function measure(floods: number, meds: number, hurt: number): Bw {
  const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
  const c = new RunController({ balance, seed: 5, players, pauseWaves: true, systems: { zombies: () => {} }, map: PLACEHOLDER_MAP });
  const world = c.world;
  startWave(world);
  const state = new RunState({ phase: "wave", hostSlot: 0 });
  for (const p of players) state.players.set(p.playerId, new PlayerState({ slot: p.slot, name: p.playerId, ready: true }));
  const encoder = new Encoder(state);
  const ctx: NetEventContext = { balance, zombieNetId: (id) => id | ((world.zombies.generation[id] ?? 0) << 8) };
  // Players on a row 3 m apart at y = 15; a station 1.2 m above each of the first `meds`.
  let id = 1;
  for (let i = 0; i < 4; i++) {
    const p = world.players.get(`p${i}`);
    if (!p) throw new Error("no player");
    p.x = p.prevX = 8 + i * 6;
    p.y = p.prevY = 15;
    if (i < meds) addBuildingAt(world, { id: id++, type: "med_station", ownerId: p.id, gx: (p.x - 0.5) / BUILD_GRID_M, gy: (p.y - 2) / BUILD_GRID_M, rot: 0, hp: 300 });
  }
  for (let i = 0; i < floods; i++) addBuildingAt(world, { id: id++, type: "floodlight", ownerId: "p0", gx: (6 + i * 6) / BUILD_GRID_M, gy: 24 / BUILD_GRID_M, rot: 0, hp: 150 });
  c.tick();
  syncState(state, c);
  encoder.encode();
  encoder.discardChanges();
  let start = 0;
  for (let i = 0; i < hurt; i++) {
    const p = world.players.get(`p${i}`);
    if (p) p.hp = 10;
  }
  for (const p of world.players.values()) start += p.hp;
  let eventBytes = 0;
  let patchBytes = 0;
  for (let t = 0; t < TICKS; t++) {
    const events = c.tick();
    syncState(state, c);
    const tuples = [];
    for (const e of events) {
      const tu = encodeNetEvent(e, ctx);
      if (tu) tuples.push(tu);
    }
    patchBytes += encoder.encode().length;
    encoder.discardChanges();
    eventBytes += tuples.length > 0 ? pack({ tick: world.tick, events: tuples }).length : 0;
  }
  let end = 0;
  for (const p of world.players.values()) end += p.hp;
  return { bps: (eventBytes + patchBytes) / SECONDS, eventBps: eventBytes / SECONDS, patchBps: patchBytes / SECONDS, healed: end - start };
}

describe("Story 5.10 bandwidth (brief line 11)", () => {
  it("an idle floodlight adds 0 B/s after placement; healing adds the HP patches only (report)", () => {
    const base = measure(0, 0, 0);
    const lit = measure(4, 0, 0);
    const stations = measure(0, 4, 0); // stations, nobody hurt: nothing to heal, nothing sent
    const one = measure(0, 1, 1);
    const four = measure(0, 4, 4);
    const add = (b: Bw) => +(b.bps - base.bps).toFixed(1);
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(
      `[bw] Story 5.10 (per client, B/s): baseline ${base.bps.toFixed(1)}; 4 floodlights +${add(lit)}; 4 idle med stations +${add(stations)}; 1 player healing +${add(one)} (healed ${one.healed.toFixed(2)} HP); 4 players healing +${add(four)} (healed ${four.healed.toFixed(2)} HP)`,
    );
    expect(lit.bps).toBe(base.bps); // derived light list: nothing on the wire
    expect(stations.bps).toBe(base.bps);
    // Liveness: the heals really happened (15 s × 5 HP/s from 10 HP).
    expect(one.healed).toBeCloseTo(75, 6);
    expect(four.healed).toBeCloseTo(300, 6);
    expect(one.eventBps).toBe(base.eventBps); // no heal event (D6: the cue is from state)
    expect(add(one)).toBeGreaterThan(0);
    expect(add(one)).toBeLessThan(40); // AC 12: ≈ 15–25 B/s per healing player
    expect(add(four)).toBeLessThan(4 * 40);
  });
});
