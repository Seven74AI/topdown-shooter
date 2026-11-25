import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { MatchMakeError, type Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  NET_PROTOCOL_VERSION,
  DOWNTOWN_MAP,
  C2S,
  NEUTRAL_INPUT,
  RUN_ROOM_NAME,
  S2C,
  TICK_RATE_HZ,
  isRoomCode,
  type RunJoined,
  type RunStateView,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { MAX_INPUTS_PER_S } from "../net/limits";
import { JOIN_REFUSED_CODE, RunRoom, serverBalance } from "./RunRoom";

let colyseus: ColyseusTestServer;
let port: number;

beforeAll(async () => {
  ({ colyseus, port } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

const newToken = (): string => randomBytes(16).toString("hex");

const createOptions = (over: Record<string, unknown> = {}) => ({
  intent: "create",
  name: "Ana",
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken: newToken(),
  ...over,
});

const joinOptions = (over: Record<string, unknown> = {}) => createOptions({ intent: "join", name: "Bo", ...over });

type RunSdkRoom = SdkRoom<unknown, RunStateView>;

/** Resolves with the first `run.joined`; register right after the join resolves. */
const nextJoined = (client: RunSdkRoom): Promise<RunJoined> =>
  new Promise((resolve) => client.onMessage(S2C.RUN_JOINED, (m: RunJoined) => resolve(m)));

async function createRun(over: Record<string, unknown> = {}) {
  const client = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, createOptions(over));
  const joined = nextJoined(client);
  await client.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(client.roomId) as unknown as RunRoom;
  return { client, room, joined };
}

async function joinRun(code: string, over: Record<string, unknown> = {}) {
  const client = await colyseus.sdk.joinById<RunStateView>(code, joinOptions(over));
  const joined = nextJoined(client);
  await client.waitForInitialState();
  return { client, joined };
}

/** Room state as plain JSON, keyed by player id. */
const players = (room: RunRoom) =>
  room.state.toJSON().players as Record<string, { slot: number; name: string; ready: boolean }>;

/** Sets everyone listed Ready, then the host asks to start. */
async function readyAndStart(room: RunRoom, host: RunSdkRoom, ...others: RunSdkRoom[]): Promise<void> {
  for (const c of [host, ...others]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await settle(room);
  host.send(C2S.RUN_START, {});
  await settle(room);
}

async function refusal(promise: Promise<unknown>): Promise<MatchMakeError> {
  const e = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(e).toBeInstanceOf(MatchMakeError);
  return e as MatchMakeError;
}

/** A round trip through the room: a later patch means earlier messages were processed. */
async function settle(room: RunRoom): Promise<void> {
  await room.waitForNextPatch();
  await room.waitForNextPatch();
}

const isOpen = (client: RunSdkRoom): boolean => client.connection.isOpen;

describe("RunRoom", () => {
  it("create gives a 4-letter code and the state shows the host", async () => {
    const { client, room } = await createRun({ name: "  Ana  " });
    expect(isRoomCode(client.roomId)).toBe(true);
    expect(room.roomId).toBe(client.roomId);
    expect(room.maxClients).toBe(4);
    expect(client.state.phase).toBe("lobby");
    expect(client.state.hostSlot).toBe(0);
    expect(client.state.players.size).toBe(1);
    const host = client.state.players.get("p0");
    expect(host?.name).toBe("Ana");
    expect(host?.slot).toBe(0);
  });

  it("gives every run its own code", async () => {
    const a = await createRun();
    const b = await createRun();
    expect(a.client.roomId).not.toBe(b.client.roomId);
  });

  it("refuses a different balance version with balance_mismatch", async () => {
    const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ balanceVersion: "00000000" })));
    expect(e.code).toBe(JOIN_REFUSED_CODE);
    expect(e.message).toBe("balance_mismatch");
  });

  it("Story 4.1: refuses a client built with another map (mapVersion) or without one (review M1) with balance_mismatch; the right one joins", async () => {
    const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ mapVersion: "00000000" })));
    expect(e.code).toBe(JOIN_REFUSED_CODE);
    expect(e.message).toBe("balance_mismatch");
    const missing = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ mapVersion: undefined })));
    expect(missing.code).toBe(JOIN_REFUSED_CODE);
    expect(missing.message).toBe("balance_mismatch"); // an old tab: "Please refresh", not "invalid options"
    // re-review L3: present but malformed is a bad client, not an old one
    for (const mapVersion of [123, "x".repeat(17), "", null]) {
      const bad = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ mapVersion })));
      expect(bad.code).toBe(JOIN_REFUSED_CODE);
      expect(bad.message).toBe("invalid_options");
    }
    const ok = await colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ mapVersion: DOWNTOWN_MAP.version }));
    expect(ok.roomId).toBeTruthy();
    await ok.leave();
  });

  it("Story 8.10 (F5, brief 19): a client with another wire format is refused at join as update_required; a pre-8.10 tab without one as balance_mismatch (review RM1: the only refusal its old code shows with a Refresh button); the right one joins", async () => {
    const old = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ netProtocolVersion: undefined })));
    expect(old.code).toBe(JOIN_REFUSED_CODE);
    expect(old.message).toBe("balance_mismatch");
    // …also when the balance changed in the same deploy (the version check runs first)
    const oldBoth = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ netProtocolVersion: undefined, balanceVersion: "00000000" })));
    expect(oldBoth.message).toBe("balance_mismatch");
    for (const netProtocolVersion of [NET_PROTOCOL_VERSION - 1, NET_PROTOCOL_VERSION + 1, 0]) {
      const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ netProtocolVersion })));
      expect(e.code).toBe(JOIN_REFUSED_CODE);
      expect(e.message).toBe("update_required");
    }
    for (const netProtocolVersion of ["2", 2.5, -1, 70_000]) {
      const bad = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ netProtocolVersion })));
      expect(bad.message).toBe("invalid_options");
    }
    const ok = await colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ netProtocolVersion: NET_PROTOCOL_VERSION }));
    expect(ok.roomId).toBeTruthy();
    await ok.leave();
  });

  it("refuses bad options with invalid_options", async () => {
    for (const over of [{ name: "" }, { name: "x".repeat(17) }, { name: "a\u0007b" }, { extra: 1 }]) {
      const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions(over)));
      expect(e.code).toBe(JOIN_REFUSED_CODE);
      expect(e.message).toBe("invalid_options");
    }
  });

  it("refuses an oversized matchmaking body at the HTTP layer, before it is buffered", async () => {
    const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ name: "x".repeat(4000) })));
    expect(e.code).toBe(413);
  });

  it("only creates rooms for the create intent", async () => {
    const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ intent: "join" })));
    expect(e.message).toBe("invalid_options");
  });

  it("is not found by a join-any-room call (reachable only by its code)", async () => {
    await createRun();
    const e = await refusal(colyseus.sdk.join(RUN_ROOM_NAME, createOptions({ intent: "join" })));
    expect(e.message).toMatch(/no rooms found/);
  });

  it("drops an invalid input.send and keeps the client connected", async () => {
    const { client, room } = await createRun();
    const onInput = vi.spyOn(room, "onInput");
    const warn = vi.spyOn(room.log, "warn");
    client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, moveX: 5 });
    client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, hack: true });
    client.send(C2S.INPUT_SEND, "not an object");
    client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: 1 });
    await settle(room);
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({ playerId: "p0", reason: "invalid", dropped: 1 }, "client_message_rejected");
    expect(isOpen(client)).toBe(true);
    expect(room.clients.length).toBe(1);
  });

  it("drops an unknown message type and keeps the client connected", async () => {
    const { client, room } = await createRun();
    const warn = vi.spyOn(room.log, "warn");
    client.send("cheat.give_all_weapons", {});
    client.send(99, {});
    await settle(room);
    expect(warn).toHaveBeenCalledWith(
      { playerId: "p0", reason: "unknown_type", dropped: 1 },
      "client_message_rejected",
    );
    expect(isOpen(client)).toBe(true);
    expect(room.clients.length).toBe(1);
  });

  it("accepts 25 of 40 inputs sent at once", async () => {
    const { client, room } = await createRun();
    const onInput = vi.spyOn(room, "onInput");
    const warn = vi.spyOn(room.log, "warn");
    for (let seq = 1; seq <= 40; seq++) client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq });
    await settle(room);
    expect(onInput).toHaveBeenCalledTimes(MAX_INPUTS_PER_S);
    expect(warn).toHaveBeenCalledWith({ playerId: "p0", reason: "rate", dropped: 1 }, "client_message_rejected");
    expect(isOpen(client)).toBe(true);
  });

  it("closes only the client that sends a message over 1 KB", async () => {
    const big = await createRun();
    const other = await createRun();
    const warn = vi.spyOn(big.room.log, "warn");
    const dropped = new Promise<number>((resolve) => {
      big.client.onDrop((code) => resolve(code));
      big.client.onLeave((code) => resolve(code));
    });
    big.client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, pad: "x".repeat(2048) });
    expect(await dropped).toBe(1009);
    await vi.waitFor(() => expect(big.room.state.players.size).toBe(0));
    expect(warn).toHaveBeenCalledWith({ playerId: "p0", reason: "too_large", dropped: 1 }, "client_message_rejected");
    // The other run is untouched and still processes messages.
    const onInput = vi.spyOn(other.room, "onInput");
    other.client.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: 1 });
    await settle(other.room);
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(isOpen(other.client)).toBe(true);
  });

  it("removes the player on leave", async () => {
    const { client, room } = await createRun();
    await client.leave(true);
    await vi.waitFor(() => expect(room.state.players.size).toBe(0));
  });
});

