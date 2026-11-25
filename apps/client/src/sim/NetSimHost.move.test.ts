import { describe, expect, it } from "vitest";
import { C2S, NEUTRAL_INPUT, S2C, addPlayer, loadBalance, placeBuilding } from "@topdown/shared";
import { NetSession, parseMoveRefused } from "../net/session";
import { FakeRoom, fakePlayer, fakeState, type FakeBuilding } from "../net/fakeRoom";
import { NetSimHost } from "./NetSimHost";
import { LOCAL_PLAYER_ID, LocalSimHost } from "./LocalSimHost";

/** Story 5.22: online a move only asks (the state moves the building: the mirror and the predictor follow); solo applies it at once. */
const balance = loadBalance();
const wood = (over: Partial<FakeBuilding> = {}): FakeBuilding => ({ type: "wood_barricade", owner: "p1", gx: 10, gy: 8, rot: 0, hp: 200, trap: 0, ...over });

function setup() {
  const room = new FakeRoom(fakeState([fakePlayer(0, { x: 10, y: 10 }), fakePlayer(1, { x: 10, y: 12, wallet: 100 })]));
  room.state.phase = "build";
  const session = new NetSession(room, { playerId: "p1", slot: 1, tickRateHz: 20 }, () => {});
  const host = new NetSimHost({ balance, session, now: () => 0 });
  return { room, host };
}

