import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, PING_KINDS } from "@topdown/shared";
import { bootTestServer } from "../../apps/server/src/test/bootTestServer";
import type { RunRoom } from "../../apps/server/src/rooms/RunRoom";
import { BotClient } from "./botClient";

/**
 * Story 8.7 AC 10 (liveness): real bots on a real server with `pingEveryS` — pings really sent, really shown on ANOTHER
 * bot with the sender's slot, a bot pinging faster than 1/s really gets its extra pings dropped (and counted), and the
 * run goes on. (P5 "the World digest is the same with pings" is checked on the handler itself in RunRoom.ping.test: a
 * real-time bot run is not deterministic, so two bot runs can't be compared digest to digest.)
 */
let colyseus: ColyseusTestServer;
let port = 0;

beforeAll(async () => {
  ({ colyseus, port } = await bootTestServer());
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await colyseus.shutdown();
});

describe("Story 8.7: bots ping (--ping-every)", () => {
  it("two bots: Bot 1 every 2 s, Bot 2 every 0.25 s — both shown on the other bot, Bot 2's extras dropped at the 1/s bucket", async () => {
    vi.stubEnv("DEV_NO_WAVES", "0");
    const url = `http://127.0.0.1:${port}`;
    const log = (): void => {};
    const a = await BotClient.connect({ url, name: "Bot 1", log, pingEveryS: 2 });
    const b = await BotClient.connect({ url, name: "Bot 2", roomId: a.roomId, log, pingEveryS: 0.25 });
    const room = colyseus.getRoomById<RunRoom>(a.roomId) as unknown as RunRoom;
    try {
      await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true), { timeout: 5000 });
      a.room.send(C2S.RUN_START, {});
      await vi.waitFor(() => expect(room.state.phase).toBe("build"), { timeout: 5000 });
      const slotA = [...room.members.values()].find((m) => m.playerId === "p0")?.slot;
      const slotB = [...room.members.values()].find((m) => m.playerId === "p1")?.slot;
      await vi.waitFor(
        () => {
          expect(b.pingsSeen.some((p) => p[0] === slotA)).toBe(true); // A's ping shown on B
          expect(a.pingsSeen.some((p) => p[0] === slotB)).toBe(true); // B's ping shown on A
        },
        { timeout: 8000, interval: 100 },
      );
      await new Promise((r) => setTimeout(r, 2500));
      expect(a.pingsSent).toBeGreaterThanOrEqual(2);
      expect(b.pingsSent).toBeGreaterThanOrEqual(8);
      // the server dropped B's extras: B was shown at most ~1 per second, A all of its own
      const shownB = a.pingsSeen.filter((p) => p[0] === slotB).length;
      expect(shownB).toBeLessThan(b.pingsSent);
      expect(room.pingDropped.get("p1") ?? 0).toBeGreaterThan(0);
      expect(room.pingDropped.get("p0") ?? 0).toBe(0);
      expect(b.pingsSeen.filter((p) => p[0] === slotA).length).toBeGreaterThanOrEqual(a.pingsSent - 1); // in flight at most one
      for (const [, kind] of [...a.pingsSeen, ...b.pingsSeen]) {
        expect(kind).toBeGreaterThanOrEqual(0);
        expect(kind).toBeLessThan(PING_KINDS.length);
      }
      expect(["build", "wave"]).toContain(room.state.phase); // the run goes on
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  }, 30_000);
});
