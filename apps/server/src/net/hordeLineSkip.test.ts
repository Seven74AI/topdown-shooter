import { describe, expect, it } from "vitest";
import { ClientState } from "@colyseus/core";
import {
  HORDE_LINE_CONFIRM_MS,
  HORDE_LINE_SIGNAL_STALE_MS,
  HORDE_LINE_SKIP_MS,
  HordeStreamDecoder,
  INPUT_ACK_MASK,
  TICK_DT_S,
  addPlayer,
  createRng,
  createWorld,
  loadBalance,
  spawnZombie,
  type HordeSink,
  type World,
} from "@topdown/shared";
import { HordeEncoder, newHordeStats, type HordeStats } from "./hordeEncoder";

/**
 * Story 8.13: the slow-line horde skip, on an in-process model of `tools/netaudit/lagLine.ts` (same rules: the
 * server→client chunks are serialised at the cap before their one-way delay; a stalled chunk waits `stallMs` more and
 * everything behind it waits too; never a reorder). One chunk per tick = the tick's horde frame + its patch (8.11: one
 * write). The phone acks the newest tick it has received in an input every 50 ms, like `NetSimHost`.
 * The end-to-end numbers (bots, the real line) are in the story's table; this pins the rule with a seed.
 */

const balance = loadBalance();
const TICK_MS = TICK_DT_S * 1000;
/** The state patch + events of a tick in the 8.11 one-packet write (bytes; about the 8.10 audit's 2 KB/s). */
const PATCH_BYTES = 80;

interface LineCase {
  kbps: number; // 0 = no cap
  rttMs: number;
  jitterMs: number;
  lossPct: number;
  stallMs: number;
  ticks: number;
  zombies: number;
  seed: number;
  /** false: the phone sends no ack (the 8.10 server: only the 64 KB socket rule), the control. */
  acks?: boolean;
}

interface LineResult {
  stats: HordeStats;
  maxQueueMs: number;
  decodeErrors: number;
  framesDecoded: number;
  keysAfterSkip: number;
  /** Largest difference between the phone's zombies after a keyframe that followed a skip and the world at that tick (cm). */
  maxKeyErrCm: number;
  stallsUp: number;
  stallsDown: number;
  lineSlowTicks: number;
}

interface DownItem {
  at: number;
  tick: number;
  horde: Uint8Array | null;
  key: boolean;
  afterSkip: boolean;
}

/**
 * 10 s busy, 10 s calm, like a wave's rushes and lulls: busy, every zombie moves 4 cm per tick (a 3-byte TINY change
 * each: 130 zombies + the patch ≈ 9.6 KB/s, 1.2 × a 64 kbit/s line's 8 KB/s; the 8.13 bot runs peak at 8.6 KB/s);
 * calm, they stand (only the 1 s keyframes and the patch).
 */
function wander(world: World, tick: number): void {
  const z = world.zombies;
  const step = Math.floor(tick / 200) % 2 === 0 ? 0.04 : 0;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    z.prevX[id] = z.x[id] as number;
    z.prevY[id] = z.y[id] as number;
    z.x[id] = (z.x[id] as number) + step * Math.cos(id + tick * 0.05);
    z.y[id] = (z.y[id] as number) + step * Math.sin(id * 1.7 + tick * 0.05);
  }
  world.tick = tick;
}

