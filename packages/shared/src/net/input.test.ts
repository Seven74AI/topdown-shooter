import { describe, expect, it } from "vitest";
import { INPUT_BYTES, INPUT_FORMAT, INPUT_STICK_STEPS, NEUTRAL_INPUT, ackTickFrom, decodeInput, decodeInputAck, encodeInput, playerInputSchema, quantizeInput, type PlayerInput } from "./input";
import { createRng } from "../core/rng";

describe("PlayerInput.viewTick (Story 2.12)", () => {
  it("accepts -1 (none) and integer hundredths of a tick; refuses fractions, NaN, ∞, below -1, absent", () => {
    for (const viewTick of [-1, 0, 123456, 2 ** 31]) expect(playerInputSchema.safeParse({ ...NEUTRAL_INPUT, viewTick }).success, `${viewTick}`).toBe(true);
    for (const viewTick of [1234.56, Number.NaN, Number.POSITIVE_INFINITY, -2, 2 ** 31 + 1, "5"]) {
      expect(playerInputSchema.safeParse({ ...NEUTRAL_INPUT, viewTick }).success, `${String(viewTick)}`).toBe(false);
    }
    const without: Partial<typeof NEUTRAL_INPUT> = { ...NEUTRAL_INPUT };
    delete without.viewTick;
    expect(playerInputSchema.safeParse(without).success).toBe(false);
    expect(NEUTRAL_INPUT.viewTick).toBe(-1);
  });
});

