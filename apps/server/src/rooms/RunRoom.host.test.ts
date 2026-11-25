import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import { BYTES, C2S, DOWNTOWN_MAP, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, S2C, addBuildingAt, ownedCount, startWave, type PlayerLeft, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { CLOSE_REMOVED } from "../net/limits";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 8.3 fairness rules (H1–H3) through a real room: the host role moves at once; Remove. */
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
const NAMES = ["Ana", "Bo", "Cy", "Di"];
const token = () => randomBytes(16).toString("hex");
const options = (intent: "create" | "join", name: string, guestToken: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken,
});

interface Seen {
  left: PlayerLeft[];
  removed: number;
  closeCode: number;
}

function record(client: RunSdkRoom): Seen {
  const seen: Seen = { left: [], removed: 0, closeCode: 0 };
  client.onMessage(S2C.RUN_JOINED, () => {});
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.PLAYER_LEFT, (m: PlayerLeft) => seen.left.push(m));
  client.onMessage(S2C.SHOP_OFFERED, () => {});
  client.onMessage(S2C.RUN_STARTED, () => {});
  client.onMessage(S2C.RUN_REWARDS, () => {});
  client.onMessage(S2C.PLAYER_REMOVED, () => seen.removed++);
  client.onLeave((code) => (seen.closeCode = code));
  return seen;
}

async function lobbyOf(n: number) {
  const tokens = Array.from({ length: n }, token);
  const clients: RunSdkRoom[] = [];
  const seen: Seen[] = [];
  for (let i = 0; i < n; i++) {
    const c =
      i === 0
        ? await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", NAMES[i] as string, tokens[i] as string))
        : await colyseus.sdk.joinById<RunStateView>((clients[0] as RunSdkRoom).roomId, options("join", NAMES[i] as string, tokens[i] as string));
    seen.push(record(c));
    await c.waitForInitialState();
    clients.push(c);
  }
  const room = colyseus.getRoomById<RunRoom>((clients[0] as RunSdkRoom).roomId) as unknown as RunRoom;
  await vi.waitFor(() => expect(room.members.size).toBe(n));
  return { clients, seen, room, tokens };
}

async function runOf(n: number) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const r = await lobbyOf(n);
  r.room.allowSoloStart = true;
  for (const c of r.clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...r.room.members.values()].every((m) => r.room.state.players.get(m.playerId)?.ready)).toBe(true));
  (r.clients[0] as RunSdkRoom).send(C2S.RUN_START, {});
  for (const c of r.clients) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return r;
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

function drop(room: RunRoom, client: RunSdkRoom, comeBack = false): void {
  client.reconnection.enabled = comeBack;
  client.reconnection.minUptime = 0;
  client.reconnection.minDelay = 50;
  client.reconnection.maxDelay = 100;
  const server = room.clients.find((c) => c.sessionId === client.sessionId);
  (server?.ref as unknown as { terminate(): void }).terminate();
}

function logLines(room: RunRoom) {
  const info = vi.spyOn(room.log, "info");
  return (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);
}

describe("Story 8.3 H1: there is always someone to press Start and Save", () => {
  it("the host drops mid-run → the role moves AT ONCE to the longest-connected connected member; it does not move back on return", async () => {
    const { clients, room } = await runOf(3);
    const lines = logLines(room);
    expect(room.state.hostSlot).toBe(0);
    drop(room, clients[0] as RunSdkRoom, true);
    await vi.waitFor(() => expect(room.holds.has("p0")).toBe(true));
    expect(room.state.hostSlot).toBe(1); // at once, not after the 120 s
    expect(lines("host_changed")).toEqual([expect.objectContaining({ playerId: "p1", slot: 1, why: "held" })]);
    await vi.waitFor(() => expect(room.holds.has("p0")).toBe(false), { timeout: 5000 }); // the SDK reconnected
    expect(room.state.hostSlot).toBe(1); // never back
  });

  it("E8-H1: a seat back from a hold counts as newly connected — the next change skips the old host", async () => {
    const { clients, room } = await runOf(3);
    drop(room, clients[0] as RunSdkRoom, true);
    await vi.waitFor(() => expect(room.state.hostSlot).toBe(1));
    await vi.waitFor(() => expect(room.holds.has("p0")).toBe(false), { timeout: 5000 });
    await (clients[1] as RunSdkRoom).leave(true); // the new host leaves
    await vi.waitFor(() => expect(room.state.hostSlot).toBe(2)); // Cy (joined 3rd) is longer connected than Ana since her return
  });

  it("the old host back after the move can't Remove (not the host any more)", async () => {
    const { clients, room } = await runOf(3);
    const lines = logLines(room);
    drop(room, clients[0] as RunSdkRoom, true);
    await vi.waitFor(() => expect(room.state.hostSlot).toBe(1));
    await vi.waitFor(() => expect(room.holds.has("p0")).toBe(false), { timeout: 5000 });
    const ana = [...room.clients].find((c) => room.members.get(c.sessionId)?.playerId === "p0");
    room.onHostRemove(ana as never, "p2");
    expect(room.state.players.has("p2")).toBe(true);
    expect(lines("remove_refused")).toEqual([expect.objectContaining({ reason: "not_host" })]);
  });

  it("in the lobby the host leaving hands the role to the next-oldest member (as before)", async () => {
    const { clients, room } = await lobbyOf(3);
    await (clients[0] as RunSdkRoom).leave(true);
    await vi.waitFor(() => expect(room.state.hostSlot).toBe(1));
  });
});

