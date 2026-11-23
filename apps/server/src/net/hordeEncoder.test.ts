import { describe, expect, it } from "vitest";
import { ClientState } from "@colyseus/core";
import {
  BYTES,
  HORDE_VIEW_MARGIN_M,
  TICK_DT_S,
  TICK_RATE_HZ,
  VIEW_WIDTH_M,
  ZOMBIE_SLOT_HOLD_TICKS,
  ZOMBIE_STATE,
  NEUTRAL_INPUT,
  addPlayer,
  createRng,
  createWorld,
  killZombie,
  loadBalance,
  readHordeFrame,
  setInput,
  snapshotWorld,
  spawnZombie,
  stateOfTypeState,
  step,
  zombieGenerationOfNetId,
  type HordeSink,
  type World,
} from "@topdown/shared";
import { COLYSEUS_BYTES_HEADER, HordeEncoder, newHordeStats } from "./hordeEncoder";

const balance = loadBalance();
/** One mechanic: no wave director spawning extra zombies. */
const NO_WAVES = { waves: () => {} };

class FakeClient {
  readonly ref = { bufferedAmount: 0 };
  state: number = ClientState.JOINED;
  readonly frames: Uint8Array[] = [];
  sendBytes(type: number, bytes: Uint8Array): void {
    expect(type).toBe(BYTES.HORDE_FRAME);
    this.frames.push(bytes.slice()); // the encoder reuses its buffer
  }
}

interface Rec {
  netId: number;
  x: number;
  y: number;
  heading: number;
  typeState: number;
}
function decode(bytes: Uint8Array): { tick: number; recs: Rec[] } {
  const out = { tick: -1, recs: [] as Rec[] };
  const sink: HordeSink = {
    begin: (tick) => (out.tick = tick),
    record: (_i, netId, x, y, heading, typeState) => out.recs.push({ netId, x, y, heading, typeState }),
    end: () => {},
  };
  expect(readHordeFrame(bytes, sink)).toBe(true);
  return out;
}

function setup(px = 24, py = 16): { world: World; enc: HordeEncoder; client: FakeClient } {
  const world = createWorld({ balance, seed: 7, systems: NO_WAVES });
  addPlayer(world, "p0", px, py);
  return { world, enc: new HordeEncoder(), client: new FakeClient() };
}

const slots = (recs: Rec[]): number[] => recs.map((r) => r.netId & 0xff).sort((a, b) => a - b);

