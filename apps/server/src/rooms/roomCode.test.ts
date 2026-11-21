import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, isRoomCode } from "@topdown/shared";
import { MAX_ROOM_CODE_TRIES, generateRoomCode, uniqueRoomCode } from "./roomCode";

describe("room code generation", () => {
  it("draws 1,000 valid codes", () => {
    for (let i = 0; i < 1000; i++) expect(isRoomCode(generateRoomCode())).toBe(true);
  });

  it("uses every letter of the alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) for (const c of generateRoomCode()) seen.add(c);
    expect(seen.size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it("retries on a collision", () => {
    // Deterministic draws: first code "AAAA" (taken), then "BBBB".
    const draws = [0, 0, 0, 0, 1, 1, 1, 1];
    const randomInt = (max: number): number => {
      expect(max).toBe(ROOM_CODE_ALPHABET.length);
      return draws.shift() ?? 0;
    };
    const tried: string[] = [];
    const code = uniqueRoomCode((c) => (tried.push(c), c === "AAAA"), randomInt);
    expect(tried).toEqual(["AAAA", "BBBB"]);
    expect(code).toBe("BBBB");
  });

  it("throws after too many collisions", () => {
    let calls = 0;
    expect(() => uniqueRoomCode(() => (calls++, true))).toThrow(/room code/);
    expect(calls).toBe(MAX_ROOM_CODE_TRIES);
  });
});
