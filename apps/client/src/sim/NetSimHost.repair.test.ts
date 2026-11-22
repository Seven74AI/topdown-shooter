import { describe, expect, it } from "vitest";
import { C2S, S2C, addPlayer, loadBalance, placeBuilding } from "@topdown/shared";
import { NetSession, parseRepairRefused } from "../net/session";
import { FakeRoom, fakePlayer, fakeState, type FakeBuilding } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LOCAL_PLAYER_ID, LocalSimHost } from "./LocalSimHost";

/** Story 3.7: online a repair only asks (the state brings HP and wallet); solo applies it at once. */
const balance = loadBalance();
const wood = (over: Partial<FakeBuilding> = {}): FakeBuilding => ({ type: "wood_barricade", owner: "p0", gx: 10, gy: 8, rot: 0, hp: 200, ...over });

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 10, y: 12, wallet: 100 })]));
  room.state.phase = "build";
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost repairs (Story 3.7)", () => {
  it("repairBuilding sends one building.repair with the id and changes nothing locally; the state brings HP and wallet", () => {
    const { room, host } = setup();
    room.state.buildings.set("4", wood({ hp: 60 }));
    room.patch();
    host.update(1 / 60);
    host.repairBuilding(4);
    expect(room.sentOf(C2S.BUILDING_REPAIR)).toEqual([{ id: 4 }]);
    host.update(1 / 60);
    expect(host.world.buildings.list[0]?.hp).toBe(60);
    const b = room.state.buildings.get("4");
    if (b) b.hp = 200;
    const me = room.state.players.get("p1");
    if (me) me.wallet = 80;
    room.patch();
    host.update(1 / 60);
    expect(host.world.buildings.list[0]?.hp).toBe(200);
    expect(host.world.players.get("p1")?.wallet).toBe(80);
  });

  it("a building.repair_refused comes back once through takeRepairRefusal; malformed ones are dropped; none after dispose", () => {
    const { room, host } = setup();
    room.deliver(S2C.BUILDING_REPAIR_REFUSED, { id: 4, reason: "money" });
    expect(host.takeRepairRefusal()).toBe("money");
    expect(host.takeRepairRefusal()).toBeNull();
    room.deliver(S2C.BUILDING_REPAIR_REFUSED, { id: 4, reason: "castle" });
    expect(host.takeRepairRefusal()).toBeNull();
    expect(parseRepairRefused({ id: 1, reason: "gone" })).toBe("gone");
    expect(parseRepairRefused(null)).toBeNull();
    host.dispose();
    host.repairBuilding(4);
    room.deliver(S2C.BUILDING_REPAIR_REFUSED, { id: 4, reason: "full_hp" });
    expect(room.sentOf(C2S.BUILDING_REPAIR)).toEqual([]);
    expect(host.takeRepairRefusal()).toBeNull();
  });
});

describe("LocalSimHost repairs (Story 3.7)", () => {
  it("solo repairs at once with the shared rules; a refusal is taken once", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    const r = placeBuilding(host.world, LOCAL_PLAYER_ID, { type: "wood_barricade", gx: 24, gy: 20, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    const me = host.world.players.get(LOCAL_PLAYER_ID);
    const before = me?.wallet ?? 0;
    host.repairBuilding(r.value.id);
    expect(host.takeRepairRefusal()).toBe("full_hp");
    expect(host.takeRepairRefusal()).toBeNull();
    r.value.hp = 50;
    host.repairBuilding(r.value.id);
    expect(host.takeRepairRefusal()).toBeNull();
    expect(r.value.hp).toBe(200);
    expect(me?.wallet).toBe(before - 20);
  });
});
