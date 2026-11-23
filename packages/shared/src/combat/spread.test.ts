import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { REWIND_MAX_TICKS, TICK_DT_S } from "../config/constants";
import { createWorld, setInput, step } from "../core/world";
import { DEG_TO_RAD, rotate } from "../math/vec";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer } from "../player/player";
import { setLoadout } from "./loadout";
import { pelletDirection, seqPelletRoll, seqSpreadRoll } from "./spread";

const balance = loadBalance();

describe("seq spread roll (Story 2.12)", () => {
  it("is a pure function of (player, seq), in [-1, 1), spread evenly", () => {
    expect(seqSpreadRoll("p0", 17)).toBe(seqSpreadRoll("p0", 17));
    expect(seqSpreadRoll("p0", 17)).not.toBe(seqSpreadRoll("p1", 17));
    const n = 20_000;
    const buckets = new Array<number>(10).fill(0);
    let sum = 0;
    for (let s = 1; s <= n; s++) {
      const u = seqSpreadRoll("p2", s);
      expect(u).toBeGreaterThanOrEqual(-1);
      expect(u).toBeLessThan(1);
      sum += u;
      const b = Math.floor((u + 1) * 5);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.02);
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 10 / 8);
  });

  it("online (lag compensation on) the server's shot uses the seq's roll; offline the World's rng as before", () => {
    const smg = balance.weapons.smg;
    const half = ((smg?.kind === "gun" ? smg.spreadDeg : 0) / 2) * DEG_TO_RAD;
    expect(half).toBeGreaterThan(0);
    const dirOf = (online: boolean, seq: number): { x: number; y: number } => {
      const world = createWorld({ balance, seed: 5, systems: { waves: () => {}, zombies: () => {} } });
      const p = addPlayer(world, "p0", 5, 16);
      p.rewindMaxTicks = online ? REWIND_MAX_TICKS : 0;
      setLoadout(balance, p.loadout, ["smg", null]);
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq, aimX: 1, aimY: 0, fire: true, isMouse: true });
      step(world, TICK_DT_S);
      const id = world.projectiles.aliveIds[0] as number;
      return { x: world.projectiles.dirX[id] as number, y: world.projectiles.dirY[id] as number };
    };
    const expected = { x: 0, y: 0 };
    for (const seq of [3, 4, 99]) {
      rotate(1, 0, seqSpreadRoll("p0", seq) * half, expected);
      const d = dirOf(true, seq);
      expect(d.x).toBeCloseTo(expected.x, 6);
      expect(d.y).toBeCloseTo(expected.y, 6);
    }
    // Offline the roll does not depend on the seq (the rng's first draw): solo unchanged.
    expect(dirOf(false, 3)).toEqual(dirOf(false, 99));
  });
});

describe("pellet fan (Story 5.3, F1)", () => {
  const out = { x: 0, y: 0 };
  it("pellet k always lies in slice k of the cone", () => {
    const spread = 30;
    const pellets = 8;
    const slice = spread / pellets;
    for (let trial = 0; trial < 200; trial++) {
      const aim = trial * 0.37;
      for (let k = 0; k < pellets; k++) {
        const u = seqPelletRoll("p1", trial, k);
        pelletDirection(Math.cos(aim), Math.sin(aim), spread, pellets, k, u, out);
        expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 6);
        let off = (Math.atan2(out.y, out.x) - aim) / DEG_TO_RAD;
        off -= 360 * Math.round(off / 360);
        expect(off).toBeGreaterThanOrEqual(-spread / 2 + k * slice - 1e-6);
        expect(off).toBeLessThanOrEqual(-spread / 2 + (k + 1) * slice + 1e-6);
      }
    }
  });

  it("same (player, seq, k) gives the same roll in [0, 1); neighbouring seqs and pellets spread", () => {
    expect(seqPelletRoll("p0", 99, 3)).toBe(seqPelletRoll("p0", 99, 3));
    expect(seqPelletRoll("p0", 99, 3)).not.toBe(seqPelletRoll("p0", 99, 4));
    expect(seqPelletRoll("p0", 99, 3)).not.toBe(seqPelletRoll("p0", 100, 3));
    expect(seqPelletRoll("p0", 99, 3)).not.toBe(seqPelletRoll("p1", 99, 3));
    const buckets = new Array<number>(10).fill(0);
    const n = 4000;
    for (let s = 0; s < n / 8; s++)
      for (let k = 0; k < 8; k++) {
        const u = seqPelletRoll("p3", s, k);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(1);
        const b = Math.floor(u * 10);
        buckets[b] = (buckets[b] ?? 0) + 1;
      }
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 10 / 4);
  });

  it("the pellet roll of seq and seq + 65536 are equal (16-bit key on the wire)", () => {
    for (const s of [0, 1, 777, 65535, 123456])
      for (let k = 0; k < 8; k++) expect(seqPelletRoll("p2", s + 65536, k)).toBe(seqPelletRoll("p2", s, k));
  });
});