function runLine(c: LineCase): LineResult {
  const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
  addPlayer(world, "p0", 24, 16);
  const rng = createRng(c.seed);
  for (let i = 0; i < c.zombies; i++) spawnZombie(world, "walker", 16 + 16 * rng.next(), 11 + 10 * rng.next());
  const enc = new HordeEncoder();
  const client = { state: ClientState.JOINED as number, ref: { bufferedAmount: 0 }, last: null as Uint8Array | null, sendBytes: (_t: number, b: Uint8Array) => (client.last = b.slice()) };
  const stats = newHordeStats();
  const decoder = new HordeStreamDecoder();
  const phone = { x: new Float64Array(256), y: new Float64Array(256), id: new Int32Array(256), n: 0 };
  const sink: HordeSink = {
    begin: () => (phone.n = 0),
    record: (i, netId, x, y) => {
      phone.id[i] = netId;
      phone.x[i] = x;
      phone.y[i] = y;
      phone.n = i + 1;
    },
    end: () => {},
  };
  /** The world's zombie positions per sent keyframe tick, to compare the phone's picture with. */
  const truth = new Map<number, Map<number, { x: number; y: number }>>();
  const bytesPerMs = c.kbps / 8;
  const oneWay = (): number => c.rttMs / 2 + (rng.next() - 0.5) * c.jitterMs;
  const stalled = (): boolean => c.lossPct > 0 && rng.next() * 100 < c.lossPct;
  const down: DownItem[] = [];
  const up: { at: number; ack: number }[] = [];
  let wireFreeAt = 0;
  let downLastAt = 0;
  let upLastAt = 0;
  let newestTick = -1;
  const r: LineResult = { stats, maxQueueMs: 0, decodeErrors: 0, framesDecoded: 0, keysAfterSkip: 0, maxKeyErrCm: 0, stallsUp: 0, stallsDown: 0, lineSlowTicks: 0 };
  let skippedSinceSent = false;
  for (let t = 1; t <= c.ticks; t++) {
    const now = t * TICK_MS;
    // The server: inputs that arrived by now, in order, then the tick.
    while (up.length > 0 && (up[0] as { at: number }).at <= now) {
      const u = up.shift() as { at: number; ack: number };
      if (c.acks !== false) enc.ack(client, u.ack, u.at);
    }
    wander(world, t);
    enc.prepare(world, now);
    client.last = null;
    const skippedBefore = stats.framesSkipped;
    enc.send(world, client, stats, 24, 16);
    if (enc.stateFor(client).lineSlow) r.lineSlowTicks++;
    const horde = client.last as Uint8Array | null;
    const key = horde !== null && enc.lastWasKey;
    if (key) {
      const m = new Map<number, { x: number; y: number }>();
      const z = world.zombies;
      for (let i = 0; i < z.aliveCount; i++) {
        const id = z.aliveIds[i] as number;
        m.set(id, { x: z.x[id] as number, y: z.y[id] as number });
      }
      truth.set(t, m);
    }
    const bytes = PATCH_BYTES + (horde?.length ?? 0);
    let wire = now;
    if (bytesPerMs > 0) {
      wireFreeAt = Math.max(wireFreeAt, now) + bytes / bytesPerMs;
      wire = wireFreeAt;
      r.maxQueueMs = Math.max(r.maxQueueMs, wire - now);
    }
    let delay = oneWay();
    const stalledNow = stalled();
    if (stalledNow) {
      delay += c.stallMs;
      r.stallsDown++;
    }
    downLastAt = Math.max(downLastAt, wire + delay);
    down.push({ at: downLastAt, tick: t, horde, key, afterSkip: skippedSinceSent });
    if (horde) skippedSinceSent = false;
    else if (stats.framesSkipped > skippedBefore) skippedSinceSent = true;
    // The phone, half a tick later: what arrived, then its input with the newest tick received.
    const phoneAt = now + TICK_MS / 2;
    while (down.length > 0 && (down[0] as DownItem).at <= phoneAt) {
      const d = down.shift() as DownItem;
      newestTick = d.tick;
      if (!d.horde) continue;
      if (!decoder.decode(d.horde, sink)) {
        r.decodeErrors++;
        continue;
      }
      r.framesDecoded++;
      if (d.key && d.afterSkip) {
        r.keysAfterSkip++;
        const m = truth.get(d.tick) as Map<number, { x: number; y: number }>;
        expect(phone.n).toBe(m.size);
        for (let i = 0; i < phone.n; i++) {
          const w = m.get((phone.id[i] as number) & 0xff) as { x: number; y: number };
          r.maxKeyErrCm = Math.max(r.maxKeyErrCm, Math.abs((phone.x[i] as number) - w.x) * 100, Math.abs((phone.y[i] as number) - w.y) * 100);
        }
      }
    }
    let upDelay = oneWay();
    if (stalled()) {
      upDelay += c.stallMs;
      r.stallsUp++;
    }
    upLastAt = Math.max(upLastAt, phoneAt + upDelay);
    up.push({ at: upLastAt, ack: newestTick < 0 ? -1 : newestTick & INPUT_ACK_MASK });
  }
  return r;
}

const base = { rttMs: 150, jitterMs: 20, lossPct: 1, ticks: 2400, zombies: 130 };

