import { describe, expect, it } from "vitest";
import {
  BYTES,
  C2S,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  RUN_ROOM_NAME,
  S2C,
  joinOptionsSchema,
  lobbySetReadySchema,
  playerNameSchema,
  runStartSchema,
} from "./messages";

const TOKEN = "0123456789abcdef0123456789abcdef";
const valid = { intent: "create", name: "Ana", balanceVersion: "1a2b3c4d", guestToken: TOKEN } as const;

describe("net contract", () => {
  it("names the room and the message types", () => {
    expect(RUN_ROOM_NAME).toBe("run");
    expect(C2S.INPUT_SEND).toBe("input.send");
    expect(S2C.RUN_JOINED).toBe("run.joined");
    expect(BYTES.HORDE_FRAME).toBe(1);
    const all = [...Object.values(C2S), ...Object.values(S2C)];
    expect(new Set(all).size).toBe(all.length);
  });

  it("trims names and accepts 1-16 characters", () => {
    expect(playerNameSchema.parse("  Ana  ")).toBe("Ana");
    expect(playerNameSchema.safeParse("Zoé 🏃\u200D\u2640\uFE0F").success).toBe(true); // emoji ZWJ sequence
    expect(playerNameSchema.safeParse("\u3164").success).toBe(false); // Hangul filler: invisible
    expect(playerNameSchema.safeParse("\u2800 \u3164").success).toBe(false);
    expect(playerNameSchema.safeParse("a\u200Bb").success).toBe(false); // zero-width space stays refused
    expect(playerNameSchema.safeParse("a".repeat(16)).success).toBe(true);
    expect(playerNameSchema.safeParse("a".repeat(17)).success).toBe(false);
    expect(playerNameSchema.safeParse(` ${"a".repeat(16)} `).success).toBe(true);
    expect(playerNameSchema.safeParse("").success).toBe(false);
    expect(playerNameSchema.safeParse("   ").success).toBe(false);
    expect(playerNameSchema.safeParse("Zoë ✌").success).toBe(true);
    expect(playerNameSchema.safeParse(42).success).toBe(false);
  });

  it("refuses control characters in names", () => {
    expect(playerNameSchema.safeParse("a\u0000b").success).toBe(false);
    expect(playerNameSchema.safeParse("a\nb").success).toBe(false);
    expect(playerNameSchema.safeParse("a‮b").success).toBe(false); // bidi override (Cf)
  });

  it("validates join options strictly", () => {
    expect(joinOptionsSchema.parse({ ...valid, name: " Ana " })).toEqual(valid);
    expect(joinOptionsSchema.safeParse({ ...valid, intent: "join" }).success).toBe(true);
    expect(joinOptionsSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ ...valid, intent: "spectate" }).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ ...valid, balanceVersion: "" }).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ ...valid, balanceVersion: "x".repeat(17) }).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ intent: "create", name: "Ana" }).success).toBe(false);
    expect(joinOptionsSchema.safeParse(null).success).toBe(false);
  });

  it("requires a 32-hex-digit guest token", () => {
    expect(joinOptionsSchema.safeParse({ ...valid, guestToken: undefined }).success).toBe(false);
    for (const guestToken of ["", TOKEN.toUpperCase(), TOKEN.slice(1), TOKEN + "0", "g".repeat(32), 42]) {
      expect(joinOptionsSchema.safeParse({ ...valid, guestToken }).success).toBe(false);
    }
  });

  it("validates lobby.set_ready and run.start strictly", () => {
    expect(lobbySetReadySchema.parse({ ready: true })).toEqual({ ready: true });
    expect(lobbySetReadySchema.safeParse({ ready: "yes" }).success).toBe(false);
    expect(lobbySetReadySchema.safeParse({}).success).toBe(false);
    expect(lobbySetReadySchema.safeParse({ ready: false, slot: 1 }).success).toBe(false);
    expect(runStartSchema.safeParse({}).success).toBe(true);
    expect(runStartSchema.safeParse({ force: true }).success).toBe(false);
    expect(runStartSchema.safeParse(null).success).toBe(false);
  });

  it("has 4 players at most and needs 2 to start", () => {
    expect(MAX_PLAYERS).toBe(4);
    expect(MIN_PLAYERS_TO_START).toBe(2);
  });
});
