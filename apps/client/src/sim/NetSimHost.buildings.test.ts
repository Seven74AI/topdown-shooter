import { describe, expect, it } from "vitest";
import { C2S, NEUTRAL_INPUT, S2C, addPlayer, loadBalance } from "@topdown/shared";
import { NetSession } from "../net/session";
import { DevThrottle } from "../net/devThrottle";
import { FakeRoom, fakePlayer, fakeState, type FakeBuilding } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LOCAL_PLAYER_ID, LocalSimHost } from "./LocalSimHost";

/** Story 3.4: buildings in the mirror and the predictor; placement requests and refusals. */
const balance = loadBalance();
const wood = (over: Partial<FakeBuilding> = {}): FakeBuilding => ({ type: "wood_barricade", owner: "p0", gx: 10, gy: 8, rot: 0, hp: 200, trap: 0, ...over });

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 10, y: 12, ackSeq: 0 })]));
  room.state.phase = "build";
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost buildings (Story 3.4)", () => {
  it("mirrors the state's buildings into its World (add, HP, remove) in id order", () => {
    const { room, host } = setup();
    room.state.buildings.set("7", wood({ gx: 20 }));
    room.state.buildings.set("3", wood({ owner: "p1", rot: 1 }));
    room.patch();
    host.update(1 / 60);
    expect(host.world.buildings.list.map((b) => [b.id, b.ownerId, b.gx, b.rot, b.hp])).toEqual([
      [3, "p1", 10, 1, 200],
      [7, "p0", 20, 0, 200],
    ]);
    const v = host.world.buildings.version;
    host.update(1 / 60);
    expect(host.world.buildings.version).toBe(v); // nothing changed: no churn
    const b7 = room.state.buildings.get("7");
    if (b7) b7.hp = 150;
    room.state.buildings.delete("3");
    host.update(1 / 60);
    expect(host.world.buildings.list.map((b) => [b.id, b.hp])).toEqual([[7, 150]]);
  });

  it("Story 5.14: a bear trap's jaws follow the state (open/closed from schema, version +1 for the renderers)", () => {
    const { room, host } = setup();
    room.state.buildings.set("5", { type: "bear_trap", owner: "p0", gx: 20, gy: 20, rot: 0, hp: 100, trap: 2 });
    room.patch();
    host.update(1 / 60);
    const b = host.world.buildings.list.find((x) => x.id === 5);
    expect(b?.trapState).toBe(2); // a late join / slept tab sees the sprung trap (F10)
    const v = host.world.buildings.version;
    const s = room.state.buildings.get("5");
    if (s) s.trap = 0;
    host.update(1 / 60);
    expect(b?.trapState).toBe(0);
    expect(host.world.buildings.version).toBe(v + 1);
    host.update(1 / 60);
    expect(host.world.buildings.version).toBe(v + 1); // no churn
  });

  it("the predictor gets the buildings of each snapshot before it replays (my survivor stops at them)", () => {
    const { room, host } = setup();
    room.state.tick = 1;
    room.state.buildings.set("1", wood({ gx: 18, gy: 16 })); // [9, 11] × [8, 8.5]; I stand at (10, 12)
    room.patch();
    expect(host.predictor.buildingCount).toBe(1);
    for (let i = 0; i < 40; i++) {
      host.setLocalInput({ ...NEUTRAL_INPUT, moveY: -1, aimY: -1 });
      host.update(0.05);
    }
    expect(host.predictor.y).toBeCloseTo(8.5 + balance.player.radiusM, 9);
    expect(host.world.players.get("p1")?.y).toBeGreaterThanOrEqual(8.5 + balance.player.radiusM - 1e-9);
  });

  it("placeBuilding sends building.place; building.refused comes back through takePlaceRefusal once", () => {
    const { room, host } = setup();
    host.placeBuilding({ type: "wood_barricade", gx: 12, gy: 9, rot: 3 });
    expect(room.sentOf(C2S.BUILDING_PLACE)).toEqual([{ type: "wood_barricade", gx: 12, gy: 9, rot: 3 }]);
    expect(host.takePlaceRefusal()).toBeNull();
    room.deliver(S2C.BUILDING_REFUSED, { reason: "limit" });
    room.deliver(S2C.BUILDING_REFUSED, { reason: "nonsense" }); // malformed: dropped
    expect(host.takePlaceRefusal()).toBe("limit");
    expect(host.takePlaceRefusal()).toBeNull();
    host.dispose();
    room.deliver(S2C.BUILDING_REFUSED, { reason: "money" });
    expect(host.takePlaceRefusal()).toBeNull();
  });

  it("Story 5.9: upgradeBuilding sends building.upgrade; the mirror (and the predictor) show the new tier only when the state does; a refusal comes back once", () => {
    const { room, host } = setup();
    room.state.buildings.set("4", wood({ owner: "p1" }));
    room.patch();
    host.update(1 / 60);
    host.upgradeBuilding(4);
    expect(room.sentOf(C2S.BUILDING_UPGRADE)).toEqual([{ id: 4 }]);
    host.update(1 / 60);
    expect(host.world.buildings.list[0]?.type).toBe("wood_barricade"); // pending: nothing predicted
    const b = room.state.buildings.get("4");
    if (b) {
      b.type = "reinforced_barricade";
      b.hp = 350;
    }
    room.state.tick = 2;
    room.patch();
    host.update(1 / 60);
    const m = host.world.buildings.list[0];
    expect([m?.id, m?.type, m?.hp, m?.maxHp, m?.solid]).toEqual([4, "reinforced_barricade", 350, 350, true]);
    expect(host.predictor.buildingCount).toBe(1);
    room.deliver(S2C.BUILDING_UPGRADE_REFUSED, { id: 4, reason: "money" });
    expect(host.takeUpgradeRefusal()).toBe("money");
    expect(host.takeUpgradeRefusal()).toBeNull();
    room.deliver(S2C.BUILDING_UPGRADE_REFUSED, { id: 4, reason: "bogus" });
    expect(host.takeUpgradeRefusal()).toBeNull();
  });

  it("the dev throttle copies buildings (all BUILDING_STATE_FIELDS) and drops removed ones", () => {
    const room = new FakeRoom(fakeState([fakePlayer(0)]));
    room.state.buildings.set("1", wood({ hp: 120, rot: 2 }));
    let now = 0;
    const throttle = new DevThrottle(room, { lagMs: 100, jitterMs: 0, random: () => 0.5, now: () => now });
    room.patch();
    now = 50;
    throttle.pump(50);
    expect(throttle.state.buildings.get("1")).toEqual(wood({ hp: 120, rot: 2 }));
    room.state.buildings.delete("1");
    room.patch();
    now = 100;
    throttle.pump(100);
    expect(throttle.state.buildings.size).toBe(0);
  });
});

describe("LocalSimHost placement (Story 3.4)", () => {
  it("places at once in a build phase; a refusal is taken once", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    host.placeBuilding({ type: "wood_barricade", gx: 46, gy: 24, rot: 0 }); // [23, 25] × [12, 12.5]
    expect(host.takePlaceRefusal()).toBeNull();
    expect(host.world.buildings.list).toHaveLength(1);
    expect(host.world.players.get(LOCAL_PLAYER_ID)?.wallet).toBe(balance.economy.startingWallet - 40);
    host.placeBuilding({ type: "wood_barricade", gx: 46, gy: 32, rot: 0 }); // [23, 25] × [16, 16.5]: on me
    expect(host.takePlaceRefusal()).toBe("blocked");
    expect(host.takePlaceRefusal()).toBeNull();
    host.update(0.05);
    const events = host.drainEvents();
    expect(events.filter((e) => e.type === "building.placed")).toHaveLength(1);
  });
});
