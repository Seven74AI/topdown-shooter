import { describe, expect, it } from "vitest";
import type { PlayerStateView, RunStateView } from "@topdown/shared";
import { snapshotLobby } from "./lobbyStore";

describe("snapshotLobby", () => {
  it("copies players in slot order as plain data", () => {
    const players = new Map<string, PlayerStateView>([
      ["p2", { slot: 2, name: "Cid" }],
      ["p0", { slot: 0, name: "Ana" }],
    ]);
    const state: RunStateView = { phase: "lobby", hostSlot: 0, players };
    const s = snapshotLobby("ABCD", state);
    expect(s).toEqual({
      code: "ABCD",
      hostSlot: 0,
      players: [
        { playerId: "p0", slot: 0, name: "Ana" },
        { playerId: "p2", slot: 2, name: "Cid" },
      ],
    });
    expect(s.players[0]).not.toBe(players.get("p0"));
  });
});
