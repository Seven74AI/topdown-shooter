/**
 * Story 8.10: the delta horde stream end to end — the REAL encoder (per-client state) into the REAL
 * phone decoder (`HordeStreamDecoder`, what `RunInbox` runs from the join), checked against today's
 * full frame (a keyframe of the same set) every tick. F1–F4, keyframes, fuzz, reconnect.
 */
import { describe, expect, it } from "vitest";
import { ClientState } from "@colyseus/core";
import {
  DOWNTOWN_MAP,
  HORDE_CHG_HEADING,
  HORDE_CHG_POS_FULL,
  HORDE_CHG_POS_SMALL,
  HORDE_CHG_POS_TINY,
  HORDE_HEADING_TOLERANCE,
  HORDE_KEY_INTERVAL_TICKS,
  HORDE_KIND_DELTA,
  HORDE_KIND_KEY,
  HORDE_MAX_FRAME_BYTES,
  HORDE_NEAR_M,
  HordeStreamDecoder,
  TICK_DT_S,
  ZOMBIE_STATE,
  addPlayer,
  burningOfTypeState,
  createRng,
  createWorld,
  isFarRefreshTick,
  killZombie,
  loadBalance,
  readHordeFrame,
  spawnZombie,
  step,
  type HordeSink,
  type World,
  type ZombieTypeId,
} from "@topdown/shared";
import { RunController } from "../run/RunController";
import { HordeEncoder, headingSteps, newHordeStats, type HordeStats } from "./hordeEncoder";

const balance = loadBalance();

interface Rec {
  netId: number;
  x: number;
  y: number;
  heading: number;
  typeState: number;
  refresh: number;
}

/** A Colyseus client stand-in whose phone decodes every frame as it arrives (ordered socket). */
class Phone {
  readonly ref = { bufferedAmount: 0 };
  state: number = ClientState.JOINED;
  readonly stream = new HordeStreamDecoder();
  frames: Uint8Array[] = [];
  last = new Map<number, Rec>();
  lastTick = -1;
  ok = true;
  private readonly sink: HordeSink = {
    begin: (tick) => {
      this.lastTick = tick;
      this.last = new Map();
    },
    record: (_i, netId, x, y, heading, typeState, refresh) => void this.last.set(netId, { netId, x, y, heading, typeState, refresh: refresh ?? -1 }),
    end: () => {},
  };
  sendBytes(_type: number, bytes: Uint8Array): void {
    this.frames.push(bytes.slice());
    this.ok = this.stream.decode(bytes, this.sink);
  }
  deliver(bytes: Uint8Array): boolean {
    return this.stream.decode(bytes, this.sink);
  }
}

function truthOf(enc: HordeEncoder, world: World, px: number, py: number): Map<number, Rec> {
  const out = new Map<number, Rec>();
  readHordeFrame(enc.encode(world, px, py), {
    begin: () => {},
    record: (_i, netId, x, y, heading, typeState) => void out.set(netId, { netId, x, y, heading, typeState, refresh: world.tick }),
    end: () => {},
  });
  return out;
}

const MIX: ZombieTypeId[] = ["walker", "walker", "walker", "runner", "runner", "crawler", "spitter", "bloater", "brute"];

