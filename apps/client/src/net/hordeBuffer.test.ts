import { describe, expect, it } from "vitest";
import {
  HORDE_MAX_FRAME_BYTES,
  HORDE_MISSING_LIMIT,
  ZOMBIE_STATE,
  TICK_DT_S,
  createWorld,
  zombieTypeIndex,
  hordeFrameBytes,
  loadBalance,
  packTypeState,
  writeHordeHeader,
  writeHordeRecord,
  zombieNetId,
} from "@topdown/shared";
import { HORDE_RING_SIZE, HordeBuffer, HordeSample } from "./hordeBuffer";
import { HordeDecoder } from "./hordeDecoder";
import { mirrorZombies } from "./mirrorZombies";

interface Z {
  netId: number;
  x: number;
  y: number;
  heading?: number;
  state?: number;
  /** `ZOMBIE_TYPES` index (default 0, Walker). */
  type?: number;
}

const scratch = new Uint8Array(HORDE_MAX_FRAME_BYTES);
const view = new DataView(scratch.buffer);

/** A frame as the server writes it (shared format writers). */
function frame(tick: number, zs: Z[]): Uint8Array {
  writeHordeHeader(view, tick, zs.length);
  zs.forEach((z, i) => writeHordeRecord(view, i, z.netId, z.x, z.y, z.heading ?? 0, packTypeState(z.type ?? 0, z.state ?? ZOMBIE_STATE.CHASE)));
  return scratch.slice(0, hordeFrameBytes(zs.length));
}

function setup() {
  const buffer = new HordeBuffer();
  const decoder = new HordeDecoder(buffer);
  const out = new HordeSample();
  const push = (tick: number, zs: Z[]): boolean => decoder.receive(frame(tick, zs));
  const sample = (renderTick: number): Map<number, { x: number; y: number; heading: number }> => {
    buffer.sample(renderTick, out);
    const m = new Map<number, { x: number; y: number; heading: number }>();
    for (let i = 0; i < out.count; i++) m.set(out.netId[i] as number, { x: out.x[i] as number, y: out.y[i] as number, heading: out.heading[i] as number });
    return m;
  };
  return { buffer, decoder, push, sample, out };
}

const A = zombieNetId(3, 0);
const B = zombieNetId(4, 0);

