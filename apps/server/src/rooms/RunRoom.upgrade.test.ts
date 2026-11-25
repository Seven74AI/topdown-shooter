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
  buildingTypeIds,
  type BuildingUpgradeRefused,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 5.9 integration: `building.upgrade` → validated upgrade, the schema type change seen by both clients, refusals to the sender. */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  // Story 7.4: these rooms test 5.9–5.13 rules with every item; a guest now plays the starter pool (decision 7.4 D3).
  process.env.DEV_UNLOCKS = "all";
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await colyseus.cleanup();
});
afterAll(async () => {
  delete process.env.DEV_UNLOCKS;
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
  const refused: BuildingUpgradeRefused[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_REPAIR_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_UPGRADE_REFUSED, (m: BuildingUpgradeRefused) => refused.push(m));
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

describe("RunRoom upgrades (Story 5.9)", () => {
  it("upgrade round trip: the owner pays 50, both clients see the new type at full HP (same id), building.upgraded is forwarded", async () => {
    const { host, guest, room, hostRec } = await startTwo();
    const me = world(room).players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 500;
    host.send(C2S.BUILDING_PLACE, { type: "wood_barricade", gx: 12, gy: 30, rot: 0 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.type).toBe("wood_barricade"));
    host.send(C2S.BUILDING_UPGRADE, { id: 1 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.type).toBe("reinforced_barricade"));
    await vi.waitFor(() => expect(guest.state.buildings.get("1")?.hp).toBe(350));
    expect(guest.state.players.get("p0")?.wallet).toBe(500 - 40 - 50);
    expect(guest.state.buildings.size).toBe(1);
    await vi.waitFor(() => expect(hostRec.events.flatMap((m) => m.events).some((t) => t[0] === NET_EVENT_KIND.BUILDING_UPGRADED)).toBe(true));
    const t = hostRec.events.flatMap((m) => m.events).find((e) => e[0] === NET_EVENT_KIND.BUILDING_UPGRADED);
    expect(t?.slice(0, 5)).toEqual([NET_EVENT_KIND.BUILDING_UPGRADED, 1, 0, 50, buildingTypeIds(serverBalance).indexOf("reinforced_barricade")]);
    host.send(C2S.BUILDING_UPGRADE, { id: 1 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.type).toBe("metal_barricade"));
    await vi.waitFor(() => expect(guest.state.buildings.get("1")?.hp).toBe(600));
  });

  it("refusals go to the sender only: a teammate (not_owner), the top tier (not_upgradable), a wave (not_build_phase); malformed messages are dropped", async () => {
    const { host, guest, room, hostRec, guestRec } = await startTwo();
    const me = world(room).players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 500;
    host.send(C2S.BUILDING_PLACE, { type: "wood_barricade", gx: 12, gy: 30, rot: 0 });
    await vi.waitFor(() => expect(guest.state.buildings.size).toBe(1));
    guest.send(C2S.BUILDING_UPGRADE, { id: 1 });
    await vi.waitFor(() => expect(guestRec.refused).toEqual([{ id: 1, reason: "not_owner" }]));
    guest.send(C2S.BUILDING_UPGRADE, { id: 0 });
    guest.send(C2S.BUILDING_UPGRADE, { id: 1, type: "metal_barricade" });
    host.send(C2S.BUILDING_UPGRADE, { id: 1 });
    host.send(C2S.BUILDING_UPGRADE, { id: 1 });
    host.send(C2S.BUILDING_UPGRADE, { id: 1 }); // the third finds the top tier
    await vi.waitFor(() => expect(hostRec.refused).toEqual([{ id: 1, reason: "not_upgradable" }]));
    expect(world(room).buildings.list[0]?.type).toBe("metal_barricade");
    expect(me.wallet).toBe(500 - 40 - 120); // charged once per tier
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    host.send(C2S.BUILDING_UPGRADE, { id: 1 });
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(2));
    expect(hostRec.refused[1]).toEqual({ id: 1, reason: "not_build_phase" });
    expect(guestRec.refused).toHaveLength(1); // the malformed ones got no reply
  });
});
