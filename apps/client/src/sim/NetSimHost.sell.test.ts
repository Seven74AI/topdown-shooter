import { describe, expect, it } from "vitest";
import { C2S, S2C, addPlayer, loadBalance, placeBuilding } from "@topdown/shared";
import { NetSession, parseSellRefused } from "../net/session";
import { FakeRoom, fakePlayer, fakeState, type FakeBuilding } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LOCAL_PLAYER_ID, LocalSimHost } from "./LocalSimHost";

/** Story 5.20: online a sell only asks (the state removes the building and brings the wallet); solo applies it at once. */
const balance = loadBalance();
const wood = (over: Partial<FakeBuilding> = {}): FakeBuilding => ({ type: "wood_barricade", owner: "p1", gx: 10, gy: 8, rot: 0, hp: 200, trap: 0, ...over });

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 10, y: 12, wallet: 100 })]));
  room.state.phase = "build";
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost sells (Story 5.20)", () => {
  it("sellBuilding sends one building.sell and changes nothing locally; the state's removal takes it out of the mirror (collision follows)", () => {
    const { room, host } = setup();
    room.state.buildings.set("4", wood());
    room.patch();
    host.update(1 / 60);
    host.sellBuilding(4);
    expect(room.sentOf(C2S.BUILDING_SELL)).toEqual([{ id: 4 }]);
    host.update(1 / 60);
    expect(host.world.buildings.list.map((b) => b.id)).toEqual([4]); // server truth until the patch
    room.state.buildings.delete("4");
    const me = room.state.players.get("p1");
    if (me) me.wallet = 140;
    room.patch();
    host.update(1 / 60);
    expect(host.world.buildings.list).toHaveLength(0);
    expect(host.world.players.get("p1")?.wallet).toBe(140);
  });

  it("a building.sell_refused comes back once through takeSellRefusal; malformed ones are dropped; none after dispose", () => {
    const { room, host } = setup();
    room.deliver(S2C.BUILDING_SELL_REFUSED, { id: 4, reason: "not_owner" });
    expect(host.takeSellRefusal()).toBe("not_owner");
    expect(host.takeSellRefusal()).toBeNull();
    room.deliver(S2C.BUILDING_SELL_REFUSED, { id: 4, reason: "castle" });
    expect(host.takeSellRefusal()).toBeNull();
    expect(parseSellRefused({ id: 1, reason: "not_alive" })).toBe("not_alive");
    expect(parseSellRefused(null)).toBeNull();
    host.dispose();
    host.sellBuilding(4);
    room.deliver(S2C.BUILDING_SELL_REFUSED, { id: 4, reason: "gone" });
    expect(room.sentOf(C2S.BUILDING_SELL)).toEqual([]);
    expect(host.takeSellRefusal()).toBeNull();
  });
});

describe("LocalSimHost sells (Story 5.20)", () => {
  it("solo takes back at once with the shared rules (100 % this phase); a repeat is refused once as gone", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    const r = placeBuilding(host.world, LOCAL_PLAYER_ID, { type: "wood_barricade", gx: 40, gy: 22, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    const me = host.world.players.get(LOCAL_PLAYER_ID);
    const before = me?.wallet ?? 0;
    host.sellBuilding(r.value.id);
    expect(host.takeSellRefusal()).toBeNull();
    expect(host.world.buildings.list).toHaveLength(0);
    expect(me?.wallet).toBe(before + 40);
    host.sellBuilding(r.value.id);
    expect(host.takeSellRefusal()).toBe("gone");
    expect(host.takeSellRefusal()).toBeNull();
  });
});
