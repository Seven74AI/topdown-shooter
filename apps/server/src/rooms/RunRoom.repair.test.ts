import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  BYTES,
  C2S,
  NET_EVENT_KIND,
  RUN_ROOM_NAME,
  S2C,
  removeBuilding,
  type BuildingRepairRefused,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { MAX_OTHER_MESSAGES_PER_S } from "../net/limits";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.7 integration: `building.repair` → validated repair, HP and wallets on every client, refusals to the sender. */
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
  guestToken: randomBytes(16).toString("hex"),
});

function record(client: RunSdkRoom) {
  const events: SimEventsFlushed[] = [];
  const refused: BuildingRepairRefused[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, () => {});
  client.onMessage(S2C.BUILDING_REPAIR_REFUSED, (m: BuildingRepairRefused) => refused.push(m));
  return { events, refused };
}

/** Two players, started (first build phase, real waves), with `placedHp` set by the dev switch when given. */
async function startTwo(placedHp?: string) {
  vi.stubEnv("DEV_NO_WAVES", "0");
  if (placedHp !== undefined) vi.stubEnv("DEV_PLACED_BUILDING_HP", placedHp);
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
const WOOD = "wood_barricade";
const START = serverBalance.economy.startingWallet;

/** The host (p0) places a barricade and both clients see it. Returns the server's building. */
async function hostPlaces(host: RunSdkRoom, guest: RunSdkRoom, room: RunRoom) {
  host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 12, gy: 30, rot: 0 });
  for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.size).toBe(1));
  const b = world(room).buildings.list[0];
  if (!b) throw new Error("not placed");
  return b;
}

describe("RunRoom repairs (Story 3.7)", () => {
  it("a teammate repairs my damaged barricade: full HP on both clients, the repairer pays 20, the owner nothing; building.repaired is forwarded", async () => {
    const { host, guest, room, hostRec } = await startTwo();
    const b = await hostPlaces(host, guest, room);
    b.hp = 75; // Story 3.5 will do this with zombies
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.hp).toBe(75));
    guest.send(C2S.BUILDING_REPAIR, { id: b.id });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.hp).toBe(200));
    await vi.waitFor(() => expect(host.state.players.get("p1")?.wallet).toBe(START - 20));
    expect(host.state.players.get("p0")?.wallet).toBe(START - 40); // only the placement
    expect(host.state.buildings.get("1")?.owner).toBe("p0");
    await vi.waitFor(() => expect(hostRec.events.flatMap((m) => m.events).some((t) => t[0] === NET_EVENT_KIND.BUILDING_REPAIRED)).toBe(true));
    const t = hostRec.events.flatMap((m) => m.events).find((e) => e[0] === NET_EVENT_KIND.BUILDING_REPAIRED);
    expect(t).toEqual([NET_EVENT_KIND.BUILDING_REPAIRED, b.id, 1, 20, Math.round(((b.minX + b.maxX) / 2) * 100), Math.round(((b.minY + b.maxY) / 2) * 100)]);
  });

  it("refuses to the sender only (full HP, not enough money, gone, a wave); nothing changes", async () => {
    const { host, guest, room, hostRec, guestRec } = await startTwo();
    const b = await hostPlaces(host, guest, room);
    host.send(C2S.BUILDING_REPAIR, { id: b.id });
    await vi.waitFor(() => expect(hostRec.refused).toEqual([{ id: b.id, reason: "full_hp" }]));
    b.hp = 10;
    const me = world(room).players.get("p0");
    if (!me) throw new Error("no p0");
    me.wallet = 19;
    host.send(C2S.BUILDING_REPAIR, { id: b.id });
    await vi.waitFor(() => expect(hostRec.refused.map((r) => r.reason)).toEqual(["full_hp", "money"]));
    host.send(C2S.BUILDING_REPAIR, { id: 77 });
    await vi.waitFor(() => expect(hostRec.refused.map((r) => r.reason)).toEqual(["full_hp", "money", "gone"]));
    for (const c of [host, guest]) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(host.state.phase).toBe("wave"));
    me.wallet = 1000;
    host.send(C2S.BUILDING_REPAIR, { id: b.id });
    await vi.waitFor(() => expect(hostRec.refused).toHaveLength(4));
    expect(hostRec.refused[3]).toEqual({ id: b.id, reason: "not_build_phase" });
    expect(b.hp).toBe(10);
    expect(me.wallet).toBe(1000);
    expect(guestRec.refused).toEqual([]);
  });

  it("a building destroyed before the request arrives is refused cleanly as gone", async () => {
    const { host, guest, room, hostRec } = await startTwo();
    const b = await hostPlaces(host, guest, room);
    b.hp = 1;
    removeBuilding(world(room), b.id); // Story 3.5's destruction
    guest.send(C2S.BUILDING_REPAIR, { id: b.id }); // the guest still saw it
    host.send(C2S.BUILDING_REPAIR, { id: b.id });
    await vi.waitFor(() => expect(hostRec.refused).toEqual([{ id: b.id, reason: "gone" }]));
    await vi.waitFor(() => expect(guest.state.buildings.size).toBe(0));
    expect(guest.state.players.get("p1")?.wallet).toBe(START);
    expect(room.state.phase).toBe("build");
  });

  it("malformed messages are dropped by the guard (no reply); a burst of 40 (> 25/s) repairs once and the rest is refused or rate-dropped", async () => {
    const { host, guest, room, hostRec } = await startTwo();
    const b = await hostPlaces(host, guest, room);
    b.hp = 50;
    host.send(C2S.BUILDING_REPAIR, { id: 0 });
    host.send(C2S.BUILDING_REPAIR, { id: 1.5 });
    host.send(C2S.BUILDING_REPAIR, { id: b.id, cost: 0 });
    host.send(C2S.BUILDING_REPAIR, {});
    const tick0 = world(room).tick;
    await vi.waitFor(() => expect(world(room).tick).toBeGreaterThan(tick0 + 2));
    expect(hostRec.refused).toEqual([]);
    expect(b.hp).toBe(50);
    await new Promise((r) => setTimeout(r, 1100)); // let the shared bucket refill after the junk
    for (let i = 0; i < 40; i++) host.send(C2S.BUILDING_REPAIR, { id: b.id });
    await vi.waitFor(() => expect(b.hp).toBe(200));
    const tick = world(room).tick;
    await vi.waitFor(() => expect(world(room).tick).toBeGreaterThan(tick + 4));
    expect(world(room).players.get("p0")?.wallet).toBe(START - 40 - 20);
    expect(hostRec.refused.every((r) => r.reason === "full_hp")).toBe(true);
    expect(1 + hostRec.refused.length).toBeLessThanOrEqual(MAX_OTHER_MESSAGES_PER_S + 1);
  });

  it("DEV_PLACED_BUILDING_HP=0.5 places buildings at half HP (dev switch for browser checks)", async () => {
    const { host, guest, room } = await startTwo("0.5");
    const b = await hostPlaces(host, guest, room);
    expect(b.hp).toBe(100);
    await vi.waitFor(() => expect(guest.state.buildings.get("1")?.hp).toBe(100));
  });
});
