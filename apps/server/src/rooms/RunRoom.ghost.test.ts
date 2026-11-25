import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION, BUILD_GRID_M, BYTES, C2S, DOWNTOWN_MAP, RUN_ROOM_NAME, S2C, buildingTypeIds, placementError, type BuildingGhosted, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 5.24 integration: `building.ghost` → relayed to the OTHER clients only, build phase only, own rate bucket. */
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
  const ghosts: BuildingGhosted[] = [];
  const refused: unknown[] = [];
  for (const t of [S2C.RUN_JOINED, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.BUILDING_REPAIR_REFUSED, S2C.BUILDING_UPGRADE_REFUSED, S2C.BUILDING_SELL_REFUSED, S2C.BUILDING_MOVE_REFUSED, S2C.SHOP_OFFERED, S2C.PLAYER_LEFT]) client.onMessage(t, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.BUILDING_REFUSED, (m: unknown) => refused.push(m));
  client.onMessage(S2C.BUILDING_GHOSTED, (m: BuildingGhosted) => ghosts.push([...m]));
  return { ghosts, refused };
}

async function startThree() {
  vi.stubEnv("DEV_NO_WAVES", "0");
  const host = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana"));
  const hostRec = record(host);
  await host.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
  const guest = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Bo"));
  const guestRec = record(guest);
  await guest.waitForInitialState();
  const third = await colyseus.sdk.joinById<RunStateView>(host.roomId, options("join", "Cy"));
  const thirdRec = record(third);
  await third.waitForInitialState();
  const all = [host, guest, third];
  for (const c of all) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of all) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { host, guest, third, room, all, hostRec, guestRec, thirdRec };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

/** A lattice spot `dx` m right of player `id`. */
function near(room: RunRoom, id: string, dx: number): { gx: number; gy: number } {
  const p = world(room).players.get(id);
  if (!p) throw new Error(id);
  return { gx: Math.round((p.x + dx) / BUILD_GRID_M), gy: Math.round(p.y / BUILD_GRID_M) };
}

/** A legal barricade spot near p0, found with the shared rule. */
function freePlace(room: RunRoom): { type: string; gx: number; gy: number; rot: number } {
  const w = world(room);
  const base = near(room, "p0", 0);
  for (let dy = 3; dy < 20; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const req = { type: "wood_barricade", gx: base.gx + dx, gy: base.gy + dy, rot: 0 };
      if (placementError(w, "p0", req) === null) return req;
    }
  }
  throw new Error("no free spot");
}

const settle = () => new Promise((r) => setTimeout(r, 200));

describe("RunRoom ghosts (Story 5.24)", () => {
  it("relays my held building to the two others (stamped with my id), never back to me; a clear too; nothing stored", async () => {
    const { host, room, hostRec, guestRec, thirdRec } = await startThree();
    const ids = buildingTypeIds(serverBalance);
    expect(ids.indexOf("auto_turret")).toBeGreaterThanOrEqual(0);
    const at = near(room, "p0", 2);
    host.send(C2S.BUILDING_GHOST, { type: "auto_turret", ...at, rot: 1 });
    for (const r of [guestRec, thirdRec]) await vi.waitFor(() => expect(r.ghosts).toEqual([[0, ids.indexOf("auto_turret"), at.gx, at.gy, 1]]));
    host.send(C2S.BUILDING_GHOST, { type: "", gx: 0, gy: 0, rot: 0 });
    for (const r of [guestRec, thirdRec]) await vi.waitFor(() => expect(r.ghosts[1]).toEqual([0, -1, 0, 0, 0]));
    await settle();
    expect(hostRec.ghosts).toEqual([]);
    expect(world(room).buildings.list).toHaveLength(0); // F7: cosmetic
    expect(room.state.buildings.size).toBe(0);
  });

  it("drops silently: far away (B4), unknown type, downed (B9, a clear still goes), spoofed id / malformed (B10, B12), a wave (B3)", async () => {
    const { host, guest, all, room, guestRec } = await startThree();
    const w = world(room);
    host.send(C2S.BUILDING_GHOST, { type: "wood_barricade", ...near(room, "p0", 30), rot: 0 });
    host.send(C2S.BUILDING_GHOST, { type: "tank", ...near(room, "p0", 2), rot: 0 });
    host.send(C2S.BUILDING_GHOST, { type: "mine", ...near(room, "p0", 2), rot: 0, playerId: "p1" });
    host.send(C2S.BUILDING_GHOST, { type: "mine", gx: 300, gy: 1, rot: 0 });
    await settle();
    expect(guestRec.ghosts).toEqual([]);
    const me = w.players.get("p0");
    if (!me) throw new Error("p0");
    me.status = "downed";
    await settle(); // the ghost bucket refills (5/s)
    host.send(C2S.BUILDING_GHOST, { type: "mine", ...near(room, "p0", 2), rot: 0 });
    host.send(C2S.BUILDING_GHOST, { type: "", gx: 0, gy: 0, rot: 0 });
    await vi.waitFor(() => expect(guestRec.ghosts).toHaveLength(1));
    expect(guestRec.ghosts[0]?.[1]).toBe(-1);
    me.status = "alive";
    for (const c of all) c.send(C2S.BUILD_SET_READY, { ready: true });
    await vi.waitFor(() => expect(guest.state.phase).toBe("wave"));
    await settle();
    host.send(C2S.BUILDING_GHOST, { type: "mine", ...near(room, "p0", 2), rot: 0 });
    host.send(C2S.BUILDING_GHOST, { type: "", gx: 0, gy: 0, rot: 0 });
    await settle();
    expect(guestRec.ghosts).toHaveLength(1); // 0 B/s in waves
  });

  it("B1: a ghost flood (100 at once) relays at most the bucket (5) and never starves a placement right after", async () => {
    const { host, room, hostRec, guestRec } = await startThree();
    const w = world(room);
    const me = w.players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 500;
    const at = near(room, "p0", 2);
    for (let i = 0; i < 100; i++) host.send(C2S.BUILDING_GHOST, { type: "wood_barricade", gx: at.gx, gy: at.gy, rot: i % 4 });
    const spot = freePlace(room);
    host.send(C2S.BUILDING_PLACE, spot);
    await vi.waitFor(() => expect(w.buildings.list).toHaveLength(1));
    await settle();
    expect(guestRec.ghosts.length).toBeGreaterThan(0);
    expect(guestRec.ghosts.length).toBeLessThanOrEqual(6); // capacity 5 (+1 refilled during the burst at most)
    expect(hostRec.refused).toEqual([]);
  });
});