describe("Story 8.10: the delta horde stream", () => {
  it("F1/F2/F4 round trip: 2,000 ticks of a real run (150 alive, 4 players walking, kills, slot reuse, burning, state changes): every tick equals today's full frame (refreshed ≤ 1 cm, far ones = their last refresh, ≤ 1 tick old), type/state/burning exact, heading within tolerance", () => {
    const players = [0, 1, 2, 3].map((slot) => ({ playerId: `p${slot}`, slot }));
    const ctrl = new RunController({ balance, seed: 9, players, systems: { waves: () => {} }, map: DOWNTOWN_MAP });
    const world = ctrl.world;
    world.debug.godMode = true;
    const z = world.zombies;
    const rng = createRng(810);
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    let spawned = 0;
    const topUp = (): void => {
      while (z.aliveCount < 150) {
        const a = rng.range(0, 2 * Math.PI);
        const d = rng.range(3, 22);
        const x = Math.min(world.map.widthM - 1, Math.max(1, cx + Math.cos(a) * d));
        const y = Math.min(world.map.heightM - 1, Math.max(1, cy + Math.sin(a) * d));
        if (spawnZombie(world, MIX[spawned++ % MIX.length] as ZombieTypeId, x, y) < 0) return;
      }
    };
    topUp();
    const enc = new HordeEncoder();
    const phones = [new Phone(), new Phone()];
    const viewers = ["p0", "p2"];
    const stats = phones.map(() => newHordeStats());
    const prevTruth = phones.map(() => new Map<number, Rec>());
    const seen = { near: 0, farHeld: 0, farRefreshed: 0, kills: 0, reused: 0, burning: 0, stateChanges: 0, headingSent: 0, moves: 0, deltas: 0 };
    const lastGen = new Int16Array(256).fill(-1);
    const lastTs = new Map<number, number>();
    for (let t = 0; t < 2000; t++) {
      let k = 0;
      for (const p of world.players.values()) {
        const a = (t / 160) * 2 * Math.PI + (k * Math.PI) / 2;
        const r = 4 + 3 * k++;
        p.prevX = p.x;
        p.prevY = p.y;
        p.x = cx + Math.cos(a) * r;
        p.y = cy + Math.sin(a) * r;
      }
      // kills (slot reuse after the hold) and fire
      if (rng.next() < 0.3 && z.aliveCount > 0) {
        killZombie(world, z.aliveIds[Math.floor(rng.next() * z.aliveCount)] as number, null, "pistol");
        seen.kills++;
      }
      if (rng.next() < 0.2 && z.aliveCount > 0) z.igniteTicks[z.aliveIds[Math.floor(rng.next() * z.aliveCount)] as number] = 40;
      topUp();
      ctrl.tick();
      enc.prepare(world);
      for (let c = 0; c < phones.length; c++) {
        const phone = phones[c] as Phone;
        const me = world.players.get(viewers[c] as string);
        if (!me) throw new Error("viewer");
        enc.send(world, phone, stats[c] as HordeStats, me.x, me.y);
        expect(phone.ok).toBe(true);
        const f = phone.frames.at(-1) as Uint8Array;
        if (f[4] === HORDE_KIND_DELTA) seen.deltas++;
        const truth = truthOf(enc, world, me.x, me.y);
        expect(f.length).toBeLessThanOrEqual(7 + 8 * truth.size); // a delta is never bigger than its keyframe (the throttle's pool, T6)
        expect([...phone.last.keys()].sort()).toEqual([...truth.keys()].sort()); // F1: every zombie in view (+ rushers) is there
        for (const [id, want] of truth) {
          const got = phone.last.get(id) as Rec;
          const slot = id & 0xff;
          if ((id >> 8) !== lastGen[slot]) {
            if ((lastGen[slot] as number) >= 0) seen.reused++;
            lastGen[slot] = id >> 8;
          }
          if (burningOfTypeState(want.typeState)) seen.burning++;
          if (got.refresh === world.tick) {
            expect(Math.abs(got.x - want.x)).toBeLessThanOrEqual(0.01);
            expect(Math.abs(got.y - want.y)).toBeLessThanOrEqual(0.01);
            expect(got.typeState).toBe(want.typeState);
            expect(headingSteps(got.heading, want.heading)).toBeLessThanOrEqual(HORDE_HEADING_TOLERANCE);
            const d = Math.hypot(want.x - me.x, want.y - me.y);
            if (d > HORDE_NEAR_M + 0.05) seen.farRefreshed++;
            else seen.near++;
            if (lastTs.has(id) && lastTs.get(id) !== want.typeState) seen.stateChanges++;
            lastTs.set(id, want.typeState);
          } else {
            // A far zombie between its refreshes: exactly its pose one tick ago, never older.
            expect(world.tick - got.refresh).toBe(1);
            const before = (prevTruth[c] as Map<number, Rec>).get(id) as Rec;
            expect(before).toBeDefined();
            expect(Math.abs(got.x - before.x)).toBeLessThanOrEqual(0.01);
            expect(Math.abs(got.y - before.y)).toBeLessThanOrEqual(0.01);
            expect(Math.hypot(before.x - me.x, before.y - me.y)).toBeGreaterThan(HORDE_NEAR_M - 1); // never a near one (1 m: the viewer moved)
            seen.farHeld++;
          }
        }
        prevTruth[c] = truth;
      }
    }
    for (const p of phones) {
      for (const f of p.frames) {
        if (f[4] !== HORDE_KIND_DELTA) continue;
        let o = 9 + 8 * (f[6] as number);
        for (let i = 0; i < (f[7] as number); i++) {
          const m = f[o + 1] as number;
          if ((m & HORDE_CHG_HEADING) !== 0) seen.headingSent++;
          if ((m & (HORDE_CHG_POS_TINY | HORDE_CHG_POS_SMALL | HORDE_CHG_POS_FULL)) !== 0) seen.moves++;
          o += 2 + ((m & HORDE_CHG_POS_TINY) !== 0 ? 1 : 0) + ((m & HORDE_CHG_POS_SMALL) !== 0 ? 2 : 0) + ((m & HORDE_CHG_POS_FULL) !== 0 ? 4 : 0) + ((m & HORDE_CHG_HEADING) !== 0 ? 1 : 0) + ((m & 0x08) !== 0 ? 1 : 0);
        }
      }
      expect(p.stream.decodeErrors + p.stream.brokenChain).toBe(0);
    }
    console.log(`[8.10 round trip] ${JSON.stringify(seen)} · KB/s ${stats.map((s) => (s.bytesSent / 1024 / 100).toFixed(1)).join(" / ")} · keyframes ${stats.map((s) => s.keyframes).join(" / ")}`);
    // liveness: every path really ran
    expect(seen.near).toBeGreaterThan(10_000);
    expect(seen.farHeld).toBeGreaterThan(10_000);
    expect(seen.farRefreshed).toBeGreaterThan(10_000);
    expect(seen.kills).toBeGreaterThan(400);
    expect(seen.reused).toBeGreaterThan(100);
    expect(seen.burning).toBeGreaterThan(1000);
    expect(seen.stateChanges).toBeGreaterThan(50);
    expect(seen.headingSent).toBeGreaterThan(0);
    expect(seen.headingSent).toBeLessThan(seen.moves / 2); // the phone works facing out (D3)
    for (const s of stats) expect(s.keyframes).toBeGreaterThanOrEqual(100); // ≥ 1/s over 100 s
    for (const s of stats) expect(s.bytesSent / 1024 / 100).toBeLessThan(10);
  }, 120_000);

  function line(): { world: World; enc: HordeEncoder; phone: Phone; stats: HordeStats; tick: () => void } {
    const world = createWorld({ balance, seed: 3, systems: { waves: () => {} } });
    addPlayer(world, "p0", 24, 16);
    world.debug.godMode = true;
    const enc = new HordeEncoder();
    const phone = new Phone();
    const stats = newHordeStats();
    const tick = (): void => {
      step(world, TICK_DT_S);
      enc.prepare(world);
      enc.send(world, phone, stats, 24, 16);
    };
    return { world, enc, phone, stats, tick };
  }

  it("F1 the 8 m rule: a zombie 7.9 m from the view centre is refreshed every tick, one at 8.1 m every 2nd tick (by slot parity); a rusher far off is in every frame", () => {
    const { world, phone, tick } = line();
    const z = world.zombies;
    const near = spawnZombie(world, "walker", 24 + 7.9, 16);
    const far = spawnZombie(world, "walker", 24 - 8.1, 16);
    const rusher = spawnZombie(world, "runner", 2, 2); // far outside the view
    const refreshedNear: number[] = [];
    const refreshedFar: number[] = [];
    for (let t = 0; t < 40; t++) {
      // they walk on the spot: a move every tick, so every refresh carries one
      z.x[near] = 24 + 7.9 + (t % 2) * 0.03;
      z.x[far] = 24 - 8.1 - (t % 2) * 0.03;
      z.state[rusher] = ZOMBIE_STATE.RUSH;
      z.x[rusher] = 2;
      z.y[rusher] = 2;
      tick();
      z.x[near] = 24 + 7.9 + (t % 2) * 0.03;
      z.x[far] = 24 - 8.1 - (t % 2) * 0.03;
      const n = [...phone.last.values()];
      const rn = n.find((r) => (r.netId & 0xff) === near) as Rec;
      const rf = n.find((r) => (r.netId & 0xff) === far) as Rec;
      expect(n.some((r) => (r.netId & 0xff) === rusher)).toBe(true); // F3
      if (rn.refresh === world.tick) refreshedNear.push(world.tick);
      if (rf.refresh === world.tick) refreshedFar.push(world.tick);
    }
    expect(refreshedNear).toHaveLength(40);
    // every 2nd tick, plus a keyframe (it refreshes all and starts everyone near) and the tick after it (far again)
    const keyTicks = phone.frames.filter((f) => f[4] === HORDE_KIND_KEY).map((f) => (f[0] as number) | ((f[1] as number) << 8));
    const offParity = refreshedFar.filter((t) => !isFarRefreshTick(far, t));
    for (const t of offParity) expect(keyTicks.includes(t) || keyTicks.includes(t - 1)).toBe(true);
    expect(refreshedFar.filter((t) => isFarRefreshTick(far, t))).toHaveLength(20);
    expect(offParity.length).toBeLessThanOrEqual(2 * keyTicks.length);
  });

  it("F1 a Runner sprinting in from 8.1 m is refreshed every tick from its first tick inside 8 m", () => {
    const { world, phone, tick } = line();
    const z = world.zombies;
    const id = spawnZombie(world, "runner", 24 + 9, 16);
    let insideSince = -1;
    for (let t = 0; t < 30; t++) {
      z.x[id] = 24 + 9 - t * 0.2; // 4 m/s at you
      z.y[id] = 16;
      tick();
      const d = Math.hypot((z.x[id] as number) - 24, (z.y[id] as number) - 16);
      const r = [...phone.last.values()].find((q) => (q.netId & 0xff) === id) as Rec;
      if (d <= HORDE_NEAR_M && insideSince < 0) insideSince = world.tick;
      if (insideSince >= 0) {
        expect(r.refresh).toBe(world.tick);
        expect(Math.abs(r.x - (z.x[id] as number))).toBeLessThanOrEqual(0.005 + 1e-6);
        expect(Math.abs(r.y - (z.y[id] as number))).toBeLessThanOrEqual(0.005 + 1e-6);
      }
    }
    expect(insideSince).toBeGreaterThan(0);
  });

  it("F4 a standing zombie that turns (a Spitter aiming) turns on the phone: its heading byte is sent only then", () => {
    const { world, phone, enc, stats } = line();
    const z = world.zombies;
    const id = spawnZombie(world, "spitter", 27, 16);
    const headings: number[] = [];
    for (let t = 0; t < 30; t++) {
      world.tick++;
      z.prevX[id] = z.x[id] as number;
      z.prevY[id] = z.y[id] as number;
      if (t === 10) {
        // a tiny aim move: the server's heading turns to +y while the zombie stays on its cm
        z.prevY[id] = (z.y[id] as number) - 0.001;
      }
      enc.prepare(world);
      enc.send(world, phone, stats, 24, 16);
      headings.push((phone.last.get([...phone.last.keys()][0] as number) as Rec).heading);
    }
    expect(headings[9]).toBe(0);
    expect(headings[10]).toBe(64); // turned on the phone the same tick
    expect(headings.at(-1)).toBe(64); // and keeps it
    const withHeading = phone.frames.filter((f) => f[4] === HORDE_KIND_DELTA && f.length > 9 && ((f[9 + 1] as number) & HORDE_CHG_HEADING) !== 0);
    expect(withHeading).toHaveLength(1);
  });

  it("keyframes: the first frame, after a skipped frame (backpressure), every 20 ticks, staggered between clients; a reconnect (a new client object) starts with a keyframe", () => {
    const world = createWorld({ balance, seed: 3, systems: { waves: () => {} } });
    addPlayer(world, "p0", 24, 16);
    world.debug.godMode = true;
    for (let i = 0; i < 30; i++) spawnZombie(world, "walker", 20 + (i % 10), 14 + Math.floor(i / 10));
    const enc = new HordeEncoder();
    const a = new Phone();
    const b = new Phone();
    const sa = newHordeStats();
    const sb = newHordeStats();
    const keysA: number[] = [];
    const keysB: number[] = [];
    let a2: Phone | null = null;
    for (let t = 0; t < 100; t++) {
      step(world, TICK_DT_S);
      enc.prepare(world);
      a.ref.bufferedAmount = t === 50 ? 70_000 : 0;
      enc.send(world, a, sa, 24, 16);
      enc.send(world, b, sb, 24, 16);
      if (t === 50) expect(a.frames.length).toBe(50); // skipped
      if (a.frames.length > 0 && (a.frames.at(-1) as Uint8Array)[4] === HORDE_KIND_KEY && a.lastTick === world.tick) keysA.push(t);
      if ((b.frames.at(-1) as Uint8Array)[4] === HORDE_KIND_KEY) keysB.push(t);
      expect(a.ok && b.ok).toBe(true);
      if (t === 80) a2 = new Phone(); // Story 8.1: the reconnected client is a new object; its first frame must be a key
      if (a2) {
        enc.send(world, a2, newHordeStats(), 24, 16);
        if (t === 80) expect((a2.frames[0] as Uint8Array)[4]).toBe(HORDE_KIND_KEY);
        expect(a2.ok).toBe(true);
      }
    }
    expect(keysA[0]).toBe(0);
    expect(keysA).toContain(51); // the frame after the skip
    for (let i = 1; i < keysB.length; i++) expect((keysB[i] as number) - (keysB[i - 1] as number)).toBeLessThanOrEqual(HORDE_KEY_INTERVAL_TICKS);
    expect(keysB.length).toBeGreaterThanOrEqual(5);
    expect(keysB.slice(1, 3)).not.toEqual(keysA.slice(1, 3)); // staggered: not on the same ticks
    expect(sa.keyframes).toBe(keysA.length);
    expect(sa.framesSkipped).toBe(1);
  });

  it("forceKey (Story 8.1 hook): the next frame to that client is a keyframe", () => {
    const { enc, phone, tick } = line();
    tick();
    tick();
    expect((phone.frames[1] as Uint8Array)[4]).toBe(HORDE_KIND_KEY); // an empty delta is never smaller
    enc.forceKey(phone);
    tick();
    expect((phone.frames[2] as Uint8Array)[4]).toBe(HORDE_KIND_KEY);
  });

  it("brief 19 fuzz: random bytes, truncated frames, bit flips and a dropped frame never throw, are counted, never apply, and the next keyframe heals within 1 s", () => {
    const { world, phone, tick } = line();
    const rng = createRng(19);
    for (let i = 0; i < 60; i++) spawnZombie(world, "walker", 16 + rng.range(0, 16), 10 + rng.range(0, 12));
    for (let t = 0; t < 40; t++) tick();
    const good = phone.frames.slice(-20);
    const fresh = new HordeStreamDecoder();
    const sink: HordeSink = { begin: () => {}, record: () => {}, end: () => {} };
    let refused = 0;
    let applied = 0;
    for (let k = 0; k < 20_000; k++) {
      const kind = k % 4;
      let bytes: Uint8Array;
      const g = good[k % good.length] as Uint8Array;
      if (kind === 0) bytes = Uint8Array.from({ length: Math.floor(rng.range(0, 64)) }, () => Math.floor(rng.range(0, 256)));
      else if (kind === 1) bytes = g.slice(0, Math.floor(rng.range(0, g.length)));
      else if (kind === 2) {
        bytes = g.slice();
        const at = Math.floor(rng.range(0, bytes.length));
        bytes[at] = (bytes[at] as number) ^ (1 << Math.floor(rng.range(0, 8)));
      } else bytes = g.slice();
      expect(() => (fresh.decode(bytes, sink) ? applied++ : refused++)).not.toThrow();
    }
    expect(refused).toBeGreaterThan(10_000);
    expect(fresh.decodeErrors + fresh.brokenChain).toBe(refused);
    // A dropped frame mid-stream (a bug, not the socket): every delta after it is refused until the next key.
    const p = new Phone();
    const enc2 = new HordeEncoder();
    const stats = newHordeStats();
    let dropped = -1;
    let healedAt = -1;
    for (let t = 0; t < 60; t++) {
      step(world, TICK_DT_S);
      enc2.prepare(world);
      const before = p.frames.length;
      p.sendBytes = function (this: Phone, _type: number, bytes: Uint8Array): void {
        this.frames.push(bytes.slice());
      };
      enc2.send(world, p, stats, 24, 16);
      const f = p.frames[before] as Uint8Array;
      if (t === 25) {
        dropped = t;
        continue; // never reaches the phone
      }
      const ok = p.deliver(f);
      if (dropped >= 0 && healedAt < 0) {
        if (ok) healedAt = t;
        else expect(f[4]).toBe(HORDE_KIND_DELTA);
      }
    }
    expect(p.stream.brokenChain).toBeGreaterThan(0);
    expect(healedAt).toBeGreaterThan(dropped);
    expect(healedAt - dropped).toBeLessThanOrEqual(HORDE_KEY_INTERVAL_TICKS);
  });

  it("brief 7: the frame never exceeds the throttle's pooled buffer (a keyframe of 256)", () => {
    expect(HORDE_MAX_FRAME_BYTES).toBe(7 + 8 * 256);
  });
});
