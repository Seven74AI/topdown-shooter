import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION,
  DOWNTOWN_MAP,
  BYTES,
  C2S,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  type BuildingSellRefused,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 5.20 integration: `building.sell` → validated take back / sell, the schema removal seen by both clients, refusals to the sender. */
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
  const refused: BuildingSellRefused[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_REPAIR_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_UPGRADE_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_SELL_REFUSED, (m: BuildingSellRefused) => refused.push(m));
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

describe("RunRoom take back / sell (Story 5.20)", () => {
  it("take back round trip: 100 % back, both clients lose the building, building.sold is forwarded; a repeat is gone (refunded once)", async () => {
    const { host, guest, room, hostRec } = await startTwo();
    const me = world(room).players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 500;
    host.send(C2S.BUILDING_PLACE, { type: "wood_barricade", gx: 12, gy: 30, rot: 0 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.type).toBe("wood_barricade"));
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.wallet).toBe(460));
    host.send(C2S.BUILDING_SELL, { id: 1 });
    host.send(C2S.BUILDING_SELL, { id: 1 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.size).toBe(0));
    await vi.waitFor(() => expect(guest.state.players.get("p0")?.wallet).toBe(500));
    await vi.waitFor(() => expect(hostRec.refused).toEqual([{ id: 1, reason: "gone" }]));
    expect(me.wallet).toBe(500);
    const sold = hostRec.events.flatMap((m) => m.events).filter((t) => t[0] === NET_EVENT_KIND.BUILDING_SOLD);
    expect(sold.map((t) => t.slice(0, 4))).toEqual([[NET_EVENT_KIND.BUILDING_SOLD, 1, 0, 40]]);
  });

  it("refusals to the sender only: a teammate (not_owner), downed (not_alive), a wave (not_build_phase); malformed dropped", async () => {
    const { host, guest, room, hostRec, guestRec } = await startTwo();
    const w = world(room);
    const me = w.players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 500;
    host.send(C2S.BUILDING_PLACE, { type: "wood_barricade", gx: 12, gy: 30, rot: 0 });
    await vi.waitFor(() => expect(guest.state.buildings.size).toBe(1));
    guest.send(C2S.BUILDING_SELL, { id: 1 });
    await vi.waitFor(() => expect(guestRec.refused).toEqual([{ id: 1, reason: "not_owner" }]));
    guest.send(C2S.BUILDING_SELL, { id: 0 });
    guest.send(C2S.BUILDING_SELL, { id: 1, refund: 999 });
    guest.send(C2S.BUILDING_SELL, { id: "1" });
    me.status = "downed";
    host.send(C2S.BUILDING_SELL, { id: 1 });
    await vi.waitFor(() => expect(hostRec.refused).toEqual([{ id: 1, reason: "not_alive" }]));
    me.status = "alive";
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    host.send(C2S.BUILDING_SELL, { id: 1 });
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(2));
    expect(hostRec.refused[1]).toEqual({ id: 1, reason: "not_build_phase" });
    expect(guestRec.refused).toHaveLength(1); // the malformed ones got no reply
    expect(w.buildings.list).toHaveLength(1);
    expect(me.wallet).toBe(460);
  });
});
