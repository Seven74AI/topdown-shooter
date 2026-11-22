import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { MAX_PLAYERS } from "../net/messages";
import { createRng, type Rng } from "./rng";
import { STREAM_NAMES, createSeedStreams, parseRunSeed, shopStream, shopStreamKey, streamSeed } from "./seedStreams";
import { createWorld } from "./world";
import { snapshotWorld } from "./worldSnapshot";

const balance = loadBalance();
const draws = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe("named seed streams (Story 4.4, FR65)", () => {
  it("the same run seed derives the same sequences on every stream", () => {
    const a = createSeedStreams(123456789);
    const b = createSeedStreams(123456789);
    for (const name of STREAM_NAMES) expect(draws(a[name], 32)).toEqual(draws(b[name], 32));
  });

  it("drawing from one stream never changes another's sequence", () => {
    for (const name of STREAM_NAMES) {
      const quiet = createSeedStreams(77);
      const busy = createSeedStreams(77);
      const expected = draws(quiet[name], 64);
      // Hammer every other stream between each draw of this one.
      const got: number[] = [];
      for (let i = 0; i < 64; i++) {
        for (const other of STREAM_NAMES) if (other !== name) draws(busy[other], 1 + (i % 5));
        got.push(busy[name].next());
      }
      expect(got, name).toEqual(expected);
    }
  });

  it("every stream has its own sequence (no two named streams start alike)", () => {
    const s = createSeedStreams(2026);
    const firsts = STREAM_NAMES.map((n) => draws(s[n], 4).join(","));
    expect(new Set(firsts).size).toBe(STREAM_NAMES.length);
  });

  it("no two keys of one run share a stream seed (4 named + 4 slots × 100 build phases, several runs)", () => {
    for (const run of [0, 1, 42, 0xdeadbeef, 0xffffffff]) {
      const keys = [...STREAM_NAMES, ...Array.from({ length: MAX_PLAYERS * 100 }, (_, i) => shopStreamKey(i % MAX_PLAYERS, Math.floor(i / MAX_PLAYERS)))];
      const seeds = new Set(keys.map((k) => streamSeed(run, k)));
      expect(seeds.size).toBe(keys.length);
    }
    expect(streamSeed(1, "spawns")).not.toBe(streamSeed(2, "spawns")); // and the run seed matters
  });

  it("Rng.reseed restarts a generator exactly like createRng", () => {
    const r = createRng(5);
    draws(r, 100);
    r.reseed(991);
    expect(draws(r, 16)).toEqual(draws(createRng(991), 16));
  });

  it("shop:<slot>:<build>: rerolls in one build advance it, the next build starts its own sequence, slots differ", () => {
    const w = createWorld({ balance, seed: 31337 });
    const fresh = (slot: number, build: number) => createRng(streamSeed(31337, shopStreamKey(slot, build)));
    w.run.phase = "build";
    w.waves.number = 0; // the build phase before wave 1
    const b0 = [shopStream(w, 1).next(), shopStream(w, 1).next(), shopStream(w, 1).next()];
    expect(b0).toEqual(draws(fresh(1, 0), 3));
    w.waves.number = 2;
    expect(draws(shopStream(w, 1), 3)).toEqual(draws(fresh(1, 2), 3));
    // Build 2 of slot 1 doesn't care how much slot 0 rolled in build 2.
    draws(shopStream(w, 0), 50);
    expect(draws(shopStream(w, 0), 1)).toEqual(draws(fresh(0, 2), 51).slice(50));
    expect(draws(fresh(0, 2), 3)).not.toEqual(draws(fresh(1, 2), 3));
    expect(() => shopStream(w, MAX_PLAYERS)).toThrow();
  });

  it("4.4 review L1: a shop draw outside a build phase is refused, so wave n + 1 can't advance build n + 1's stream", () => {
    const w = createWorld({ balance, seed: 31337 });
    w.waves.number = 1;
    w.run.phase = "wave"; // wave 1: waves.number already equals the coming build's index
    expect(() => shopStream(w, 0)).toThrow(/build phase/);
    expect(() => shopStream({ ...w, run: { phase: "lobby" } }, 0)).toThrow(/build phase/);
    w.run.phase = "build";
    expect(draws(shopStream(w, 0), 2)).toEqual(draws(createRng(streamSeed(31337, shopStreamKey(0, 1))), 2));
  });

  it("the World has no unnamed rng, and its snapshot carries every stream's state", () => {
    const w = createWorld({ balance, seed: 9 });
    expect("rng" in w).toBe(false);
    const before = snapshotWorld(w).streams;
    w.streams.decay.next();
    const after = snapshotWorld(w).streams;
    expect(after.decay).not.toEqual(before.decay);
    expect({ ...after, decay: null }).toEqual({ ...before, decay: null });
    expect(after.shop).toHaveLength(MAX_PLAYERS);
  });

  it("parses run seeds like the dev cheat (decimal or 0x-hex uint32)", () => {
    expect(parseRunSeed("42")).toBe(42);
    expect(parseRunSeed(" 0xFF ")).toBe(255);
    expect(parseRunSeed("4294967295")).toBe(0xffffffff);
    expect(parseRunSeed("4294967296")).toBeNull();
    expect(parseRunSeed("-1")).toBeNull();
    expect(parseRunSeed("1.5")).toBeNull();
    expect(parseRunSeed("")).toBeNull();
    expect(parseRunSeed(null)).toBeNull();
  });
});
