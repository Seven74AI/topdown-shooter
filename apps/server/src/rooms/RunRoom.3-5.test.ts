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
  damageBuilding,
  type BuildingRefused,
  type Building,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.5 integration: building damage and destruction reach every client (schema HP on change, removal, `building.destroyed`). */
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
  const refused: string[] = [];
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => events.push(m));
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, (m: BuildingRefused) => refused.push(m.reason));
  return { events, refused };
}

/** Two players, started: the run is in its first build phase (real waves, 30 s countdown). */
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
const WOOD = "wood_barricade";

describe("RunRoom building damage (Story 3.5)", () => {
  it("damage goes out as HP on change; 0 HP removes it on both clients and forwards building.destroyed", async () => {
    const { host, guest, room, hostRec, guestRec } = await startTwo();
    host.send(C2S.BUILDING_PLACE, { type: WOOD, gx: 12, gy: 34, rot: 0 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.size).toBe(1));
    const b = world(room).buildings.list[0] as Building;
    // Between ticks, as a zombie hit would be inside one (the zombie rule itself: zombieAi.pathing.test.ts).
    damageBuilding(world(room), b, 30);
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.get("1")?.hp).toBe(170));
    const version = world(room).buildings.version;
    expect(damageBuilding(world(room), b, 500)).toBe(true);
    expect(world(room).buildings.list).toHaveLength(0);
    expect(world(room).buildings.version).toBe(version + 1);
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.size).toBe(0));
    for (const rec of [hostRec, guestRec]) {
      await vi.waitFor(() => expect(rec.events.flatMap((e) => e.events).some((t) => t[0] === NET_EVENT_KIND.BUILDING_DESTROYED)).toBe(true));
      const t = rec.events.flatMap((e) => e.events).find((e) => e[0] === NET_EVENT_KIND.BUILDING_DESTROYED);
      expect(t).toEqual([NET_EVENT_KIND.BUILDING_DESTROYED, 1, 0, 0, 12, 34, 0]);
    }
    // The field follows: the nav grid no longer holds it.
    await vi.waitFor(() => expect(world(room).pathing.nav.version).toBe(world(room).buildings.version));
    expect(world(room).pathing.nav.buildingAt.some((id) => id !== 0)).toBe(false);
  });
});