describe("HordeEncoder", () => {
  it("sends the zombies inside the view plus the margin, and rushers from anywhere", () => {
    const { world, enc, client } = setup(24, 16);
    const edge = 24 + VIEW_WIDTH_M / 2; // view edge at x = 36
    const inside = spawnZombie(world, "walker", 30, 16);
    const inMargin = spawnZombie(world, "walker", edge + HORDE_VIEW_MARGIN_M - 0.1, 16);
    const outside = spawnZombie(world, "walker", edge + HORDE_VIEW_MARGIN_M + 0.1, 16); // 4.1 m past the edge
    const stats = newHordeStats();
    enc.prepare(world);
    enc.send(world, client, stats, 24, 16);
    expect(slots(decode(client.frames[0] as Uint8Array).recs)).toEqual([inside, inMargin]);
    expect(outside).toBeGreaterThan(0);

    // Player near the left wall: the view is clamped (x ∈ [-4, 28]); a rusher at x = 45 still comes, once.
    const w2 = setup(2, 16);
    const near = spawnZombie(w2.world, "walker", 5, 16);
    const rusher = spawnZombie(w2.world, "walker", 45, 30);
    const rushInside = spawnZombie(w2.world, "walker", 6, 17);
    w2.world.zombies.state[rusher] = ZOMBIE_STATE.RUSH;
    w2.world.zombies.state[rushInside] = ZOMBIE_STATE.RUSH;
    spawnZombie(w2.world, "walker", 40, 16); // plain walker far away: not sent
    w2.enc.prepare(w2.world);
    w2.enc.send(w2.world, w2.client, newHordeStats(), 2, 16);
    const recs = decode(w2.client.frames[0] as Uint8Array).recs;
    expect(slots(recs)).toEqual([near, rusher, rushInside].sort((a, b) => a - b));
    const r = recs.find((x) => (x.netId & 0xff) === rusher) as Rec;
    expect(stateOfTypeState(r.typeState)).toBe(ZOMBIE_STATE.RUSH);
    expect(r.x).toBeCloseTo(45, 2);
  });

  it("Story 5.6: a Spitter's windup goes out as-is in the state nibble (0 B extra); a rushing one in its windup is still sent from anywhere", () => {
    const { world, enc, client } = setup(2, 16);
    const near = spawnZombie(world, "spitter", 5, 16);
    const far = spawnZombie(world, "spitter", 45, 30);
    world.zombies.state[near] = ZOMBIE_STATE.WINDUP;
    world.zombies.state[far] = ZOMBIE_STATE.RUSH_WINDUP;
    enc.prepare(world);
    enc.send(world, client, newHordeStats(), 2, 16);
    const recs = decode(client.frames[0] as Uint8Array).recs;
    expect(slots(recs)).toEqual([near, far].sort((a, b) => a - b));
    for (const [id, st] of [
      [near, ZOMBIE_STATE.WINDUP],
      [far, ZOMBIE_STATE.RUSH_WINDUP],
    ] as const) {
      const r = recs.find((x) => (x.netId & 0xff) === id) as Rec;
      expect(stateOfTypeState(r.typeState)).toBe(st);
      expect(r.typeState & 0x0f).toBe(3); // spitter = type 3
    }
  });

  it("skips (never queues) frames while the socket holds more than 64 KB", () => {
    const { world, enc, client } = setup();
    spawnZombie(world, "walker", 25, 16);
    const stats = newHordeStats();
    client.ref.bufferedAmount = 70_000;
    enc.prepare(world);
    expect(enc.send(world, client, stats, 24, 16)).toBe(0);
    expect(enc.send(world, client, stats, 24, 16)).toBe(0);
    expect(client.frames).toHaveLength(0);
    expect(stats).toEqual({ framesSent: 0, framesSkipped: 2, bytesSent: 0 });
    client.ref.bufferedAmount = 0;
    expect(enc.send(world, client, stats, 24, 16)).toBe(14);
    expect(client.frames).toHaveLength(1);
    expect(stats).toEqual({ framesSent: 1, framesSkipped: 2, bytesSent: 14 + COLYSEUS_BYTES_HEADER });
  });

  it("skips frames for a client that isn't JOINED (Colyseus would queue them)", () => {
    const { world, enc, client } = setup();
    const stats = newHordeStats();
    client.state = ClientState.RECONNECTING;
    enc.prepare(world);
    expect(enc.send(world, client, stats, 24, 16)).toBe(0);
    expect(client.frames).toHaveLength(0);
    expect(stats.framesSkipped).toBe(1);
  });

  it("encoding every tick never changes the simulation (the encoder rebuilds the zombie grid)", () => {
    const run = (withEncoder: boolean) => {
      const world = createWorld({ balance, seed: 21 }); // waves on: zombies spawn and chase
      addPlayer(world, "p0", 24, 16);
      const enc = new HordeEncoder();
      const client = new FakeClient();
      const stats = newHordeStats();
      for (let t = 0; t < 2000; t++) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: t + 1, aimX: Math.cos(t / 30), aimY: Math.sin(t / 30), fire: true, moveX: Math.sin(t / 50) });
        step(world, TICK_DT_S);
        if (withEncoder) {
          enc.prepare(world);
          enc.send(world, client, stats, 24, 16);
        }
      }
      return snapshotWorld(world);
    };
    expect(run(true)).toEqual(run(false));
  });

  it("sends empty frames (6 bytes) with the tick", () => {
    const { world, enc, client } = setup();
    step(world, TICK_DT_S);
    enc.prepare(world);
    enc.send(world, client, newHordeStats(), 24, 16);
    expect(client.frames[0]?.length).toBe(6);
    expect(decode(client.frames[0] as Uint8Array).tick).toBe(world.tick);
  });

  it("headings follow movement, hold when still, and reset with a new generation", () => {
    const { world, enc, client } = setup();
    const z = world.zombies;
    const id = spawnZombie(world, "walker", 20, 16);
    z.prevX[id] = 20;
    z.x[id] = 20;
    z.prevY[id] = 16;
    z.y[id] = 16.1; // moving +y → heading 64
    enc.prepare(world);
    enc.send(world, client, newHordeStats(), 24, 16);
    z.prevY[id] = 16.1; // standing still: keeps 64
    enc.prepare(world);
    enc.send(world, client, newHordeStats(), 24, 16);
    expect(client.frames.map((f) => decode(f).recs[0]?.heading)).toEqual([64, 64]);

    // Kill, wait out the hold, reuse the slot: new generation, heading not inherited.
    const gen0 = z.generation[id] as number;
    killZombie(world, id, null, "pistol");
    world.tick += ZOMBIE_SLOT_HOLD_TICKS;
    const again = spawnZombie(world, "walker", 22, 16);
    expect(again).toBe(id);
    enc.prepare(world);
    enc.send(world, client, newHordeStats(), 24, 16);
    const rec = decode(client.frames[2] as Uint8Array).recs[0] as Rec;
    expect(zombieGenerationOfNetId(rec.netId)).toBe((gen0 + 1) & 0xff);
    expect(rec.heading).toBe(0);
  });

  it("150 Walkers in view cost at most 24 KB/s per client at 20 Hz", () => {
    const { world, enc, client } = setup(24, 16);
    world.debug.godMode = true;
    const rng = createRng(150);
    for (let i = 0; i < 150; i++) spawnZombie(world, "walker", 24 + rng.range(-5, 5), 16 + rng.range(-3, 3));
    const stats = newHordeStats();
    let wire = 0;
    for (let t = 0; t < TICK_RATE_HZ; t++) {
      step(world, TICK_DT_S);
      enc.prepare(world);
      const p = world.players.get("p0");
      wire += COLYSEUS_BYTES_HEADER + enc.send(world, client, stats, p?.x ?? 24, p?.y ?? 16);
    }
    expect(world.zombies.aliveCount).toBe(150);
    expect(decode(client.frames[19] as Uint8Array).recs).toHaveLength(150);
    console.log(`[horde bandwidth] 150 Walkers in view, 20 frames: ${wire} B/s per client`);
    expect(wire).toBe(stats.bytesSent);
    expect(wire).toBe((2 + 6 + 150 * 8) * 20); // 24,160 B/s
    expect(wire).toBeLessThanOrEqual(24 * 1024);
  });

  it("one tick for 4 clients and 150 zombies costs well under 1 ms", () => {
    const { world, enc } = setup(24, 16);
    const rng = createRng(4);
    for (let i = 0; i < 150; i++) spawnZombie(world, "walker", rng.range(1, 47), rng.range(1, 31));
    const clients = [0, 1, 2, 3].map(() => new FakeClient());
    const stats = clients.map(() => newHordeStats());
    const at = [
      [10, 8],
      [38, 8],
      [10, 24],
      [38, 24],
    ] as const;
    const times: number[] = [];
    for (let t = 0; t < 400; t++) {
      step(world, TICK_DT_S);
      for (const c of clients) c.frames.length = 0;
      const t0 = performance.now();
      enc.prepare(world);
      for (let i = 0; i < 4; i++) enc.send(world, clients[i] as FakeClient, stats[i] as ReturnType<typeof newHordeStats>, at[i]?.[0] ?? 0, at[i]?.[1] ?? 0);
      if (t >= 100) times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((s, v) => s + v, 0) / times.length;
    console.log(`[horde encode] 4 clients, 150 zombies: mean ${mean.toFixed(3)} ms, p99 ${times[Math.floor(times.length * 0.99)]?.toFixed(3)} ms`);
    expect(mean).toBeLessThan(1);
  });
});