describe("NetSimHost moves (Story 5.22)", () => {
  it("moveBuilding sends one building.move and changes nothing locally; the state's new spot relocates the mirror (same id, HP kept, footprint, versions)", () => {
    const { room, host } = setup();
    room.state.buildings.set("4", wood({ hp: 120 }));
    room.patch();
    host.update(1 / 60);
    const b = host.world.buildings.list[0];
    if (!b) throw new Error("mirror");
    host.moveBuilding({ id: 4, gx: 20, gy: 30, rot: 1 }, 9);
    expect(room.sentOf(C2S.BUILDING_MOVE)).toEqual([{ id: 4, gx: 20, gy: 30, rot: 1, seq: 9 }]);
    host.update(1 / 60);
    expect([b.gx, b.gy, b.rot]).toEqual([10, 8, 0]); // server truth until the patch
    const v = host.world.buildings.version;
    const wv = host.world.buildings.wallVersion;
    const s = room.state.buildings.get("4");
    if (!s) throw new Error("state");
    s.gx = 20;
    s.gy = 30;
    s.rot = 1;
    room.patch();
    host.update(1 / 60);
    const after = host.world.buildings.list[0];
    expect(after).toBe(b); // the same object: moved in place
    expect([after?.id, after?.gx, after?.gy, after?.rot, after?.hp]).toEqual([4, 20, 30, 1, 120]);
    expect([after?.minX, after?.minY, after?.maxX, after?.maxY]).toEqual([10, 15, 10.5, 17]); // rot 1: 0.5 × 2 m
    expect([host.world.buildings.version - v, host.world.buildings.wallVersion - wv]).toEqual([1, 1]);
    host.update(1 / 60);
    expect(host.world.buildings.version - v).toBe(1); // no churn
  });

  it("review L4: a rotation-only move (same corner, new rot) relocates the mirror's footprint too", () => {
    const { room, host } = setup();
    room.state.buildings.set("4", wood());
    room.patch();
    host.update(1 / 60);
    const b = host.world.buildings.list[0];
    const wv = host.world.buildings.wallVersion;
    const s = room.state.buildings.get("4");
    if (!b || !s) throw new Error("setup");
    s.rot = 1;
    room.patch();
    host.update(1 / 60);
    expect([b.gx, b.gy, b.rot]).toEqual([10, 8, 1]);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([5, 4, 5.5, 6]); // 0.5 × 2 m now
    expect(host.world.buildings.wallVersion - wv).toBe(1);
  });

  it("the predictor collides with the moved building's new spot (and no longer with the old one)", () => {
    const { room, host } = setup();
    room.state.tick = 1;
    room.state.buildings.set("1", wood({ gx: 18, gy: 16 })); // [9, 11] × [8, 8.5]; I stand at (10, 12)
    room.patch();
    const s = room.state.buildings.get("1");
    if (!s) throw new Error("state");
    s.gy = 20; // moved to [9, 11] × [10, 10.5]
    room.state.tick = 2;
    room.patch();
    for (let i = 0; i < 40; i++) {
      host.setLocalInput({ ...NEUTRAL_INPUT, moveY: -1, aimY: -1 });
      host.update(0.05);
    }
    expect(host.predictor.y).toBeCloseTo(10.5 + balance.player.radiusM, 9);
  });

  it("a building.move_refused comes back once (id + reason) through takeMoveRefusal, oldest first; malformed ones are dropped; none after dispose", () => {
    const { room, host } = setup();
    room.deliver(S2C.BUILDING_MOVE_REFUSED, { id: 4, reason: "blocked", seq: 3 });
    room.deliver(S2C.BUILDING_MOVE_REFUSED, { id: 5, reason: "not_owner", seq: 4 });
    room.deliver(S2C.BUILDING_MOVE_REFUSED, { id: 4, reason: "castle", seq: 5 });
    room.deliver(S2C.BUILDING_MOVE_REFUSED, { reason: "blocked", seq: 6 });
    room.deliver(S2C.BUILDING_MOVE_REFUSED, { id: 4, reason: "blocked" }); // no seq: dropped (review L3)
    expect(host.takeMoveRefusal()).toEqual({ id: 4, reason: "blocked", seq: 3 });
    expect(host.takeMoveRefusal()).toEqual({ id: 5, reason: "not_owner", seq: 4 });
    expect(host.takeMoveRefusal()).toBeNull();
    expect(parseMoveRefused({ id: 1, reason: "not_build_phase", seq: 0 })).toEqual({ id: 1, reason: "not_build_phase", seq: 0 });
    expect(parseMoveRefused({ id: 0, reason: "gone", seq: 1 })).toBeNull();
    expect(parseMoveRefused({ id: 1, reason: "gone", seq: -1 })).toBeNull(); // re-review nit
    expect(parseMoveRefused({ id: 1, reason: "gone", seq: 1.5 })).toBeNull();
    expect(parseMoveRefused(null)).toBeNull();
    host.dispose();
    host.moveBuilding({ id: 4, gx: 1, gy: 1, rot: 0 }, 1);
    room.deliver(S2C.BUILDING_MOVE_REFUSED, { id: 4, reason: "gone", seq: 1 });
    expect(room.sentOf(C2S.BUILDING_MOVE)).toEqual([]);
    expect(host.takeMoveRefusal()).toBeNull();
  });
});

describe("LocalSimHost moves (Story 5.22)", () => {
  it("solo moves at once with the shared rules (free); a refused move comes back once with its id", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    addPlayer(host.world, LOCAL_PLAYER_ID, 24, 16);
    const r = placeBuilding(host.world, LOCAL_PLAYER_ID, { type: "wood_barricade", gx: 40, gy: 22, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    const me = host.world.players.get(LOCAL_PLAYER_ID);
    const before = me?.wallet ?? 0;
    host.moveBuilding({ id: r.value.id, gx: 41, gy: 22, rot: 0 }, 1); // 0.5 m along: onto its own old footprint
    expect(host.takeMoveRefusal()).toBeNull();
    expect([r.value.gx, r.value.gy, me?.wallet]).toEqual([41, 22, before]);
    host.moveBuilding({ id: r.value.id, gx: 46, gy: 31, rot: 0 }, 2); // onto me at (24, 16)
    expect(host.takeMoveRefusal()).toEqual({ id: r.value.id, reason: "blocked", seq: 2 });
    expect(host.takeMoveRefusal()).toBeNull();
  });
});
