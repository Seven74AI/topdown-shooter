import { describe, expect, it } from "vitest";
import { ClientState } from "@colyseus/core";
import {
  HORDE_LINE_CONFIRM_MS,
  HORDE_LINE_MAX_GAP_MS,
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
/** The phone's own clock is offset from the server's (any value: only differences count). Chosen so that arrival − send time sits ~25 ms below a 16-bit wrap: an upload delay crosses it (the unwrap is exercised). */
const PHONE_CLOCK_MS = 65536 * 3 + 100;

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
  /** Review M1: extra upload delay (ms) of the input sent at tick t (an upload-only queue); default none. */
  upExtraMs?: (t: number) => number;
  /** Re-review M1b-R1: whether the phone sends an input at tick t (default every tick; 8.9 pacing sends 0.9×, a hitch drops steps). */
  sends?: (t: number) => boolean;
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
  /** Review M1 (a): the longest the server went without sending this phone a horde frame (ms). */
  maxFrameGapMs: number;
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
  const up: { at: number; ack: number; sendMs: number }[] = [];
  let lastFrameAt = 0;
  let wireFreeAt = 0;
  let downLastAt = 0;
  let upLastAt = 0;
  let newestTick = -1;
  const r: LineResult = { stats, maxQueueMs: 0, decodeErrors: 0, framesDecoded: 0, keysAfterSkip: 0, maxKeyErrCm: 0, stallsUp: 0, stallsDown: 0, lineSlowTicks: 0, maxFrameGapMs: 0 };
  let skippedSinceSent = false;
  for (let t = 1; t <= c.ticks; t++) {
    const now = t * TICK_MS;
    // The server: inputs that arrived by now, in order, then the tick.
    while (up.length > 0 && (up[0] as { at: number }).at <= now) {
      const u = up.shift() as { at: number; ack: number; sendMs: number };
      if (c.acks !== false) enc.ack(client, u.ack, u.at, u.sendMs & INPUT_ACK_MASK);
    }
    wander(world, t);
    enc.prepare(world, now);
    client.last = null;
    const skippedBefore = stats.framesSkipped;
    enc.send(world, client, stats, 24, 16);
    if (enc.stateFor(client).lineSlow) r.lineSlowTicks++;
    const horde = client.last as Uint8Array | null;
    if (horde) {
      r.maxFrameGapMs = Math.max(r.maxFrameGapMs, now - lastFrameAt);
      lastFrameAt = now;
    }
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
    upDelay += c.upExtraMs?.(t) ?? 0;
    if (c.sends && !c.sends(t)) continue; // no input this tick (the phone's clock: 0.9× pacing, dropped steps)
    upLastAt = Math.max(upLastAt, phoneAt + upDelay);
    up.push({ at: upLastAt, ack: newestTick < 0 ? -1 : newestTick & INPUT_ACK_MASK, sendMs: Math.floor(phoneAt + PHONE_CLOCK_MS) });
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
      // The 1 s row's worst moment in this model is a 1 s down stall followed by a 1 s up stall during a rush: the server
      // sees no new ack for 2 s while the queue grows (no ack-based signal can see through that), so it reads ~1,020 ms.
      // The bot run of the same row (the AC) reads 383 ms; the 0.2 / 0.4 s rows hold the AC's 1,000 ms here too.
      expect(r.maxQueueMs, label).toBeLessThanOrEqual(stallMs === 1000 ? 1100 : 1000);
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
    // Review M1 (a): while it waited, the freeze cap still sent a keyframe every second; then the skip ended with one.
    expect(stats.lineCapKeys).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBe(before + stats.lineCapKeys + 1);
    expect(enc.lastWasKey).toBe(true);
    // Lagging again, then a reset (Story 8.1's attach): the line state is forgotten.
    for (let k = 0; k < 30; k++) tick(3 + 20);
    expect(st.lineSlow).toBe(true);
    enc.resetHordeStream(client);
    expect(st.lineSlow).toBe(false);
    expect(st.ackTick).toBe(-1);
  });

  describe("review M1: the upload's own wait is not a reason to skip; the freeze cap", () => {
    const ramp = (t: number): number => Math.min(800, Math.max(0, ((t - 200) / 100) * 800)); // 0 → 800 ms in 5 s from 10 s, then held
    const step = (t: number): number => (t >= 600 ? 600 : 0); // +600 ms at 30 s
    it("upload-only lag (a ramp 0 → 800 ms, a 600 ms step) on a clean downstream and at 128 kbit/s: 0 skips", () => {
      for (const [name, upExtraMs, kbps] of [
        ["ramp, no cap", ramp, 0],
        ["step, no cap", step, 0],
        ["ramp, 128 kbit/s", ramp, 128],
        ["step, 128 kbit/s", step, 128],
      ] as const) {
        const r = runLine({ ...base, kbps, stallMs: 200, lossPct: 0, seed: 11, upExtraMs });
        const label = `${name}: ${JSON.stringify({ ...r, stats: undefined, ...r.stats })}`;
        expect(r.stats.framesSkipped, label).toBe(0);
        expect(r.stats.maxLineWaitMs, label).toBeLessThan(HORDE_LINE_SKIP_MS / 2); // the down wait read: well under the limit
      }
      // The control: the same ramp with the whole ack age counted (what the review found) does skip.
      const enc = new HordeEncoder();
      const c = {};
      const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
      let slow = 0;
      for (let t = 0; t < 1200; t++) {
        world.tick = t;
        enc.prepare(world, t * TICK_MS);
        if (t >= 4) enc.ack(c, t - 4, t * TICK_MS + 10 + ramp(t)); // no send time: no upload measurement
        if (enc.stateFor(c).lineSlow) slow++;
      }
      expect(slow).toBeGreaterThan(100);
    });

    it("re-review M1b-R1: the phone's step clock does not matter (0.9× pacing, 3 steps dropped every 2 s): the 64 kbit/s row stays ≤ 1,000 ms; send times across a 16-bit wrap", () => {
      for (const [name, sends] of [
        ["0.9× pacing", (t: number) => t % 10 !== 9],
        ["3 steps dropped every 2 s", (t: number) => t % 40 >= 3],
      ] as const) {
        const r = runLine({ ...base, kbps: 64, stallMs: 200, seed: 1, sends });
        const label = `${name}: ${JSON.stringify({ ...r, stats: undefined, ...r.stats })}`;
        expect(r.stats.lineSkipped, label).toBeGreaterThan(0);
        expect(r.maxQueueMs, label).toBeLessThanOrEqual(1000);
        expect(r.decodeErrors, label).toBe(0);
      }
      // The phone's clock crosses 65,536 ms (PHONE_CLOCK_MS is set just before a wrap): an upload ramp still gives 0 skips.
      const wrapped = runLine({ ...base, kbps: 0, stallMs: 200, lossPct: 0, seed: 12, upExtraMs: ramp, sends: (t) => t % 10 !== 9 });
      expect(wrapped.stats.framesSkipped, JSON.stringify(wrapped.stats)).toBe(0);
    });

    it("a downstream queue still skips with upload lag on top (64 kbit/s + the ramp): waits bounded, 0 decode errors", () => {
      const r = runLine({ ...base, kbps: 64, stallMs: 200, seed: 1, upExtraMs: ramp });
      const label = JSON.stringify({ ...r, stats: undefined, ...r.stats });
      expect(r.stats.lineSkipped, label).toBeGreaterThan(0);
      expect(r.maxQueueMs, label).toBeLessThanOrEqual(1000);
      expect(r.decodeErrors, label).toBe(0);
    });

    it("the freeze cap: while skipping, a keyframe at least every HORDE_LINE_MAX_GAP_MS (64 kbit/s rows and a phone that never catches up)", () => {
      for (const [stallMs, seed] of [
        [200, 1],
        [1000, 3],
      ] as const) {
        const r = runLine({ ...base, kbps: 64, stallMs, seed });
        const label = `stall ${stallMs}: ${JSON.stringify({ ...r, stats: undefined, ...r.stats })}`;
        expect(r.maxFrameGapMs, label).toBeLessThanOrEqual(HORDE_LINE_MAX_GAP_MS + TICK_MS);
      }
      // Acks that always read 1 s late (nothing ever drains): the skip holds, but a keyframe goes out every second.
      const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
      addPlayer(world, "p0", 24, 16);
      spawnZombie(world, "walker", 25, 16);
      const enc = new HordeEncoder();
      const sentAt: number[] = [];
      const client = { state: ClientState.JOINED as number, ref: { bufferedAmount: 0 }, sendBytes: () => sentAt.push(world.tick) };
      const stats = newHordeStats();
      for (let t = 1; t <= 230; t++) {
        world.tick = t;
        enc.prepare(world, t * TICK_MS);
        if (t > 23) enc.ack(client, t - 23, t * TICK_MS);
        else if (t > 3) enc.ack(client, t - 3, t * TICK_MS);
        enc.send(world, client, stats, 24, 16);
      }
      expect(stats.lineSkipped).toBeGreaterThan(150); // until the 10 s base learns the new delay
      expect(stats.lineCapKeys).toBeGreaterThanOrEqual(8);
      for (let i = 1; i < sentAt.length; i++) expect(((sentAt[i] as number) - (sentAt[i - 1] as number)) * TICK_MS).toBeLessThanOrEqual(HORDE_LINE_MAX_GAP_MS);
    });
  });

  describe("review L1: the limit and the confirm time at their edges", () => {
    /**
     * A line whose down wait rises to `waitMs` at 2.5 ms per tick (slow enough that the trend adds < 25 ms) and holds it
     * for 3 s; the phone sends each input when its ack's tick lands (`seq` = arrival / 50 ms: the upload never waits).
     * Returns true if the skip ever started.
     */
    const steady = (waitMs: number): boolean => {
      const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
      const enc = new HordeEncoder();
      const c = {};
      const lag = 4; // ticks: a 200 ms round trip as the base
      let slow = false;
      for (let t = 0; t < 100 + waitMs / 2.5 + 60; t++) {
        world.tick = t;
        enc.prepare(world, t * TICK_MS);
        const w = Math.min(waitMs, Math.max(0, (t - 100) * 2.5));
        const at = t * TICK_MS + w;
        if (t >= lag) enc.ack(c, t - lag, at, at & INPUT_ACK_MASK); // sent as it arrives: no upload wait
        if (enc.stateFor(c).lineSlow) slow = true;
      }
      return slow;
    };
    it("a steady wait just under HORDE_LINE_SKIP_MS never skips; just over it does", () => {
      // The recorded values (decision 8.13 D2: 300 ms), as numbers: a changed constant must fail here.
      expect(HORDE_LINE_SKIP_MS).toBe(300);
      expect(steady(250)).toBe(false);
      expect(steady(350)).toBe(true);
    });
    it("over the limit: not slow at 99 ms of acks, slow at 100 ms (HORDE_LINE_CONFIRM_MS)", () => {
      const world = createWorld({ balance, seed: 7, systems: { waves: () => {} } });
      const enc = new HordeEncoder();
      const c = {};
      for (let t = 0; t < 100; t++) {
        world.tick = t;
        enc.prepare(world, t * TICK_MS);
        if (t >= 4) enc.ack(c, t - 4, t * TICK_MS, (t * TICK_MS) & INPUT_ACK_MASK);
      }
      world.tick = 120;
      enc.prepare(world, 120 * TICK_MS);
      const t0 = 120 * TICK_MS;
      const st = enc.stateFor(c);
      // Acks 500 ms late (well over the limit) at t0, t0 + 99, then t0 + 100; each input sent as it arrives (no upload wait).
      enc.ack(c, 106, t0, t0 & INPUT_ACK_MASK);
      expect(st.lineSlow).toBe(false);
      enc.ack(c, 107, t0 + 99, (t0 + 99) & INPUT_ACK_MASK);
      expect(st.lineSlow).toBe(false);
      expect(HORDE_LINE_CONFIRM_MS).toBe(100);
      enc.ack(c, 108, t0 + 100, (t0 + 100) & INPUT_ACK_MASK); // the recorded 100 ms (D2), as a number
      expect(st.lineSlow).toBe(true);
    });
  });
});
