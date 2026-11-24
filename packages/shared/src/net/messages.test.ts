import { describe, expect, it } from "vitest";
import {
  BYTES,
  C2S,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  RUN_ROOM_NAME,
  S2C,
  buildingRepairSchema,
  buildingSellSchema,
  buildingMoveSchema,
  joinOptionsSchema,
  lobbySetReadySchema,
  playerNameSchema,
  runStartSchema,
  shopBuyItemSchema,
} from "./messages";

const TOKEN = "0123456789abcdef0123456789abcdef";
const valid = { intent: "create", name: "Ana", balanceVersion: "1a2b3c4d", mapVersion: "0badc0de", guestToken: TOKEN } as const;

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
    // Story 4.1 review M1: mapVersion is required (the room maps its absence to balance_mismatch).
    expect(joinOptionsSchema.safeParse({ ...valid, mapVersion: undefined }).success).toBe(false);
    expect(joinOptionsSchema.safeParse({ ...valid, mapVersion: "" }).success).toBe(false);
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

  it("has 4 players at most and needs 1 to start", () => {
    expect(MAX_PLAYERS).toBe(4);
    expect(MIN_PLAYERS_TO_START).toBe(1); // designer 2026-11-23: online runs can be played alone
  });
});

describe("building.repair (Story 3.7)", () => {
  it("accepts only { id } with an integer id 1–65535", () => {
    expect(buildingRepairSchema.safeParse({ id: 1 }).success).toBe(true);
    expect(buildingRepairSchema.safeParse({ id: 65535 }).success).toBe(true);
    for (const bad of [{}, { id: 0 }, { id: 1.5 }, { id: 65536 }, { id: "1" }, { id: 1, cost: 0 }, null]) {
      expect(buildingRepairSchema.safeParse(bad).success).toBe(false);
    }
    expect(C2S.BUILDING_REPAIR).toBe("building.repair");
    expect(S2C.BUILDING_REPAIR_REFUSED).toBe("building.repair_refused");
  });
});

describe("shop.buy_item (Story 5.11; shared with 5.12)", () => {
  it("names the messages and accepts only { item: balance id ≤ 32 }", () => {
    expect([C2S.SHOP_BUY_ITEM, S2C.SHOP_BOUGHT_ITEM, S2C.SHOP_REFUSED_ITEM]).toEqual(["shop.buy_item", "shop.bought_item", "shop.refused_item"]);
    expect(shopBuyItemSchema.safeParse({ item: "running_shoes" }).success).toBe(true);
    for (const bad of [{}, { item: "" }, { item: "Running" }, { item: "a".repeat(33) }, { item: 3 }, { item: "body_armor_1", extra: 1 }, { item: "x-y" }]) {
      expect(shopBuyItemSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("building.move (Story 5.22)", () => {
  it("accepts only { id, gx, gy, rot } with integers in range (strict: no type, owner or hp fields)", () => {
    expect(buildingMoveSchema.safeParse({ id: 1, gx: 0, gy: 0, rot: 0 }).success).toBe(true);
    expect(buildingMoveSchema.safeParse({ id: 65535, gx: 255, gy: 255, rot: 3 }).success).toBe(true);
    const ok = { id: 5, gx: 10, gy: 10, rot: 1 };
    for (const bad of [{}, { ...ok, id: 0 }, { ...ok, gx: -1 }, { ...ok, gy: 256 }, { ...ok, rot: 4 }, { ...ok, gx: 1.5 }, { ...ok, rot: "1" }, { ...ok, type: "mine" }, { ...ok, hp: 999 }, { id: 5, gx: 1, gy: 1 }, null]) {
      expect(buildingMoveSchema.safeParse(bad).success).toBe(false);
    }
    expect(C2S.BUILDING_MOVE).toBe("building.move");
    expect(S2C.BUILDING_MOVE_REFUSED).toBe("building.move_refused");
  });
});

describe("building.sell (Story 5.20)", () => {
  it("accepts only { id } with an integer id 1–65535 (strict: no refund or owner fields)", () => {
    expect(buildingSellSchema.safeParse({ id: 1 }).success).toBe(true);
    expect(buildingSellSchema.safeParse({ id: 65535 }).success).toBe(true);
    for (const bad of [{}, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: 65536 }, { id: "1" }, { id: 1, refund: 999 }, { id: 1, owner: "p0" }, null]) {
      expect(buildingSellSchema.safeParse(bad).success).toBe(false);
    }
    expect(C2S.BUILDING_SELL).toBe("building.sell");
    expect(S2C.BUILDING_SELL_REFUSED).toBe("building.sell_refused");
  });
});
