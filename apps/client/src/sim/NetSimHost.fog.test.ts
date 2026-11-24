import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  TICK_DT_S,
  addPlayer,
  applyDecayStage,
  bundledBalanceFiles,
  createWorld,
  gearBit,
  loadBalance,
  setInput,
  setLoadout,
  spawnZombie,
  startBuild,
  startWave,
  step,
  withOverrides,
  DOWNTOWN_MAP,
  BYTES,
  HORDE_MAX_FRAME_BYTES,
  ZOMBIE_STATE,
  hordeFrameBytes,
  packTypeState,
  writeHordeHeader,
  writeHordeRecord,
  zombieNetId,
  type SimEvent,
} from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";

/**
 * Story 6.4 review M1 (F4, brief 26): touch aim assist at stage 5 is the same on my phone (NetSimHost's
 * predicted shot) and on the server (`tryFire` in the shared step): a zombie the fog hides from the
 * shooter (11.5 m, no beam reaching it) is never assisted; inside the shooter's own Tactical beam it is.
 * Spread is 0 here so the two directions can be compared exactly.
 */
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["weapons", "hunting_rifle.spreadDeg", 0]]));
/** Downtown (the mirror's map) at the team start, aiming west down the open street (no car on the line at mask 0). */
const ME = { x: 24, y: 16 };
const DEG = Math.PI / 180;
const Z = { x: ME.x - Math.cos(4 * DEG) * 11.5, y: ME.y - Math.sin(4 * DEG) * 11.5 };
const touch = { ...NEUTRAL_INPUT, aimX: -1, aimY: 0, fire: true, isMouse: false };
/** The shot's bend from the raw aim (degrees; 0 = raw). */
const bend = (dx: number, dy: number): number => Math.atan2(-dy, -dx) / DEG;

/** My phone: the predicted local shot's direction (degrees). */
function predicted(gear: number): number {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 5, y: 5 }), fakePlayer(1, { x: ME.x, y: ME.y, weapon0: "hunting_rifle", ammo0: 5, gear })]));
  room.state.decayStage = 5;
  room.state.phase = "wave";
  room.state.wave = 9;
  room.state.blackoutPct = 10;
  let now = 0;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => now });
  // The mirror's zombie comes from the horde stream (sampled at the render tick), as online.
  const scratch = new Uint8Array(HORDE_MAX_FRAME_BYTES);
  const view = new DataView(scratch.buffer);
  for (let t = 10; t <= 16; t++) {
    now = 500 + t * 50;
    writeHordeHeader(view, t, 1);
    writeHordeRecord(view, 0, zombieNetId(3, 1), Z.x, Z.y, 0, packTypeState(0, ZOMBIE_STATE.CHASE));
    room.deliver(BYTES.HORDE_FRAME, scratch.slice(0, hordeFrameBytes(1)));
    room.state.tick = t;
    room.patch();
    host.update(0);
  }
  expect([host.world.decay.stage, host.world.decay.variants, host.world.zombies.aliveCount]).toEqual([5, 0, 1]);
  if (gear) expect(host.world.players.get("p1")?.gear).toBe(gear);
  host.setLocalInput(touch);
  host.update(0.05);
  const fired = host.drainEvents().find((e) => e.type === "weapon.fired") as Extract<SimEvent, { type: "weapon.fired" }> | undefined;
  if (!fired) throw new Error("no local shot");
  host.dispose();
  return bend(fired.dirX, fired.dirY);
}

/** The server: the same shot through the shared step (`tryFire`). */
function server(gear: number): number {
  const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {}, zombies: () => {} } });
  w.decay.variants = 0;
  w.debug.decayStageByWave = Array(10).fill(5);
  const p = addPlayer(w, "p1", ME.x, ME.y);
  p.gear = gear;
  p.hp = 1e9;
  setLoadout(balance, p.loadout, ["hunting_rifle", "pistol"]);
  startBuild(w);
  startWave(w);
  applyDecayStage(w, 5, 0);
  spawnZombie(w, "walker", Z.x, Z.y);
  const shots: SimEvent[] = [];
  w.events.subscribe((e) => e.type === "weapon.fired" && shots.push(e));
  setInput(w, "p1", touch);
  step(w, TICK_DT_S);
  const s = shots[0];
  if (s?.type !== "weapon.fired") throw new Error("no server shot");
  return bend(s.dirX, s.dirY);
}

describe("Story 6.4 review M1: aim assist in the fog — my predicted shot = the server's", () => {
  it("a fog-hidden zombie at 11.5 m is not assisted on either side; inside my Tactical beam both bend to it", () => {
    const tactical = gearBit(balance, "tactical_flashlight");
    const hiddenPhone = predicted(0);
    const hiddenServer = server(0);
    expect(hiddenServer).toBeCloseTo(0, 6); // raw aim kept
    expect(hiddenPhone).toBeCloseTo(hiddenServer, 6); // exactly the raw aim on both
    const litPhone = predicted(tactical);
    const litServer = server(tactical);
    expect(litServer).toBeGreaterThan(3); // bent toward the zombie (~4° from the muzzle)
    expect(litPhone).toBeCloseTo(litServer, 1); // the horde stream quantizes the zombie's position (≈ 0.01°)
  });
});
