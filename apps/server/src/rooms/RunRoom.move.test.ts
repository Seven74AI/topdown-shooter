import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION,
  DOWNTOWN_MAP,
  moveError,
  BYTES,
  C2S,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  type BuildingMoveRefused,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 5.22 integration: `building.move` → validated move, the schema's new spot seen by both clients, refusals to the sender. */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

const options = (intent: "create" | "join", name: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken: randomBytes(16).toString("hex"),
});

function record(client: RunSdkRoom) {
  const events: SimEventsFlushed[] = [];
  const refused: BuildingMoveRefused[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_REPAIR_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_UPGRADE_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_SELL_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_MOVE_REFUSED, (m: BuildingMoveRefused) => refused.push(m));
  return { events, refused };
}

async function startTwo() {
  vi.stubEnv("DEV_NO_WAVES", "0");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostRec = record(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  const guestRec = record(guest);
  await guest.waitForInitialState();
  for (const c of [host, guest]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { host, guest, room, hostRec, guestRec };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

/** A legal new spot for building 1 near its own (rotation `rot`), found with the shared rule. */
function freeSpot(w: ReturnType<typeof world>, rot: number): { id: number; gx: number; gy: number; rot: number; seq: number } {
  for (let dy = 2; dy < 30; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const req = { id: 1, gx: 12 + dx, gy: 30 + dy, rot, seq: 1 };
      if (req.gx >= 0 && moveError(w, "p0", req) === null) return req;
    }
  }
  throw new Error("no free spot");
}

describe("RunRoom move (Story 5.22)", () => {
  it("move round trip: both clients see the new spot (same id, HP kept), building.moved is forwarded, free; the same spot again is accepted silently", async () => {
    const { host, guest, room, hostRec } = await startTwo();
    const w = world(room);
    const me = w.players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 500;
    host.send(C2S.BUILDING_PLACE, { type: "wood_barricade", gx: 12, gy: 30, rot: 0 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.type).toBe("wood_barricade"));
    const b = w.buildings.list[0];
    if (!b) throw new Error("b");
    b.hp = 77;
    const to = freeSpot(w, 1);
    host.send(C2S.BUILDING_MOVE, to);
    for (const c of [host, guest]) {
      await vi.waitFor(() => {
        const s = c.state.buildings.get("1");
        expect([s?.gx, s?.gy, s?.rot, s?.hp]).toEqual([to.gx, to.gy, 1, 77]);
      });
    }
    expect(me.wallet).toBe(460);
    await vi.waitFor(() => expect(hostRec.events.flatMap((m) => m.events).filter((t) => t[0] === NET_EVENT_KIND.BUILDING_MOVED)).toHaveLength(1));
    const moved = hostRec.events.flatMap((m) => m.events).filter((t) => t[0] === NET_EVENT_KIND.BUILDING_MOVED);
    expect(moved[0]?.slice(0, 6)).toEqual([NET_EVENT_KIND.BUILDING_MOVED, 1, 0, to.gx, to.gy, 1]);
    host.send(C2S.BUILDING_MOVE, to);
    host.send(C2S.BUILDING_MOVE, to);
    await new Promise((r) => setTimeout(r, 200));
    expect(hostRec.refused).toEqual([]);
    expect(w.buildings.list).toHaveLength(1);
  });

  it("refusals to the sender only: a teammate (not_owner), onto a player (blocked), downed (not_alive), a wave (not_build_phase); malformed dropped", async () => {
    const { host, guest, room, hostRec, guestRec } = await startTwo();
    const w = world(room);
    const me = w.players.get("p0");
    const bo = w.players.get("p1");
    if (!me || !bo) throw new Error("players");
    me.wallet = 500;
    host.send(C2S.BUILDING_PLACE, { type: "wood_barricade", gx: 12, gy: 30, rot: 0 });
    await vi.waitFor(() => expect(guest.state.buildings.size).toBe(1));
    guest.send(C2S.BUILDING_MOVE, { id: 1, gx: 14, gy: 34, rot: 0, seq: 3 });
    await vi.waitFor(() => expect(guestRec.refused).toEqual([{ id: 1, reason: "not_owner", seq: 3 }]));
    for (const bad of [{ id: 0, gx: 1, gy: 1, rot: 0, seq: 1 }, { id: 1, gx: 300, gy: 1, rot: 0, seq: 1 }, { id: 1, gx: 1, gy: 1, rot: 0, seq: 1, hp: 999 }, { id: 1, gx: 1, gy: 1, rot: 0 }]) guest.send(C2S.BUILDING_MOVE, bad);
    // onto Bo (B4: a wall can't seal a teammate in)
    const gx = Math.round((bo.x - 1) / 0.5);
    const gy = Math.round((bo.y - 0.25) / 0.5);
    host.send(C2S.BUILDING_MOVE, { id: 1, gx, gy, rot: 0, seq: 4 });
    await vi.waitFor(() => expect(hostRec.refused).toEqual([{ id: 1, reason: "blocked", seq: 4 }]));
    const to = freeSpot(w, 0);
    me.status = "downed";
    host.send(C2S.BUILDING_MOVE, to);
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(2));
    expect(hostRec.refused[1]).toEqual({ id: 1, reason: "not_alive", seq: 1 });
    me.status = "alive";
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    host.send(C2S.BUILDING_MOVE, to);
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(3));
    expect(hostRec.refused[2]).toEqual({ id: 1, reason: "not_build_phase", seq: 1 });
    expect(guestRec.refused).toHaveLength(1); // the malformed ones got no reply
    const b = w.buildings.list[0];
    expect([b?.gx, b?.gy, b?.rot]).toEqual([12, 30, 0]); // never moved
    expect(me.wallet).toBe(460);
  });
});
