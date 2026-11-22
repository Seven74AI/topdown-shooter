import { describe, expect, it } from "vitest";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { createRng } from "../core/rng";
import { ZOMBIE_STATE, ZOMBIE_TYPES } from "../zombies/zombieTypes";
import {
  HORDE_HEADER_BYTES,
  HORDE_MAX_FRAME_BYTES,
  HORDE_MAX_RECORDS,
  MAX_POS_CM,
  hordeFrameBytes,
  hordeFrameTick,
  packTypeState,
  readHordeFrame,
  stateOfTypeState,
  typeOfTypeState,
  writeHordeHeader,
  writeHordeRecord,
  zombieGenerationOfNetId,
  zombieNetId,
  type HordeSink,
} from "./hordeFormat";

interface Rec {
  netId: number;
  x: number;
  y: number;
  heading: number;
  typeState: number;
}

class Collect implements HordeSink {
  tick = -1;
  count = -1;
  recs: Rec[] = [];
  ended = false;
  begin(tick: number, count: number): void {
    this.tick = tick;
    this.count = count;
  }
  record(_i: number, netId: number, x: number, y: number, heading: number, typeState: number): void {
    this.recs.push({ netId, x, y, heading, typeState });
  }
  end(): void {
    this.ended = true;
  }
}

const buf = new Uint8Array(HORDE_MAX_FRAME_BYTES);
const view = new DataView(buf.buffer);

function encode(tick: number, recs: Rec[]): Uint8Array {
  writeHordeHeader(view, tick, recs.length);
  recs.forEach((r, i) => writeHordeRecord(view, i, r.netId, r.x, r.y, r.heading, r.typeState));
  return buf.slice(0, hordeFrameBytes(recs.length));
}

function decode(bytes: Uint8Array): Collect {
  const c = new Collect();
  expect(readHordeFrame(bytes, c)).toBe(true);
  return c;
}

describe("horde frame format", () => {
  it("the pool slot fits 8 bits", () => {
    expect(ZOMBIE_POOL_CAPACITY).toBeLessThanOrEqual(256);
    expect(HORDE_MAX_RECORDS).toBeGreaterThanOrEqual(ZOMBIE_POOL_CAPACITY);
  });

  it.each([1, 150, 256])("round-trips %i records", (n) => {
    const rng = createRng(n);
    const recs: Rec[] = Array.from({ length: n }, (_, i) => ({
      netId: zombieNetId(i, (i * 7) & 0xff),
      x: Math.round(rng.range(0, 48) * 100) / 100,
      y: Math.round(rng.range(0, 32) * 100) / 100,
      heading: (i * 13) & 0xff,
      typeState: packTypeState(0, i % 3),
    }));
    const bytes = encode(123456, recs);
    expect(bytes.length).toBe(6 + 8 * n);
    const got = decode(bytes);
    expect(got.tick).toBe(123456);
    expect(got.count).toBe(n);
    expect(got.ended).toBe(true);
    got.recs.forEach((r, i) => {
      const want = recs[i] as Rec;
      expect(r.netId).toBe(want.netId);
      expect(r.x).toBeCloseTo(want.x, 6);
      expect(r.y).toBeCloseTo(want.y, 6);
      expect(r.heading).toBe(want.heading);
      expect(r.typeState).toBe(want.typeState);
    });
  });

  it("keeps a u32 tick", () => {
    const bytes = encode(0xfffffffe, []);
    expect(hordeFrameTick(bytes)).toBe(0xfffffffe);
  });

  it("quantizes to 1 cm (Math.round)", () => {
    const got = decode(encode(1, [{ netId: 0, x: 12.3449, y: 12.3451, heading: 0, typeState: 0 }]));
    expect(got.recs[0]?.x).toBeCloseTo(12.34, 9);
    expect(got.recs[0]?.y).toBeCloseTo(12.35, 9);
  });

  it("position error is at most 5 mm over 10,000 random positions", () => {
    const rng = createRng(2025);
    let worst = 0;
    for (let k = 0; k < 10_000; k++) {
      const x = rng.range(0, 600);
      const y = rng.range(0, 600);
      const r = decode(encode(k, [{ netId: 1, x, y, heading: 0, typeState: 0 }])).recs[0] as Rec;
      worst = Math.max(worst, Math.abs(r.x - x), Math.abs(r.y - y));
    }
    expect(worst).toBeLessThanOrEqual(0.005 + 1e-9);
  });

  it("clamps positions to 0…65535 cm", () => {
    const r = decode(encode(1, [{ netId: 1, x: -1, y: 700, heading: 0, typeState: 0 }])).recs[0] as Rec;
    expect(r.x).toBe(0);
    expect(r.y).toBe(MAX_POS_CM / 100);
  });

  it("net ids carry the generation", () => {
    const id = zombieNetId(5, 255);
    const r = decode(encode(1, [{ netId: id, x: 1, y: 1, heading: 0, typeState: 0 }])).recs[0] as Rec;
    expect(r.netId).toBe(id);
    expect(r.netId & 0xff).toBe(5);
    expect(zombieGenerationOfNetId(r.netId)).toBe(255);
    expect(zombieNetId(5, 0)).not.toBe(zombieNetId(5, 1));
    expect(zombieNetId(5, 256)).toBe(zombieNetId(5, 0)); // generation wraps like the pool's
  });

  it("packs every type and state into one byte", () => {
    for (let type = 0; type < ZOMBIE_TYPES.length; type++) {
      for (const state of Object.values(ZOMBIE_STATE)) {
        const ts = packTypeState(type, state);
        expect(ts).toBeLessThan(256);
        expect(typeOfTypeState(ts)).toBe(type);
        expect(stateOfTypeState(ts)).toBe(state);
      }
    }
    for (let v = 0; v < 16; v++) expect(stateOfTypeState(packTypeState(15 - v, v))).toBe(v);
    expect(() => packTypeState(16, 0)).toThrow();
    expect(() => packTypeState(0, 16)).toThrow();
  });

  it("an empty frame is exactly 6 bytes", () => {
    const bytes = encode(9, []);
    expect(bytes.length).toBe(HORDE_HEADER_BYTES);
    const got = decode(bytes);
    expect(got.count).toBe(0);
    expect(got.tick).toBe(9);
  });

  it("rejects a wrong length and calls nothing", () => {
    const good = encode(3, [{ netId: 1, x: 1, y: 1, heading: 0, typeState: 0 }]);
    for (const bad of [good.subarray(0, 13), good.subarray(0, 4), new Uint8Array([...good, 0]), new Uint8Array(0)]) {
      const c = new Collect();
      expect(readHordeFrame(bad, c)).toBe(false);
      expect(c.tick).toBe(-1);
    }
    // A count over the pool is rejected even with a matching length.
    const huge = new Uint8Array(hordeFrameBytes(257));
    new DataView(huge.buffer).setUint16(4, 257, true);
    expect(readHordeFrame(huge, new Collect())).toBe(false);
  });

  it("reads a subarray view at its own offset", () => {
    const bytes = encode(77, [{ netId: 9, x: 3, y: 4, heading: 1, typeState: 0 }]);
    const padded = new Uint8Array(bytes.length + 5);
    padded.set(bytes, 5);
    const got = decode(padded.subarray(5));
    expect(got.tick).toBe(77);
    expect(got.recs[0]?.netId).toBe(9);
  });
});
