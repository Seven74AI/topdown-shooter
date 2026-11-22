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
  buildingCentreX,
  buildingCentreY,
  spawnZombie,
  startWave,
  type BuildingRefused,
  type Building,
  type RunStateView,
  type SimEventsFlushed,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 3.6 integration: a turret placed through the room shoots in a wave; every client gets its shots; kills pay the owner. */
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

/** Two players in the first build phase; waves paused (`DEV_NO_WAVES=1`), the test starts the wave. */
async function startTwo() {
  vi.stubEnv("DEV_NO_WAVES", "1");
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
const kinds = (rec: { events: SimEventsFlushed[] }, kind: number) => rec.events.flatMap((m) => m.events.filter((t) => t[0] === kind));

describe("RunRoom auto-turret (Story 3.6)", () => {
  it("placed through the room: 250, 300 HP, counts toward the cap; shoots in the wave; both clients get turret.fired; the kill pays the owner 50 %", async () => {
    const { host, guest, room, hostRec, guestRec } = await startTwo();
    const w = world(room);
    const hostId = [...room.members.values()].find((m) => m.slot === 0)?.playerId ?? "p0";
    const hostP = w.players.get(hostId);
    if (!hostP) throw new Error("no host player");
    hostP.wallet = 300; // between ticks (the starting wallet is 100)
    const wallet0 = hostP.wallet;
    host.send(C2S.BUILDING_PLACE, { type: "auto_turret", gx: 30, gy: 10, rot: 0 });
    for (const c of [host, guest]) await vi.waitFor(() => expect(c.state.buildings.size).toBe(1));
    expect(hostRec.refused).toEqual([]);
    const b = w.buildings.list[0] as Building;
    expect(b).toMatchObject({ type: "auto_turret", ownerId: hostId, hp: 300, maxHp: 300, maxX: b.minX + 1, maxY: b.minY + 1 });
    expect(w.players.get(hostId)?.wallet).toBe(wallet0 - 250);
    expect(host.state.buildings.get(String(b.id))?.hp).toBe(300);

    // Build phase: a zombie in range is not shot.
    const z = spawnZombie(w, "walker", buildingCentreX(b) + 4, buildingCentreY(b));
    await new Promise((r) => setTimeout(r, 300));
    expect(kinds(hostRec, NET_EVENT_KIND.TURRET_FIRED)).toHaveLength(0);

    startWave(w); // between ticks, as the build countdown would
    const before = w.players.get(hostId)?.wallet ?? 0;
    await vi.waitFor(() => expect(w.zombies.alivePos[z]).toBe(-1), { timeout: 4000 });
    for (const rec of [hostRec, guestRec]) {
      await vi.waitFor(() => expect(kinds(rec, NET_EVENT_KIND.TURRET_FIRED).length).toBeGreaterThanOrEqual(4));
      for (const t of kinds(rec, NET_EVENT_KIND.TURRET_FIRED)) expect(t.slice(0, 2)).toEqual([NET_EVENT_KIND.TURRET_FIRED, b.id]);
      await vi.waitFor(() => expect(kinds(rec, NET_EVENT_KIND.ZOMBIE_KILLED).some((t) => t[6] === b.id)).toBe(true));
    }
    const reward = serverBalance.zombies.types.walker?.reward ?? 0;
    const pay = Math.floor(reward * serverBalance.economy.buildingKillShare);
    expect(w.players.get(hostId)?.wallet).toBe(before + pay);
    await vi.waitFor(() => expect(host.state.players.get(hostId)?.wallet).toBe(before + pay));
  });
});