describe("Story 8.11 binary input (F2: exactly as strict as the schema)", () => {
  const out = (): { -readonly [K in keyof PlayerInput]: PlayerInput[K] } => ({ ...NEUTRAL_INPUT });
  const enc = (i: PlayerInput): Uint8Array => {
    const b = new Uint8Array(INPUT_BYTES);
    expect(encodeInput(i, b)).toBe(INPUT_BYTES);
    return b;
  };
  const rng = createRng(811);

  it("is 16 bytes (Story 8.13: 14 + the 2-byte tick ack); random inputs round-trip to their 1/127 steps, and quantising twice changes nothing", () => {
    expect(INPUT_BYTES).toBe(16);
    for (let n = 0; n < 5000; n++) {
      const s = () => rng.next() * 2 - 1;
      const i: PlayerInput = {
        seq: Math.floor(rng.next() * 2 ** 32),
        moveX: s(),
        moveY: s(),
        aimX: s(),
        aimY: s(),
        fire: rng.next() < 0.5,
        swap: rng.next() < 0.5,
        consumable: rng.next() < 0.5,
        isMouse: rng.next() < 0.5,
        viewTick: rng.next() < 0.1 ? -1 : Math.floor(rng.next() * 2 ** 31),
      };
      const d = out();
      expect(decodeInput(enc(i), d)).toBe(true);
      expect(playerInputSchema.safeParse(d).success).toBe(true);
      for (const k of ["moveX", "moveY", "aimX", "aimY"] as const) {
        expect(Math.abs(d[k] - i[k])).toBeLessThanOrEqual(0.5 / INPUT_STICK_STEPS + 1e-12);
        expect(d[k] * INPUT_STICK_STEPS).toBeCloseTo(Math.round(i[k] * INPUT_STICK_STEPS), 9);
      }
      expect({ seq: d.seq, fire: d.fire, swap: d.swap, consumable: d.consumable, isMouse: d.isMouse, viewTick: d.viewTick }).toEqual({ seq: i.seq, fire: i.fire, swap: i.swap, consumable: i.consumable, isMouse: i.isMouse, viewTick: i.viewTick });
      const q = { ...d };
      quantizeInput(q, new Uint8Array(INPUT_BYTES));
      expect(q).toEqual(d); // what the phone predicts with IS what the server decodes
    }
  });

  it("boundaries: sticks ±1 exactly, viewTick −1 / 0 / 2³¹, seq 0 / 2³² − 1", () => {
    for (const v of [-1, 1, 0]) {
      const d = out();
      expect(decodeInput(enc({ ...NEUTRAL_INPUT, moveX: v, moveY: -v, aimX: v, aimY: -v }), d)).toBe(true);
      expect([d.moveX, d.moveY, d.aimX, d.aimY]).toEqual([v, -v, v, -v].map((x) => x + 0)); // +0: −0 → 0
    }
    for (const viewTick of [-1, 0, 123456, 2 ** 31]) {
      const d = out();
      expect(decodeInput(enc({ ...NEUTRAL_INPUT, viewTick }), d)).toBe(true);
      expect(d.viewTick).toBe(viewTick);
    }
    for (const seq of [0, 1, 2 ** 32 - 1]) {
      const d = out();
      expect(decodeInput(enc({ ...NEUTRAL_INPUT, seq }), d)).toBe(true);
      expect(d.seq).toBe(seq);
    }
  });

  it("the encoder clamps what the schema would refuse (the phone never sends it): sticks to ±1, NaN to 0", () => {
    const d = out();
    expect(decodeInput(enc({ ...NEUTRAL_INPUT, moveX: 5, moveY: -5, aimX: Number.NaN }), d)).toBe(true);
    expect([d.moveX, d.moveY, d.aimX]).toEqual([1, -1, 0]);
  });

  it("refuses: wrong length (short, long), another format byte, a stick of −128, an unknown flag bit, viewTick > 2³¹", () => {
    const good = enc({ ...NEUTRAL_INPUT, seq: 7, fire: true });
    expect(decodeInput(good, out())).toBe(true);
    for (let len = 0; len <= 32; len++) {
      if (len === INPUT_BYTES) continue;
      const b = new Uint8Array(len);
      b.set(good.subarray(0, Math.min(len, INPUT_BYTES)));
      expect(decodeInput(b, out()), `length ${len}`).toBe(false);
    }
    const bad = (at: number, v: number): Uint8Array => {
      const b = good.slice();
      b[at] = v;
      return b;
    };
    expect(decodeInput(bad(0, INPUT_FORMAT + 1), out())).toBe(false);
    expect(decodeInput(bad(0, 0), out())).toBe(false);
    for (const at of [5, 6, 7, 8]) {
      expect(decodeInput(bad(at, 0x80), out()), `−128 at ${at}`).toBe(false);
      expect(decodeInput(bad(at, 0x81), out()), `−127 at ${at}`).toBe(true);
      expect(decodeInput(bad(at, 0x7f), out()), `127 at ${at}`).toBe(true);
    }
    for (let bit = 5; bit < 8; bit++) expect(decodeInput(bad(9, 1 << bit), out()), `flag bit ${bit}`).toBe(false);
    // Story 8.13: without the ack flag, the ack bytes must be 0 (nothing extra).
    expect(decodeInput(bad(14, 1), out())).toBe(false);
    expect(decodeInput(bad(15, 1), out())).toBe(false);
    const vt = (u32: number): Uint8Array => {
      const b = good.slice();
      new DataView(b.buffer).setUint32(10, u32, true);
      return b;
    };
    expect(decodeInput(vt(2 ** 31 + 1), out())).toBe(true); // = 2³¹
    expect(decodeInput(vt(2 ** 31 + 2), out())).toBe(false);
    expect(decodeInput(vt(0xffffffff), out())).toBe(false);
  });

  it("fuzz: random bytes never throw; whatever decodes passes the zod schema and re-encodes to the same bytes", () => {
    let accepted = 0;
    const b = new Uint8Array(INPUT_BYTES);
    const again = new Uint8Array(INPUT_BYTES);
    for (let n = 0; n < 20000; n++) {
      for (let i = 0; i < INPUT_BYTES; i++) b[i] = Math.floor(rng.next() * 256);
      if (n % 2 === 0) b[0] = INPUT_FORMAT;
      if (n % 4 === 0) b[9] = (b[9] as number) & 0x1f;
      if (n % 8 === 0) b[13] = (b[13] as number) & 0x7f;
      if (n % 16 === 0) b[14] = b[15] = 0;
      const d = out();
      if (!decodeInput(b, d)) continue;
      accepted++;
      expect(playerInputSchema.safeParse(d).success).toBe(true);
      encodeInput(d, again, decodeInputAck(b));
      expect(again).toEqual(b);
    }
    expect(accepted).toBeGreaterThan(500); // liveness: the fuzz really reached the accept path
  });

  it("reads a Uint8Array view at any offset (the server gets a Buffer subarray)", () => {
    const good = enc({ ...NEUTRAL_INPUT, seq: 42, aimX: 1, viewTick: 900 });
    const big = new Uint8Array(40);
    big.set(good, 13);
    const d = out();
    expect(decodeInput(big.subarray(13, 13 + INPUT_BYTES), d)).toBe(true);
    expect([d.seq, d.aimX, d.viewTick]).toEqual([42, 1, 900]);
  });

  describe("Story 8.13: the tick ack (bytes 14–15)", () => {
    it("round-trips the low 16 bits; −1 / NaN = none (flag off, bytes 0); the decoded input is the same with or without it", () => {
      const b = new Uint8Array(INPUT_BYTES);
      for (const tick of [0, 1, 255, 256, 65535, 65536, 70000, 2 ** 31]) {
        encodeInput({ ...NEUTRAL_INPUT, seq: 3 }, b, tick);
        expect(decodeInput(b, out())).toBe(true);
        expect(decodeInputAck(b), `${tick}`).toBe(tick & 0xffff);
      }
      for (const none of [-1, Number.NaN]) {
        encodeInput({ ...NEUTRAL_INPUT, seq: 3 }, b, none);
        expect(decodeInput(b, out())).toBe(true);
        expect(decodeInputAck(b)).toBe(-1);
        expect([b[14], b[15]]).toEqual([0, 0]);
      }
      const a = out();
      const c = out();
      encodeInput({ ...NEUTRAL_INPUT, seq: 9, fire: true, viewTick: 400 }, b, 1234);
      decodeInput(b, a);
      encodeInput({ ...NEUTRAL_INPUT, seq: 9, fire: true, viewTick: 400 }, b);
      decodeInput(b, c);
      expect(a).toEqual(c);
      expect(decodeInputAck(new Uint8Array(14))).toBe(-1); // wrong length: none
    });

    it("ackTickFrom: the newest tick ≤ now with those low bits; never from the future; none before tick 0", () => {
      expect(ackTickFrom(-1, 100)).toBe(-1);
      expect(ackTickFrom(95, 100)).toBe(95);
      expect(ackTickFrom(100, 100)).toBe(100);
      expect(ackTickFrom(101, 100)).toBe(-1); // would be 101 − 65,536 < 0
      expect(ackTickFrom(70000 & 0xffff, 70010)).toBe(70000);
      expect(ackTickFrom(65530, 65540)).toBe(65530); // across the wrap
      expect(ackTickFrom(3, 65540)).toBe(65539); // low 3 = 65,536 + 3
      expect(ackTickFrom(5, 65540)).toBe(5); // low 5 > now's low 4: 65,535 ticks back
      for (let now = 0; now < 200000; now += 997) for (const back of [0, 1, 20, 300, 65535]) if (now - back >= 0) expect(ackTickFrom((now - back) & 0xffff, now)).toBe(now - back);
    });
  });
});
