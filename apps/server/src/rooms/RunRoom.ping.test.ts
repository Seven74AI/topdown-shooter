import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import { NET_PROTOCOL_VERSION, BYTES, C2S, DOWNTOWN_MAP, PING_KINDS, RUN_ROOM_NAME, S2C, worldDigest, type PingShown, type RunStateView } from "@topdown/shared";
import { pack } from "msgpackr";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, pingRefusal, serverBalance } from "./RunRoom";

/**
 * Story 8.7 fairness rules P1, P2, P4, P5 (integration): `ping.send { kind }` → `ping.shown [slot, kindIdx, x, y, tick]`
 * to EVERY client (the sender too), stamped with the sender's server position; 1/s own bucket; refused for out, held,
 * lobby, results and a frozen World; never stored.
 */
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
  const pings: PingShown[] = [];
  const refusedLike: unknown[] = [];
  for (const t of [S2C.RUN_JOINED, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.SHOP_OFFERED, S2C.PLAYER_LEFT, S2C.BUILDING_GHOSTED, S2C.RUN_STARTED, S2C.RUN_REWARDS])
    client.onMessage(t, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.PING_SHOWN, (m: PingShown) => pings.push([...m]));
  return { pings, refusedLike };
}

async function startThree(start = true) {
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
  if (start) {
    for (const c of all) c.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
    host.send(C2S.RUN_START, {});
    for (const c of all) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  }
  return { host, guest, third, room, all, recs: [hostRec, guestRec, thirdRec] };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};
const player = (room: RunRoom, id: string) => {
  const p = world(room).players.get(id);
  if (!p) throw new Error(id);
  return p;
};

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

