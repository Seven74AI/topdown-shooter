import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "./roomCode";

describe("room code", () => {
  it("has no ambiguous characters and is 4 long", () => {
    for (const c of ["I", "O", "0", "1"]) expect(ROOM_CODE_ALPHABET).not.toContain(c);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
    expect(ROOM_CODE_LENGTH).toBe(4);
  });

  it("accepts exactly 4 letters from the alphabet", () => {
    expect(isRoomCode("ABCD")).toBe(true);
    expect(isRoomCode("ZXWV")).toBe(true);
    expect(isRoomCode("ABC")).toBe(false);
    expect(isRoomCode("ABCDE")).toBe(false);
    expect(isRoomCode("abcd")).toBe(false);
    expect(isRoomCode("AB2D")).toBe(false);
    expect(isRoomCode("ABOD")).toBe(false);
    expect(isRoomCode("ABID")).toBe(false);
    expect(isRoomCode("")).toBe(false);
  });

  it("normalizes by trimming and uppercasing", () => {
    expect(normalizeRoomCode("  abcd ")).toBe("ABCD");
    expect(isRoomCode(normalizeRoomCode("wxyz"))).toBe(true);
  });
});
