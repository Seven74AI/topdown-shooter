import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LocalSimHost } from "./LocalSimHost";
import type { SimHost } from "./SimHost";

/** Story 2.9: slot and name per player (presentation data, not in the shared PlayerState). */
const balance = loadBalance();

describe("SimHost.playerInfo (Story 2.9)", () => {
  it("online: slot and name from the room's schema copy; the id's slot before it arrives", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { name: "Ana" }), fakePlayer(2, { name: "Cy" })]));
    const session = new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0 });
    expect({ ...host.playerInfo("p2") }).toEqual({ slot: 2, name: "Cy" });
    expect({ ...host.playerInfo("p0") }).toEqual({ slot: 0, name: "Ana" });
    expect({ ...host.playerInfo("p3") }).toEqual({ slot: 3, name: "" });
    expect({ ...host.playerInfo("nobody") }).toEqual({ slot: 0, name: "" });
    host.dispose();
  });

  it("solo: slot 0 (blue), no name", () => {
    const host: SimHost = new LocalSimHost({ balance, seed: 1 });
    expect(host.playerInfo(host.localPlayerId)).toEqual({ slot: 0, name: "" });
    host.dispose();
  });
});