describe("RunRoom pings (Story 8.7)", () => {
  it("P1 + P3: broadcast to everyone (the sender too) with the sender's slot and SERVER position at that tick; nothing stored", async () => {
    const { guest, room, recs } = await startThree();
    const me = player(room, "p1");
    me.x = 12.34;
    me.y = 7.06;
    const snapBefore = JSON.stringify([...world(room).players.keys()]);
    const buildingsBefore = world(room).buildings.list.length;
    // A modified client adds a position / slot: the strict schema makes the whole message invalid (dropped).
    guest.send(C2S.PING_SEND, { kind: "help", x: 1, y: 1 });
    guest.send(C2S.PING_SEND, { kind: "help", slot: 3 });
    guest.send(C2S.PING_SEND, { kind: "laser" });
    await settle();
    for (const r of recs) expect(r.pings).toEqual([]);
    await settle(900); // those invalid ones cost a token; the bucket refills
    const tickAt = world(room).tick;
    guest.send(C2S.PING_SEND, { kind: "big" });
    for (const r of recs) await vi.waitFor(() => expect(r.pings).toHaveLength(1));
    for (const r of recs) {
      const [slot, kindIdx, x, y, tick] = r.pings[0] as PingShown;
      // the World may have pushed the survivor out of a solid after the teleport: the server's position is the truth
      expect([slot, kindIdx, x, y]).toEqual([1, PING_KINDS.indexOf("big"), Math.round(me.x * 10), Math.round(me.y * 10)]);
      expect(x).not.toBe(0);
      // AC 9 (bandwidth): the message on the wire — the protocol byte, the type string and the msgpack array — is 24 B
      // (whole decimetres: 3 B each; a float would be 9): ≤ 4 pings/s per room → ≤ 96 B/s per phone.
      const bytes = 1 + pack(S2C.PING_SHOWN).length + pack(r.pings[0]).length;
      expect(bytes).toBeLessThanOrEqual(30);
      expect(bytes * 4).toBeLessThanOrEqual(120);
      expect(tick).toBeGreaterThanOrEqual(tickAt);
    }
    // P5: never in the World or the schema
    expect(JSON.stringify([...world(room).players.keys()])).toBe(snapBefore);
    expect(world(room).buildings.list.length).toBe(buildingsBefore);
    expect(JSON.stringify(room.state.toJSON())).not.toContain("ping");
  });

  it("P5: a ping changes nothing in the World — its snapshotWorld digest is the same right after onPing (no tick between); nothing on the event bus", async () => {
    const { room, recs } = await startThree();
    const member = [...room.members.values()].find((m) => m.playerId === "p2");
    if (!member) throw new Error("p2");
    const client = { sessionId: member.sessionId } as unknown as Parameters<RunRoom["onPing"]>[0];
    const w = world(room);
    const before = worldDigest(w);
    const events = w.events.pendingCount;
    for (const kind of PING_KINDS) room.onPing(client, { kind }); // the handler itself (the guard's rate is tested above)
    expect(worldDigest(w)).toBe(before);
    expect(w.events.pendingCount).toBe(events);
    await vi.waitFor(() => expect(recs[0]?.pings.length).toBe(4)); // liveness: they were really shown
  });

  it("P2: at most 1 per second per player (own bucket, counted as pingDropped); the shared bucket still serves build messages", async () => {
    const { host, guest, room, recs } = await startThree();
    for (let i = 0; i < 5; i++) host.send(C2S.PING_SEND, { kind: "here" });
    guest.send(C2S.PING_SEND, { kind: "ready" }); // another player's bucket is their own
    host.send(C2S.BUILD_SET_READY, { ready: true }); // shared "other" bucket unaffected
    await vi.waitFor(() => expect(recs[1]?.pings).toHaveLength(2));
    await vi.waitFor(() => expect(room.state.players.get("p0")?.buildReady).toBe(true));
    await settle();
    expect(recs[1]?.pings.map((p) => p[0]).sort()).toEqual([0, 1]);
    expect(room.pingDropped.get("p0")).toBe(4);
    expect(room.pingDropped.get("p1") ?? 0).toBe(0);
    await settle(1000);
    host.send(C2S.PING_SEND, { kind: "here" });
    await vi.waitFor(() => expect(recs[2]?.pings).toHaveLength(3));
  });

  it("P4 rule table (pingRefusal): build / wave / vote; standing or downed; not frozen, not held", () => {
    for (const ph of ["build", "wave", "vote"]) {
      expect(pingRefusal(ph, false, false, "alive")).toBeNull();
      expect(pingRefusal(ph, false, false, "downed")).toBeNull();
      expect(pingRefusal(ph, false, false, "out")).toBe("status");
      expect(pingRefusal(ph, false, false, undefined)).toBe("status"); // no World player (8.2's waiting joiner)
      expect(pingRefusal(ph, true, false, "alive")).toBe("frozen");
      expect(pingRefusal(ph, false, true, "alive")).toBe("held");
    }
    for (const ph of ["lobby", "results"]) expect(pingRefusal(ph, false, false, "alive")).toBe("phase");
  });

  it("P4: downed can ping; out, held, frozen, lobby and results can't", async () => {
    const { host, guest, third, room, recs } = await startThree(false);
    host.send(C2S.PING_SEND, { kind: "help" }); // lobby: no run yet
    await settle();
    expect(recs[0]?.pings).toEqual([]);
    for (const c of [host, guest, third]) c.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
    host.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(host.state.phase).toBe("build"));
    await settle(1000);

    player(room, "p0").status = "downed";
    host.send(C2S.PING_SEND, { kind: "help" });
    await vi.waitFor(() => expect(recs[1]?.pings).toHaveLength(1));

    player(room, "p1").status = "out";
    guest.send(C2S.PING_SEND, { kind: "help" });
    // A held seat (8.1): the room's hold map names it (the seat's player may still be in the World on a quiet hold).
    const holds = (room as unknown as { holds: Map<string, unknown> }).holds;
    holds.set("p2", { reason: "quiet", atMs: 0, reconnection: null, timer: null });
    third.send(C2S.PING_SEND, { kind: "here" });
    await settle(400);
    expect(recs[0]?.pings).toHaveLength(1);
    holds.delete("p2");

    await settle(1000);
    room.state.frozen = true;
    third.send(C2S.PING_SEND, { kind: "here" });
    await settle(400);
    room.state.frozen = false;
    expect(recs[0]?.pings).toHaveLength(1);

    // A real wave: everyone build-ready.
    for (const c of [host, guest, third]) c.send(C2S.BUILD_SET_READY, { ready: true });
    player(room, "p1").status = "alive";
    await vi.waitFor(() => expect(world(room).run.phase).toBe("wave"));
    await settle(1000);
    third.send(C2S.PING_SEND, { kind: "ready" });
    await vi.waitFor(() => expect(recs[0]?.pings.at(-1)?.[0]).toBe(2));
  });
});
