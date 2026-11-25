import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NET_EVENT_KIND, NEUTRAL_INPUT, S2C, changeDecayStage, circleHitsBuilding, createWorld, loadBalance, skipWave, startWave, type SimEventsFlushed } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LocalSimHost } from "./LocalSimHost";
import { decayCheatAllowed, setDecayStageCheat } from "../debug/devCheatActions";

/**
 * Story 4.5 (brief lines 2, 11): the client's mirror World and its Predictor follow the room state's
 * decay stage and variants through the shared `applyDecayStage`, so they hold the server's map on a
 * normal patch, a late join, a tab that slept across a build start, a late host (Game scene) start
 * and under the `?lag` throttle; the banner comes as an event.
 */
const balance = loadBalance();
const names = (l: readonly { name: string }[]) => l.map((b) => b.name);
/** The server's World at a stage (same seed → the same variants: the state carries the mask anyway). */
function server(stage: number, seed = 8) {
  const w = createWorld({ balance, seed, map: DOWNTOWN_MAP });
  changeDecayStage(w, stage);
  return w;
}

function setup(stage = 1, variants = 0) {
  const room = new FakeRoom(fakeState([fakePlayer(1, { x: 24, y: 16 })]));
  room.state.phase = "build";
  room.state.decayStage = stage;
  room.state.decayVariants = variants;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  let now = 0;
  const host = new NetSimHost({ balance, session, now: () => now });
  return { room, host, setNow: (t: number) => (now = t) };
}

describe("NetSimHost decay (Story 4.5)", () => {
  it("a patch with a new stage applies the server's mutations to the mirror and the Predictor (same solids, same fires)", () => {
    const s = server(3);
    const { room, host } = setup(1, s.decay.variants);
    room.state.tick = 1;
    room.patch();
    host.update(1 / 60);
    expect(host.world.decay.stage).toBe(1);
    room.state.tick = 2;
    room.state.decayStage = 3;
    room.patch();
    host.update(1 / 60);
    expect(host.world.decay.stage).toBe(3);
    expect(names(host.world.obstacles.solids)).toEqual(names(s.obstacles.solids));
    expect(names(host.world.obstacles.shotBlockers)).toEqual(names(s.obstacles.shotBlockers));
    expect(host.world.decay.fires).toEqual(s.decay.fires);
    expect(host.predictor.decayStage).toBe(3);
    expect(host.predictor.solidNames).toEqual(names(s.obstacles.solids));
    const v = host.world.obstacles.version;
    host.update(1 / 60);
    expect(host.world.obstacles.version).toBe(v); // unchanged state: no rebuild per frame
  });

  it("a late join / late Game scene start: the host built after the change starts on the server's map", () => {
    const s = server(2, 31);
    const { host } = setup(2, s.decay.variants);
    host.update(1 / 60);
    expect(host.world.decay.stage).toBe(2);
    expect(names(host.world.obstacles.solids)).toEqual(names(s.obstacles.solids));
    expect(host.predictor.solidNames).toEqual(names(s.obstacles.solids));
  });

  it("a tab that slept across a build start: no frames for 10 s, then one frame lands on the new stage; my survivor isn't left inside the new box", () => {
    const s = server(2, 12);
    const { room, host, setNow } = setup(1, s.decay.variants);
    room.state.tick = 10;
    room.patch();
    host.update(1 / 60);
    // Asleep: the stage changes (the server moved me out of the dumpster), several patches arrive.
    const dump = DOWNTOWN_MAP.decay.find((m) => m.name === "dumpster_alley_3");
    if (!dump) throw new Error("dumpster");
    for (let t = 11; t <= 210; t++) {
      room.state.tick = t;
      if (t === 100) {
        room.state.decayStage = 2;
        const me = room.state.players.get("p1");
        if (me) {
          // Fix bloater-car-corner: east of the dumpster. The dumpster stands flush against the `se_offices` east wall
          // (x = 38), so its west side (the old `dump.minX - 0.4`) was inside that building, where the old push-out kept
          // the survivor for good; the fixed one takes it out, which broke the old spot, not the rule tested here.
          me.x = dump.maxX + 0.41; // 1 cm off the face (39.5 + 0.4 overlaps it by float rounding)
          me.y = 26.75;
        }
      }
      room.patch();
    }
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 100, events: [[NET_EVENT_KIND.DECAY_STAGE_CHANGED, 2, 1]] } satisfies SimEventsFlushed);
    setNow(10_500);
    expect(circleHitsBuilding(s, dump.maxX + 0.41, 26.75, balance.player.radiusM), "the server's spot is legal").toBe(false);
    host.setLocalInput({ ...NEUTRAL_INPUT, moveX: -1 }); // pressing west, into the dumpster
    host.update(10);
    host.update(0.05);
    expect(host.world.decay.stage).toBe(2);
    expect(host.predictor.solidNames).toContain("dumpster_alley_3");
    expect(host.predictor.x).toBeGreaterThanOrEqual(dump.maxX + balance.player.radiusM - 1e-9);
    // The banner event still arrives (the map itself never depended on it).
    const evs = host.drainEvents();
    expect(evs.filter((e) => e.type === "decay.stage_changed")).toEqual([{ type: "decay.stage_changed", stage: 2, from: 1 }]);
  });

  it("the ?lag dev throttle copies the decay fields (RUN_STATE_FIELDS)", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0)]));
    room.state.decayStage = 3;
    room.state.decayVariants = 9;
    let now = 0;
    const throttle = new DevThrottle(room, { lagMs: 100, jitterMs: 0, random: () => 0.5, now: () => now });
    room.patch();
    now = 150;
    throttle.pump(150);
    expect([throttle.state.decayStage, throttle.state.decayVariants]).toEqual([3, 9]);
  });

  it("stage 0 (a lobby patch) changes nothing", () => {
    const { room, host } = setup(0, 0);
    room.patch();
    host.update(1 / 60);
    expect(host.world.decay.stage).toBe(1);
  });

  it("solo: the dev cheat runs the DecaySystem on the LocalSimHost World; the banner event is delivered", () => {
    const host = new LocalSimHost({ balance, seed: 3 });
    expect(host.world.decay.stage).toBe(1);
    expect(setDecayStageCheat(host.world, 2)).toBe(2);
    host.update(0.05);
    expect(host.drainEvents().some((e) => e.type === "decay.stage_changed")).toBe(true);
    expect(names(host.world.obstacles.solids)).toContain("dumpster_alley_3");
    expect(setDecayStageCheat(host.world, 9)).toBe(5); // clamped; stages 4–5 have no content yet
  });

  it("review L1: the solo decay cheat works only in the build phase (never mid-wave); in a wave it changes nothing", () => {
    const host = new LocalSimHost({ balance, seed: 3 });
    const w = host.world;
    expect(decayCheatAllowed(w)).toBe(true); // the first build phase
    startWave(w);
    expect(decayCheatAllowed(w)).toBe(false);
    const v = w.obstacles.version;
    expect(setDecayStageCheat(w, 3)).toBe(1);
    expect(w.decay.stage).toBe(1);
    expect(w.obstacles.version).toBe(v);
    skipWave(w); // → the next build phase
    expect(decayCheatAllowed(w)).toBe(true);
    expect(setDecayStageCheat(w, 3)).toBe(3);
  });
});