describe("Story 8.13: the slow-line horde skip (model of the capped line)", () => {
  it("64 kbit/s, 130 moving zombies in rushes, stalls 0.2 / 0.4 / 1 s: the longest wait in the capped queue ≤ 1,000 ms (none: it grows without bound), 0 decode errors, the phone matches the world within 1 cm after each keyframe", () => {
    const none = runLine({ ...base, kbps: 64, stallMs: 200, seed: 1, acks: false });
    expect(none.maxQueueMs).toBeGreaterThan(1500); // the control (8.10: no ack, no skip): each rush queues ~2 s
    expect(none.stats.framesSkipped).toBe(0);
    for (const [stallMs, seed] of [
      [200, 1],
      [400, 2],
      [1000, 3],
    ] as const) {
      const r = runLine({ ...base, kbps: 64, stallMs, seed });
      const label = `stall ${stallMs} ms: ${JSON.stringify({ ...r, stats: undefined, ...r.stats })}`;
      expect(r.stallsDown, label).toBeGreaterThan(5); // the line really stalled
      expect(r.stats.lineSkipped, label).toBeGreaterThan(0); // the skip really ran
      expect(r.keysAfterSkip, label).toBeGreaterThan(0);
      expect(r.maxQueueMs, label).toBeLessThanOrEqual(1000);
      expect(r.decodeErrors, label).toBe(0);
      expect(r.maxKeyErrCm, label).toBeLessThanOrEqual(1);
      expect(r.framesDecoded, label).toBeGreaterThan(r.stats.framesSent * 0.9); // the stream still flows
    }
  });

  it("128 kbit/s and a clean line, the same stalls: 0 skips (a stall is not a queue)", () => {
    for (const [kbps, stallMs, seed] of [
      [128, 200, 4],
      [128, 400, 5],
      [128, 1000, 6],
      [0, 200, 7],
      [0, 1000, 8],
    ] as const) {
      const r = runLine({ ...base, kbps, stallMs, seed });
      const label = `${kbps} kbit/s, stall ${stallMs} ms: ${JSON.stringify({ ...r, stats: undefined, ...r.stats })}`;
      expect(r.stallsDown + r.stallsUp, label).toBeGreaterThan(20); // liveness: stalls in both directions
      expect(r.stats.framesSkipped, label).toBe(0);
      expect(r.stats.framesSent, label).toBe(base.ticks);
      expect(r.decodeErrors, label).toBe(0);
    }
  });

  it("an upstream stall's burst (old acks first, the newest last, all at once) is no queue; a steady late ack is, after HORDE_LINE_CONFIRM_MS", () => {
    const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
    const enc = new HordeEncoder();
    const c = {};
    let t = 0;
    for (; t < 200; t++) {
      world.tick = t;
      enc.prepare(world, t * TICK_MS);
      if (t >= 4) enc.ack(c, t - 4, t * TICK_MS + 10); // a steady 160 ms round trip
    }
    const st = enc.stateFor(c);
    expect(st.waitMs).toBeLessThan(1);
    // 1 s upstream stall: 20 inputs land together at t·50 + 10, acking t−24 … t−4 (oldest first).
    for (let k = 0; k < 20; k++) {
      world.tick = t;
      enc.prepare(world, t * TICK_MS);
      t++;
    }
    for (let k = 20; k >= 0; k--) enc.ack(c, t - 4 - k, t * TICK_MS + 10 + (20 - k) * 0.1);
    expect(st.lineSlow).toBe(false);
    expect(st.waitMs).toBeLessThan(5);
    // A queue: every ack 400 ms older than the base, for longer than the confirm time.
    const late = Math.ceil((HORDE_LINE_SKIP_MS + 100) / TICK_MS);
    for (let k = 0; k <= late; k++, t++) {
      world.tick = t;
      enc.prepare(world, t * TICK_MS); // the queue builds: the acks stand still (only a NEW ack is a sample)
    }
    let slowAt = -1;
    for (let k = 0; k < 10; k++, t++) {
      world.tick = t;
      enc.prepare(world, t * TICK_MS);
      enc.ack(c, t - 4 - late, t * TICK_MS + 10);
      if (st.lineSlow && slowAt < 0) slowAt = k;
    }
    expect(slowAt).toBe(Math.ceil(HORDE_LINE_CONFIRM_MS / TICK_MS)); // first over at k = 0, confirmed 100 ms later
  });

  it("only horde frames are skipped (the encoder never touches the patch); no ack for HORDE_LINE_SIGNAL_STALE_MS ends the skip; a reset forgets the line", () => {
    const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
    addPlayer(world, "p0", 24, 16);
    spawnZombie(world, "walker", 25, 16);
    const enc = new HordeEncoder();
    const sent: number[] = [];
    const client = { state: ClientState.JOINED as number, ref: { bufferedAmount: 0 }, sendBytes: (_t: number, b: Uint8Array) => sent.push(b.length) };
    const stats = newHordeStats();
    let t = 0;
    const tick = (ackAge: number | null): void => {
      t++;
      world.tick = t;
      enc.prepare(world, t * TICK_MS);
      if (ackAge !== null && t - ackAge >= 0) enc.ack(client, t - ackAge, t * TICK_MS);
      enc.send(world, client, stats, 24, 16);
    };
    for (let k = 0; k < 40; k++) tick(3);
    expect(stats.framesSkipped).toBe(0);
    for (let k = 0; k < 30; k++) tick(3 + 20); // 1 s behind the base (the first 20 acks are not new: no sample)
    expect(stats.lineSkipped).toBeGreaterThan(0);
    expect(stats.lineSkipped).toBe(stats.framesSkipped);
    expect(stats.maxLineWaitMs).toBeGreaterThanOrEqual(950);
    const st = enc.stateFor(client);
    expect(st.lineSlow).toBe(true);
    expect(st.needsKey).toBe(true);
    // No acks at all (a hidden tab): the skip ends after HORDE_LINE_SIGNAL_STALE_MS, with a keyframe.
    const before = sent.length;
    let quiet = 0;
    while (st.lineSlow && quiet < 100) {
      tick(null);
      quiet++;
    }
    expect(quiet * TICK_MS).toBeGreaterThan(HORDE_LINE_SIGNAL_STALE_MS);
    expect(quiet * TICK_MS).toBeLessThanOrEqual(HORDE_LINE_SIGNAL_STALE_MS + 2 * TICK_MS);
    expect(sent.length).toBe(before + 1);
    expect(enc.lastWasKey).toBe(true);
    // Lagging again, then a reset (Story 8.1's attach): the line state is forgotten.
    for (let k = 0; k < 30; k++) tick(3 + 20);
    expect(st.lineSlow).toBe(true);
    enc.resetHordeStream(client);
    expect(st.lineSlow).toBe(false);
    expect(st.ackTick).toBe(-1);
  });
});