describe("RunRoom lobby (Story 2.3)", () => {
  it("gives 4 players slots 0-3 and sends each run.joined", async () => {
    const host = await createRun();
    expect(await host.joined).toEqual({ playerId: "p0", slot: 0, tickRateHz: TICK_RATE_HZ });
    for (const slot of [1, 2, 3]) {
      const guest = await joinRun(host.client.roomId, { name: `G${slot}` });
      expect(await guest.joined).toEqual({ playerId: `p${slot}`, slot, tickRateHz: TICK_RATE_HZ });
    }
    expect(Object.keys(players(host.room)).sort()).toEqual(["p0", "p1", "p2", "p3"]);
    expect(players(host.room).p2).toMatchObject({ slot: 2, name: "G2", ready: false });
    // Every client sees every player.
    await vi.waitFor(() => expect(host.client.state.players.size).toBe(4));
    expect(host.client.state.players.get("p3")?.name).toBe("G3");
  });

  it("refuses a 5th player with 522 locked (This game is full)", async () => {
    const host = await createRun();
    for (let i = 0; i < 3; i++) await joinRun(host.client.roomId);
    const e = await refusal(colyseus.sdk.joinById(host.client.roomId, joinOptions()));
    expect(e.code).toBe(522);
    expect(e.message).toMatch(/locked/);
  });

  it("refuses an unknown code with 522 not found (Game not found)", async () => {
    const e = await refusal(colyseus.sdk.joinById("ZZZZ", joinOptions()));
    expect(e.code).toBe(522);
    expect(e.message).toMatch(/not found/);
  });

  it("reuses a freed slot for the next joiner", async () => {
    const host = await createRun();
    const one = await joinRun(host.client.roomId);
    await joinRun(host.client.roomId);
    expect((await one.joined).slot).toBe(1);
    await one.client.leave(true);
    await vi.waitFor(() => expect(host.room.state.players.has("p1")).toBe(false));
    const next = await joinRun(host.client.roomId, { name: "Cy" });
    expect(await next.joined).toMatchObject({ playerId: "p1", slot: 1 });
    expect(players(host.room).p1?.name).toBe("Cy");
  });

  it("hands the host to the longest-connected player when the host leaves", async () => {
    const host = await createRun();
    const first = await joinRun(host.client.roomId);
    const second = await joinRun(host.client.roomId);
    expect((await second.joined).slot).toBe(2);
    // Make slot order differ from join order: free slot 1, and a later joiner takes it.
    await first.client.leave(true);
    await vi.waitFor(() => expect(host.room.state.players.size).toBe(2));
    const late = await joinRun(host.client.roomId);
    expect((await late.joined).slot).toBe(1);
    await host.client.leave(true);
    await vi.waitFor(() => expect(host.room.state.players.has("p0")).toBe(false));
    expect(host.room.state.hostSlot).toBe(2); // joined before the new slot-1 player
    await vi.waitFor(() => expect(second.client.state.hostSlot).toBe(2));
  });

  it("sets Ready only for the sender", async () => {
    const host = await createRun();
    const guest = await joinRun(host.client.roomId);
    await guest.joined;
    guest.client.send(C2S.LOBBY_SET_READY, { ready: true });
    await settle(host.room);
    expect(players(host.room).p1?.ready).toBe(true);
    expect(players(host.room).p0?.ready).toBe(false);
    guest.client.send(C2S.LOBBY_SET_READY, { ready: "yes" }); // invalid: dropped
    await settle(host.room);
    expect(players(host.room).p1?.ready).toBe(true);
    guest.client.send(C2S.LOBBY_SET_READY, { ready: false });
    await settle(host.room);
    expect(players(host.room).p1?.ready).toBe(false);
    await vi.waitFor(() => expect(host.client.state.players.get("p1")?.ready).toBe(false));
  });

  it("refuses a start while someone isn't Ready, and starts when everyone is", async () => {
    const host = await createRun();
    const guest = await joinRun(host.client.roomId);
    await guest.joined;
    const info = vi.spyOn(host.room.log, "info");
    await readyAndStart(host.room, host.client);
    expect(host.room.state.phase).toBe("lobby");
    expect(info).toHaveBeenCalledWith({ playerId: "p0", reason: "not_ready" }, "run_start_refused");
    await readyAndStart(host.room, host.client, guest.client);
    expect(host.room.state.phase).toBe("build");
    expect(info).toHaveBeenCalledWith({ runSeed: expect.any(Number), players: 2 }, "run_started");
    await vi.waitFor(() => expect(guest.client.state.phase).toBe("build"));
  });

  it("refuses a start from a non-host", async () => {
    const host = await createRun();
    const guest = await joinRun(host.client.roomId);
    await guest.joined;
    const info = vi.spyOn(host.room.log, "info");
    await readyAndStart(host.room, guest.client, host.client);
    expect(host.room.state.phase).toBe("lobby");
    expect(info).toHaveBeenCalledWith({ playerId: "p1", reason: "not_host" }, "run_start_refused");
  });

  it("accepts a solo start even when allowSoloStart is off (designer 2026-11-23: online runs can be played alone)", async () => {
    const { client, room } = await createRun();
    room.allowSoloStart = false;
    await readyAndStart(room, client);
    expect(room.state.phase).toBe("build");
  });

  it("ignores Ready and a second start once the run started", async () => {
    const { client, room } = await createRun();
    room.allowSoloStart = true;
    await readyAndStart(room, client);
    expect(room.state.phase).toBe("build");
    const info = vi.spyOn(room.log, "info");
    client.send(C2S.LOBBY_SET_READY, { ready: false });
    client.send(C2S.RUN_START, {});
    await settle(room);
    expect(players(room).p0?.ready).toBe(true);
    expect(info).toHaveBeenCalledWith({ playerId: "p0", reason: "not_lobby" }, "run_start_refused");
  });

  it("refuses a join after the start with run_started", async () => {
    const { client, room } = await createRun();
    room.allowSoloStart = true;
    await readyAndStart(room, client);
    const e = await refusal(colyseus.sdk.joinById(client.roomId, joinOptions()));
    expect(e.code).toBe(JOIN_REFUSED_CODE);
    expect(e.message).toBe("run_started");
    expect(room.state.players.size).toBe(1);
  });

  it("refuses the same guest token twice with already_joined", async () => {
    const guestToken = newToken();
    const { client, room } = await createRun({ guestToken });
    const e = await refusal(colyseus.sdk.joinById(client.roomId, joinOptions({ guestToken })));
    expect(e.code).toBe(JOIN_REFUSED_CODE);
    expect(e.message).toBe("already_joined");
    expect(room.state.players.size).toBe(1);
  });

  it("does not hold a seat for refused joins: the 4th player still gets in", async () => {
    const guestToken = newToken();
    const host = await createRun({ guestToken });
    for (let i = 0; i < 5; i++) await refusal(colyseus.sdk.joinById(host.client.roomId, joinOptions({ guestToken })));
    await joinRun(host.client.roomId);
    await joinRun(host.client.roomId);
    const fourth = await joinRun(host.client.roomId);
    expect((await fourth.joined).slot).toBe(3);
  });

  it("lets the host start alone after the guest leaves", async () => {
    const host = await createRun();
    host.room.allowSoloStart = false;
    const guest = await joinRun(host.client.roomId);
    await guest.joined;
    await guest.client.leave(true);
    await vi.waitFor(() => expect(host.room.state.players.size).toBe(1));
    await readyAndStart(host.room, host.client);
    expect(host.room.state.phase).toBe("build");
  });

  it("keeps the guest token and its hash out of room state and logs", async () => {
    const guestToken = newToken();
    const host = await createRun();
    const info = vi.spyOn(host.room.log, "info");
    await (await joinRun(host.client.roomId, { guestToken })).joined;
    const json = JSON.stringify(host.room.state.toJSON());
    expect(json).not.toContain(guestToken);
    expect(json.toLowerCase()).not.toContain("token");
    expect(json).not.toMatch(/[0-9a-f]{32}/);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toMatch(/[0-9a-f]{32}/);
    expect(info).toHaveBeenCalledWith({ playerId: "p1", slot: 1 }, "player_joined");
  });

  it("takes allowSoloStart from the server, never from the client", async () => {
    const { room } = await createRun();
    expect(room.allowSoloStart).toBe(true); // bootTestServer default
    const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ allowSoloStart: false })));
    expect(e.message).toBe("invalid_options");
  });

  it("refuses a missing or malformed guest token with invalid_options", async () => {
    for (const guestToken of [undefined, "abc", "Z".repeat(32)]) {
      const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions({ guestToken })));
      expect(e.message).toBe("invalid_options");
    }
  });
});

describe("GET /health", () => {
  it("returns 200 with ok, room count and uptime", async () => {
    await createRun();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rooms: number; uptimeS: number };
    expect(body.ok).toBe(true);
    expect(body.rooms).toBeGreaterThanOrEqual(1);
    expect(body.uptimeS).toBeGreaterThanOrEqual(0);
  });
});
