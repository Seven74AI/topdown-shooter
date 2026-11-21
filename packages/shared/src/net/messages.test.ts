import { describe, expect, it } from "vitest";
import { BYTES, C2S, RUN_ROOM_NAME, S2C, joinOptionsSchema, playerNameSchema } from "./messages";

const valid = { intent: "create", name: "Ana", balanceVersion: "1a2b3c4d" } as const;

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
});
