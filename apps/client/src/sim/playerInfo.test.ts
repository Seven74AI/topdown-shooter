import { describe, expect, it } from "vitest";
import { catalogueParts, decodeLook, loadBalance } from "@topdown/shared";
import { resolveLook } from "../render/city/survivorLook";
import { NetSession } from "../net/session";
import { FakeRoom, fakePlayer, fakeState } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LocalSimHost } from "./LocalSimHost";
import type { SimHost } from "./SimHost";

/** Story 2.9: slot and name per player (presentation data, not in the shared PlayerState). Story 7.9: + look ("" = default until T3). */
const balance = loadBalance();

describe("SimHost.playerInfo (Story 2.9)", () => {
  it("online: slot and name from the room's schema copy; the id's slot before it arrives", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { name: "Ana" }), fakePlayer(2, { name: "Cy" })]));
    const session = new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0 });
    expect({ ...host.playerInfo("p2") }).toEqual({ slot: 2, name: "Cy", look: "" });
    expect({ ...host.playerInfo("p0") }).toEqual({ slot: 0, name: "Ana", look: "" });
    expect({ ...host.playerInfo("p3") }).toEqual({ slot: 3, name: "", look: "" });
    expect({ ...host.playerInfo("nobody") }).toEqual({ slot: 0, name: "", look: "" });
    host.dispose();
  });

  it("solo: slot 0 (blue), no name", () => {
    const host: SimHost = new LocalSimHost({ balance, seed: 1 });
    expect(host.playerInfo(host.localPlayerId)).toEqual({ slot: 0, name: "", look: "" });
    host.dispose();
  });
});

describe("Story 7.9 review M4: online, every survivor is drawn from state.look", () => {
  const MINE = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
  const HERS = "v1|top:puffer|head:headph|hair:curly|pack:duffel|skin:7|c:112233,445566,778899";

  it("L2: the wearer's own view and a teammate's both read the server's code", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { name: "Ana", look: MINE }), fakePlayer(1, { name: "Bo", look: HERS })]));
    const session = new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {});
    const host = new NetSimHost({ balance, session, now: () => 0 });
    expect(host.playerInfo(host.localPlayerId).look).toBe(MINE); // my own survivor: state.look, never a cached code
    expect(host.playerInfo("p1").look).toBe(HERS);
    expect(host.playerInfo("nobody").look).toBe("");
    host.dispose();
  });

  it("L6: two phones in one room resolve the same look for each player", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0, { look: MINE }), fakePlayer(1, { look: HERS })]));
    const a = new NetSimHost({ balance, session: new NetSession(room, { playerId: "p0", slot: 0, tickRateHz: 20 }, () => {}), now: () => 0 });
    const b = new NetSimHost({ balance, session: new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {}), now: () => 0 });
    for (const id of ["p0", "p1"]) {
      const la = resolveLook(decodeLook(a.playerInfo(id).look, catalogueParts()).look, 3);
      const lb = resolveLook(decodeLook(b.playerInfo(id).look, catalogueParts()).look, 3);
      expect(la).toEqual(lb);
      expect(la.top).toBe(id === "p0" ? "hoodie" : "puffer"); // liveness: the custom look, not the default
    }
    a.dispose();
    b.dispose();
  });
});
