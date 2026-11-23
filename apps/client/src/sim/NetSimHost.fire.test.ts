import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, NET_EVENT_KIND, addPlayer, S2C, changeDecayStage, createWorld, loadBalance, skipWave, startBuild, startWave, step, type SimEventsFlushed, type World } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { staticKey } from "../render/city/stageFilter";
import { FIRE_CUE_MS, FireCue, isFireHit } from "../render/fireCue";
import { NetSimHost } from "./NetSimHost";
import { LocalSimHost } from "./LocalSimHost";

/**
 * Story 4.8 (brief lines 2, 11, 12, 14): the client's mirror World and its Predictor know the
 * server's burning fires (stage + variants + the burned-out mask, through the shared
 * `applyDecayStage`), the renderer's redraw key changes when a fire goes out, the hurt cue follows
 * the server's fire damage events only, and solo runs the same fire system.
 */
const balance = loadBalance();
const fireNames = (w: World) => w.decay.fires.map((f) => f.name);

/** The server's World with fires lit, and the same World two waves later with them out. */
function serverRun(seed = 8) {
  const w = createWorld({ balance, seed, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
  w.debug.godMode = true;
  w.debug.decayStageByWave = [3, 3, 3, 3, 3];
  startBuild(w);
  return w;
}
function nextBuild(w: World): void {
  startWave(w);
  skipWave(w);
  step(w, 0.05);
}

function setup(stage: number, variants: number, firesOut = 0) {
  const room = new FakeRoom(fakeState([fakePlayer(1, { x: 24, y: 16 })]));
  room.state.phase = "build";
  room.state.decayStage = stage;
  room.state.decayVariants = variants;
  room.state.decayFiresOut = firesOut;
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  let now = 0;
  const host = new NetSimHost({ balance, session, now: () => now });
  return { room, host, setNow: (t: number) => (now = t) };
}

describe("NetSimHost fires (Story 4.8)", () => {
  it("mirror and Predictor burn exactly the server's fires; when they go out (decayFiresOut) both drop them and the city redraw key changes", () => {
    const s = serverRun();
    expect(s.decay.fires).toHaveLength(2);
    const lit = fireNames(s);
    const { room, host } = setup(3, s.decay.variants, s.decay.firesOut);
    room.state.tick = 1;
    room.patch();
    host.update(1 / 60);
    expect(fireNames(host.world)).toEqual(lit);
    expect(host.predictor.fireNames).toEqual(lit);
    const key = staticKey(host.world.obstacles.stage, host.world.obstacles.version, host.world.decay.fires.length);
    nextBuild(s);
    nextBuild(s); // the build start before wave 3: out
    expect(s.decay.fires).toEqual([]);
    expect(s.decay.firesOut).not.toBe(0);
    room.state.tick = 2;
    room.state.decayFiresOut = s.decay.firesOut;
    room.patch();
    host.update(1 / 60);
    expect(host.world.decay.fires).toEqual([]);
    expect(host.predictor.fireNames).toEqual([]);
    expect(host.world.decay.firesOut).toBe(s.decay.firesOut);
    expect(staticKey(host.world.obstacles.stage, host.world.obstacles.version, host.world.decay.fires.length)).not.toBe(key);
    // Unchanged state: no rebuild per frame.
    const v = host.world.obstacles.version;
    host.update(1 / 60);
    expect(host.world.obstacles.version).toBe(v);
  });

  it("a tab that slept across the build start that put the fires out wakes with them out (late patch)", () => {
    const s = serverRun(13);
    const { room, host, setNow } = setup(3, s.decay.variants, 0);
    room.state.tick = 10;
    room.patch();
    host.update(1 / 60);
    expect(host.world.decay.fires).toHaveLength(2);
    nextBuild(s);
    nextBuild(s);
    for (let t = 11; t <= 200; t++) {
      room.state.tick = t;
      if (t === 120) room.state.decayFiresOut = s.decay.firesOut;
      room.patch();
    }
    setNow(10_000);
    host.update(10);
    host.update(0.05);
    expect(host.world.decay.fires).toEqual([]);
    expect(host.predictor.fireNames).toEqual([]);
  });

  it("the ?lag dev throttle copies decayFiresOut (RUN_STATE_FIELDS)", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0)]));
    room.state.decayStage = 3;
    room.state.decayFiresOut = 5;
    let now = 0;
    const throttle = new DevThrottle(room, { lagMs: 100, jitterMs: 0, random: () => 0.5, now: () => now });
    room.patch();
    now = 150;
    throttle.pump(150);
    expect(throttle.state.decayFiresOut).toBe(5);
  });

  it("fire damage arrives as the server's player.damaged (source −1): the cue follows it, HP is the server's", () => {
    const { room, host, setNow } = setup(3, 0);
    room.state.tick = 5;
    const me = room.state.players.get("p1");
    if (me) me.hp = 95;
    room.patch();
    room.deliver(S2C.SIM_EVENTS_FLUSHED, { tick: 5, events: [[NET_EVENT_KIND.PLAYER_DAMAGED, 1, 50, -1]] } satisfies SimEventsFlushed);
    setNow(100);
    host.update(0.05);
    expect(host.world.players.get("p1")?.hp).toBe(95);
    const evs = host.drainEvents();
    const hit = evs.find(isFireHit);
    expect(hit).toMatchObject({ type: "player.damaged", playerId: "p1", amount: 5, sourceZombieId: -1, tag: "fire", sourcePlayerId: null });
    const cue = new FireCue();
    for (const e of evs) if (isFireHit(e)) cue.hit(e.playerId, 1000);
    expect(cue.burning("p1", 1000 + FIRE_CUE_MS - 1)).toBe(true);
    expect(cue.burning("p1", 1000 + FIRE_CUE_MS)).toBe(false);
    expect(cue.burning("p0", 1000)).toBe(false);
  });
});

describe("Story 4.8 fire cue (pure)", () => {
  it("only zombie-less damage is a fire hit; a zombie bite is not", () => {
    expect(isFireHit({ type: "player.damaged", playerId: "a", amount: 5, sourceZombieId: -1, tag: "fire", sourcePlayerId: null })).toBe(true);
    expect(isFireHit({ type: "player.damaged", playerId: "a", amount: 10, sourceZombieId: 3, tag: "zombie", sourcePlayerId: null })).toBe(false);
    expect(isFireHit({ type: "build.started", wave: 1 })).toBe(false);
  });
});

describe("Story 4.8 solo", () => {
  it("LocalSimHost runs the fire system: a survivor standing in a fire loses 10 HP per second and gets the fire events", () => {
    const host = new LocalSimHost({ balance, seed: 3 });
    const w = host.world;
    changeDecayStage(w, 3);
    expect(w.decay.fires).toHaveLength(2);
    const f = w.decay.fires[0];
    const p = addPlayer(w, host.localPlayerId, 0, 0); // GameScene adds the solo survivor
    if (!f) throw new Error("setup");
    // Next to the car, inside the zone, outside the car box.
    const car = w.obstacles.cover.find((c) => c.name === f.target);
    if (!car) throw new Error("car");
    p.x = f.x;
    p.y = car.minY - p.radiusM - 0.05;
    p.prevX = p.x;
    p.prevY = p.y;
    w.run.buildTicksLeft = 1e6;
    const hp0 = p.hp;
    for (let i = 0; i < 20; i++) host.update(0.05);
    expect(p.hp).toBe(hp0 - 10);
    expect(host.drainEvents().filter(isFireHit)).toHaveLength(2);
  });
});
