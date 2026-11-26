import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import { BYTES, C2S, DOWNTOWN_MAP, INPUT_BYTES, NET_PROTOCOL_VERSION, NEUTRAL_INPUT, RUN_ROOM_NAME, encodeInput, type RunStateView } from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import type { HordeEncoder } from "../net/hordeEncoder";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 8.13 review L2: the tick ack in a live room (real sockets, the real guard and parser). */
let colyseus: ColyseusTestServer;

beforeAll(async () => {
  ({ colyseus } = await bootTestServer());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function startedRun(): Promise<{ client: SdkRoom<unknown, RunStateView>; room: RunRoom }> {
  const client = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, {
    intent: "create",
    name: "Ana",
    balanceVersion: serverBalance.version,
    mapVersion: DOWNTOWN_MAP.version,
    netProtocolVersion: NET_PROTOCOL_VERSION,
    guestToken: randomBytes(16).toString("hex"),
  });
  await client.waitForInitialState();
  const room = colyseus.getRoomById<RunRoom>(client.roomId) as unknown as RunRoom;
  client.send(C2S.LOBBY_SET_READY, { ready: true });
  await room.waitForNextPatch();
  client.send(C2S.RUN_START, {});
  for (let i = 0; i < 40 && room.state.phase !== "build"; i++) await room.waitForNextPatch();
  expect(room.state.phase).toBe("build"); // the World steps: horde frames and ticks
  return { client, room };
}

const horde = (room: RunRoom): HordeEncoder => (room as unknown as { horde: HordeEncoder }).horde;

describe("Story 8.13: the slow-line ack in a live room (review L2)", () => {
  it("acks that fall 1.5 s behind (inputs on time) put the phone on the slow-line skip", async () => {
    const { client, room } = await startedRun();
    const bytes = new Uint8Array(INPUT_BYTES);
    let seq = 0;
    const send = (lagTicks: number): void => {
      encodeInput({ ...NEUTRAL_INPUT, seq: ++seq }, bytes, Math.max(0, room.state.tick - lagTicks));
      client.sendBytes(BYTES.INPUT, bytes);
    };
    for (let i = 0; i < 20; i++) {
      send(0); // 1 s of fresh acks: the base
      await sleep(50);
    }
    const st = horde(room).stateFor(room.clients[0] as object);
    expect(st.ackTick).toBeGreaterThan(0); // liveness: the acks reached the encoder
    expect(st.lineSlow).toBe(false);
    for (let i = 0; i < 50; i++) {
      send(30); // the newest tick received is 1.5 s old: a queue on the way down (the first 1.5 s of acks are not new)
      await sleep(50);
    }
    expect(st.waitMs).toBeGreaterThan(1000);
    expect(st.lineSlow).toBe(true);
  });

  it("ack bytes without the ack flag are refused by the guard (`invalid`), nothing reaches the encoder", async () => {
    const { client, room } = await startedRun();
    const onInput = vi.spyOn(room, "onInput");
    const warn = vi.spyOn(room.log, "warn");
    const bad = new Uint8Array(INPUT_BYTES);
    encodeInput({ ...NEUTRAL_INPUT, seq: 1 }, bad); // no ack: flag 16 off, bytes 14–15 zero
    bad[14] = 7; // …but ack bytes anyway
    const bad2 = bad.slice();
    bad2[14] = 0;
    bad2[15] = 1;
    client.sendBytes(BYTES.INPUT, bad);
    client.sendBytes(BYTES.INPUT, bad2);
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    expect(onInput).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith({ playerId: "p0", reason: "invalid", dropped: 1 }, "client_message_rejected");
    const guard = (room as unknown as { net: { pending(c: unknown): Record<string, number> | undefined } }).net;
    expect(guard.pending(room.clients[0])?.invalid).toBe(1); // the second one, counted (logged later)
    expect(horde(room).stateFor(room.clients[0] as object).ackTick).toBe(-1);
  });
});