describe("Story 8.3 H2: only the host can remove, only when nobody is fighting", () => {
  it("refused: a non-host, yourself, an unknown id, a wave, the vote (logged remove_refused, nothing changes)", async () => {
    const { clients, room } = await runOf(3);
    const lines = logLines(room);
    (clients[1] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p2" }); // not the host
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p0" }); // yourself
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p3" }); // nobody
    await vi.waitFor(() => expect(lines("remove_refused").map((l) => l.reason)).toEqual(["not_host", "self", "unknown"]));
    startWave(world(room));
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p2" });
    await vi.waitFor(() => expect(lines("remove_refused").map((l) => l.reason)).toContain("not_now"));
    world(room).run.phase = "vote";
    room.state.phase = "vote";
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p2" });
    await vi.waitFor(() => expect(lines("remove_refused").filter((l) => l.reason === "not_now")).toHaveLength(2));
    expect(room.state.players.size).toBe(3);
  });

  it("a malformed payload is dropped by the guard (strict schema)", async () => {
    const { clients, room } = await runOf(2);
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p1", extra: 1 });
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "x9" });
    await new Promise((r) => setTimeout(r, 150));
    expect(room.state.players.has("p1")).toBe(true);
  });
});

describe("Story 8.3 H3: removed means gone for this room", () => {
  it("build phase: the target gets player.removed + close 4022; not held, not remembered; everyone gets player.left removed; buildings disowned", async () => {
    const { clients, seen, room, tokens } = await runOf(3);
    const lines = logLines(room);
    const w = world(room);
    addBuildingAt(w, { id: 50, type: "wood_barricade", ownerId: "p2", gx: 20, gy: 20, rot: 0, hp: 200 });
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p2" });
    await vi.waitFor(() => expect(seen[2]?.closeCode).toBe(CLOSE_REMOVED));
    expect(seen[2]?.removed).toBe(1);
    expect(room.state.players.has("p2")).toBe(false);
    expect(w.players.has("p2")).toBe(false);
    expect(room.holds.size).toBe(0);
    expect(room.rememberedSeats.size).toBe(0);
    expect(w.buildings.list.find((b) => b.id === 50)?.ownerId).toBe(""); // stays, pays nobody (E8-H3)
    expect(ownedCount(w, "p2")).toBe(0);
    await vi.waitFor(() => expect(room.state.buildings.get("50")?.owner).toBe(""));
    await vi.waitFor(() => expect(seen[1]?.left).toEqual([{ playerId: "p2", name: "Cy", reason: "removed" }]));
    expect(lines("player_removed")).toEqual([expect.objectContaining({ playerId: "p2", by: "p0", phase: "build" })]);
    // The same seat can't come back (lobby or any later run of this room, E8-H2).
    await expect(colyseus.sdk.joinById(room.roomId, options("join", "Cy", tokens[2] as string))).rejects.toThrow("removed");
  });

  it("lobby: the removed player can't rejoin the lobby; a stranger with a fresh token still can (the host removes again)", async () => {
    const { clients, seen, room, tokens } = await lobbyOf(2);
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(() => expect(seen[1]?.closeCode).toBe(CLOSE_REMOVED));
    expect(room.state.players.size).toBe(1);
    await expect(colyseus.sdk.joinById(room.roomId, options("join", "Bo", tokens[1] as string))).rejects.toThrow("removed");
    const fresh = await colyseus.sdk.joinById<RunStateView>(room.roomId, options("join", "Bo", token()));
    record(fresh);
    await vi.waitFor(() => expect(room.state.players.size).toBe(2));
  });

  it("removing a HELD seat frees its slot (its pending reconnection is rejected) and a new player can take it", async () => {
    const { clients, room } = await runOf(4);
    drop(room, clients[3] as RunSdkRoom);
    await vi.waitFor(() => expect(room.holds.has("p3")).toBe(true));
    await expect(colyseus.sdk.joinById(room.roomId, options("join", "Eve", token()))).rejects.toThrow("run_full");
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p3" });
    await vi.waitFor(() => expect(room.holds.has("p3")).toBe(false));
    expect(room.takenSlots().sort()).toEqual([0, 1, 2]);
    const eve = await colyseus.sdk.joinById<RunStateView>(room.roomId, options("join", "Eve", token()));
    record(eve);
    await vi.waitFor(() => expect(world(room).players.get("p3")).toBeDefined());
    expect(world(room).players.get("p3")?.earned).toBe(0); // a fresh seat, not Di's
  });

  it("removing a REMEMBERED seat frees its slot the same way", async () => {
    const { clients, room, tokens } = await runOf(2);
    await (clients[1] as RunSdkRoom).leave(true);
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(0));
    await expect(colyseus.sdk.joinById(room.roomId, options("join", "Bo", tokens[1] as string))).rejects.toThrow("removed");
  });

  it("removing a waiting late joiner (build phase reached later) frees the reservation", async () => {
    const { clients, room } = await runOf(1);
    const w = world(room);
    startWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    const bo = await colyseus.sdk.joinById<RunStateView>(room.roomId, options("join", "Bo", token()));
    const seen = record(bo);
    await vi.waitFor(() => expect(room.state.players.get("p1")?.waiting).toBe(true));
    w.run.phase = "build"; // a build phase where the joiner is still waiting (its data loading)
    room.state.phase = "build";
    (clients[0] as RunSdkRoom).send(C2S.HOST_REMOVE, { playerId: "p1" });
    await vi.waitFor(() => expect(seen.closeCode).toBe(CLOSE_REMOVED));
    expect(room.takenSlots()).toEqual([0]);
  });
});
