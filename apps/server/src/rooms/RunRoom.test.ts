import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { MatchMakeError, type Room as SdkRoom } from "@colyseus/sdk";
import { C2S, NEUTRAL_INPUT, RUN_ROOM_NAME, isRoomCode, type RunStateView } from "@topdown/shared";
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

const createOptions = (over: Record<string, unknown> = {}) => ({
  intent: "create",
  name: "Ana",
  balanceVersion: serverBalance.version,
  ...over,
});

async function createRun(over: Record<string, unknown> = {}) {
  const client = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, createOptions(over));
  await client.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(client.roomId) as unknown as RunRoom;
  return { client, room };
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

const isOpen = (client: SdkRoom<unknown, RunStateView>): boolean => client.connection.isOpen;

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

  it("refuses bad options with invalid_options", async () => {
    for (const over of [{ name: "" }, { name: "x".repeat(17) }, { name: "a\u0007b" }, { extra: 1 }, { name: "x".repeat(2000) }]) {
      const e = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, createOptions(over)));
      expect(e.code).toBe(JOIN_REFUSED_CODE);
      expect(e.message).toBe("invalid_options");
    }
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