describe("HordeBuffer", () => {
  it("Story 3.8: a Runner at 4 m/s drawn at 60 Hz moves in even steps (no stutter) and keeps its type", () => {
    const { push, sample, out } = setup();
    const R = zombieNetId(7, 1);
    const runner = zombieTypeIndex("runner");
    const step = 4.0 * TICK_DT_S; // 0.2 m per server tick
    let pushed = -1;
    const arrive = (upTo: number) => {
      // Frames arrive a little ahead of the render tick (the ring keeps the last HORDE_RING_SIZE).
      while (pushed < upTo) {
        pushed++;
        push(100 + pushed, [{ netId: R, x: 5 + pushed * step, y: 10, type: runner }]);
      }
    };
    arrive(3);
    let prev = sample(100).get(R)?.x ?? 0;
    const frames = 3 * 40; // 60 Hz render ticks across 40 server ticks (2 s)
    for (let f = 1; f <= frames; f++) {
      arrive(Math.ceil(f / 3) + 3);
      const x = sample(100 + f / 3).get(R)?.x ?? 0;
      expect(x - prev).toBeCloseTo(step / 3, 3); // 0.0667 m per frame, within 1 mm
      prev = x;
    }
    expect((out.typeState[0] as number) & 0x0f).toBe(runner);
  });

  it("lerps a zombie at t = 0.5; heading from A before the half, from B after", () => {
    const { push, sample } = setup();
    push(10, [{ netId: A, x: 1, y: 2, heading: 10 }]);
    push(11, [{ netId: A, x: 2, y: 4, heading: 20 }]);
    const mid = sample(10.5).get(A);
    expect(mid?.x).toBeCloseTo(1.5, 5);
    expect(mid?.y).toBeCloseTo(3, 5);
    expect(mid?.heading).toBe(20);
    expect(sample(10.25).get(A)?.heading).toBe(10);
  });

  it("holds the newest frame past it (no extrapolation) and shows the oldest before it", () => {
    const { push, sample } = setup();
    push(10, [{ netId: A, x: 1, y: 1 }]);
    push(11, [{ netId: A, x: 2, y: 1 }]);
    expect(sample(14).get(A)?.x).toBeCloseTo(2, 5);
    expect(sample(3).get(A)?.x).toBeCloseTo(1, 5);
  });

  it("holds a zombie missing for 1–2 frames, and drops it at 3", () => {
    const { push, sample } = setup();
    push(1, [{ netId: A, x: 1, y: 1 }, { netId: B, x: 5, y: 5 }]);
    push(2, [{ netId: A, x: 2, y: 1 }, { netId: B, x: 6, y: 5 }]);
    expect(sample(2).get(B)?.x).toBeCloseTo(6, 5);
    push(3, [{ netId: A, x: 3, y: 1 }]);
    expect(sample(3).get(B)?.x).toBeCloseTo(6, 5); // held at its last sampled position
    push(4, [{ netId: A, x: 4, y: 1 }]);
    expect(sample(4).get(B)?.x).toBeCloseTo(6, 5);
    expect(HORDE_MISSING_LIMIT).toBe(3);
    push(5, [{ netId: A, x: 5, y: 1 }]);
    const s = sample(5);
    expect(s.has(B)).toBe(false);
    expect(s.get(A)?.x).toBeCloseTo(5, 5);
  });

  it("a zombie back within 2 frames keeps showing (no flicker at the margin)", () => {
    const { push, sample } = setup();
    push(1, [{ netId: B, x: 5, y: 5 }]);
    sample(1);
    push(2, []);
    push(3, []);
    push(4, [{ netId: B, x: 7, y: 5 }]);
    for (const t of [1.5, 2, 2.5, 3, 3.5, 4]) expect(sample(t).has(B)).toBe(true);
  });

  it("markDead hides it at once, and a later frame with the same net id stays hidden", () => {
    const { buffer, push, sample } = setup();
    push(1, [{ netId: A, x: 1, y: 1 }, { netId: B, x: 2, y: 2 }]);
    push(2, [{ netId: A, x: 1, y: 1 }, { netId: B, x: 2, y: 2 }]);
    buffer.markDead(A);
    expect(sample(1.5).has(A)).toBe(false);
    push(3, [{ netId: A, x: 1, y: 1 }, { netId: B, x: 2, y: 2 }]); // sent before the server freed the slot
    expect(sample(3).has(A)).toBe(false);
    expect(sample(3).has(B)).toBe(true);
  });

  it("killAt hides the net id only once the render tick reaches the kill", () => {
    const { buffer, push, sample } = setup();
    push(1, [{ netId: A, x: 1, y: 1 }]);
    push(2, [{ netId: A, x: 1, y: 1 }]);
    push(3, []);
    buffer.killAt(3, A);
    expect(sample(2).has(A)).toBe(true);
    expect(sample(2.9).has(A)).toBe(true); // held while the kill is ahead of the render tick
    expect(sample(3).has(A)).toBe(false);
  });

  it("a killed zombie stays drawn until its kill tick even when 3+ empty frames already arrived (review)", () => {
    const { buffer, push, sample } = setup();
    for (let t = 1; t <= 5; t++) push(t, [{ netId: A, x: 2, y: 2 }]);
    buffer.killAt(6, A); // killed on tick 6: the server stops sending it from frame 6
    for (let t = 6; t <= 9; t++) push(t, []);
    const visible = [4, 4.5, 5, 5.5, 5.99, 6, 7, 10].map((rt) => sample(rt).has(A));
    expect(visible).toEqual([true, true, true, true, true, false, false, false]);
  });

  it("a reused slot (new generation) is never interpolated from the dead zombie", () => {
    const { buffer, push, sample } = setup();
    const old = zombieNetId(7, 4);
    const next = zombieNetId(7, 5);
    push(100, [{ netId: old, x: 10, y: 10 }]);
    buffer.killAt(101, old);
    push(101, []);
    for (let t = 102; t <= 120; t++) push(t, []); // the server holds the slot 20 ticks
    push(121, [{ netId: next, x: 40, y: 30 }]); // reused far away
    push(122, [{ netId: next, x: 40.1, y: 30 }]);
    sample(101);
    const s = sample(120.5); // between the empty frame and the first one with the new zombie
    expect(s.has(old)).toBe(false);
    expect(s.get(next)?.x).toBeCloseTo(40, 5); // at its own position, no lerp from (10, 10)
    expect(s.get(next)?.y).toBeCloseTo(30, 5);
    expect(sample(121.5).get(next)?.x).toBeCloseTo(40.05, 5);
  });

  it("a new generation in consecutive frames shows at B's position, not lerped", () => {
    const { push, sample } = setup();
    push(1, [{ netId: zombieNetId(7, 1), x: 10, y: 10 }]);
    push(2, [{ netId: zombieNetId(7, 2), x: 30, y: 20 }]);
    const s = sample(1.5);
    expect(s.get(zombieNetId(7, 2))?.x).toBeCloseTo(30, 5);
    expect(s.has(zombieNetId(7, 1))).toBe(false);
  });

  it("ignores out-of-order and duplicate frames, counts bad lengths", () => {
    const { decoder, buffer, push } = setup();
    expect(push(5, [{ netId: A, x: 1, y: 1 }])).toBe(true);
    expect(push(5, [{ netId: A, x: 9, y: 9 }])).toBe(false);
    expect(push(4, [{ netId: A, x: 9, y: 9 }])).toBe(false);
    expect(decoder.staleFrames).toBe(2);
    expect(decoder.receive(frame(6, [{ netId: A, x: 1, y: 1 }]).subarray(0, 10))).toBe(false);
    expect(decoder.receive("nope")).toBe(false);
    expect(decoder.decodeErrors).toBe(2);
    expect(decoder.framesReceived).toBe(1);
    expect(buffer.latestTick).toBe(5);
    expect(buffer.size).toBe(1);
  });

  it("keeps the last HORDE_RING_SIZE frames", () => {
    const { buffer, push, sample } = setup();
    for (let t = 1; t <= 20; t++) push(t, [{ netId: A, x: t, y: 0 }]);
    expect(buffer.size).toBe(HORDE_RING_SIZE);
    expect(sample(1).get(A)?.x).toBeCloseTo(20 - HORDE_RING_SIZE + 1, 5); // before the oldest held
  });

  it("mirrorZombies writes the sample into the pool and frees slots not shown", () => {
    const { push, sample, out } = setup();
    const world = createWorld({ balance: loadBalance(), seed: 0, systems: { waves: () => {} } });
    const z = world.zombies;
    push(1, [{ netId: zombieNetId(3, 9), x: 1.5, y: 2.5, heading: 64, state: ZOMBIE_STATE.RUSH }, { netId: B, x: 4, y: 4 }]);
    sample(1);
    mirrorZombies(out, z);
    expect(z.aliveCount).toBe(2);
    expect(z.x[3]).toBeCloseTo(1.5, 5);
    expect(z.prevX[3]).toBeCloseTo(1.5, 5);
    expect(z.generation[3]).toBe(9);
    expect(z.heading[3]).toBe(64);
    expect(z.state[3]).toBe(ZOMBIE_STATE.RUSH);
    expect(z.alivePos[4]).toBeGreaterThanOrEqual(0);
    push(2, [{ netId: B, x: 4, y: 4 }]);
    out.count = 0;
    out.netId[0] = B;
    out.count = 1;
    mirrorZombies(out, z);
    expect(z.aliveCount).toBe(1);
    expect(z.alivePos[3]).toBe(-1);
    expect(z.state[3]).toBe(ZOMBIE_STATE.FREE);
    expect(z.aliveIds[0]).toBe(4);
  });
});