describe("Story 5.7: the Brute on the wire (brief line 11)", () => {
  it("one Brute in view is one more 8 B horde record (= 160 B/s at 20 Hz, like a Walker); its windup rides the state nibble", () => {
    const { world, enc, client } = setup(24, 16);
    const stats = newHordeStats();
    spawnZombie(world, "walker", 28, 16);
    enc.prepare(world);
    enc.send(world, client, stats, 24, 16);
    const one = (client.frames[0] as Uint8Array).length;
    const b = spawnZombie(world, "brute", 22, 16);
    world.zombies.state[b] = ZOMBIE_STATE.WINDUP;
    enc.prepare(world);
    enc.send(world, client, stats, 24, 16);
    const frame = client.frames[1] as Uint8Array;
    expect(frame.length - one).toBe(8);
    const rec = decode(frame).recs.find((r) => (r.netId & 0xff) === b);
    expect(rec && rec.typeState & 0x0f).toBe(4); // ZOMBIE_TYPES index 4 = brute
    expect(rec && stateOfTypeState(rec.typeState)).toBe(ZOMBIE_STATE.WINDUP);
    console.info(`[bandwidth 5.7] a Brute in view: +${(frame.length - one) * TICK_RATE_HZ} B/s per phone (one horde record)`);
    expect((frame.length - one) * TICK_RATE_HZ).toBe(160);
  });
});
