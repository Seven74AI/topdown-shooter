import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, INPUT_BYTES } from "@topdown/shared";
import { bootTestServer } from "../../apps/server/src/test/bootTestServer";
import type { RunRoom } from "../../apps/server/src/rooms/RunRoom";
import { BotClient } from "./botClient";

/**
 * Story 8.11 (AC 2–4, F3) on real sockets: 2 bots on a real server, mid-wave. Down writes per phone ≤ 25/s (before:
 * 46–48: horde, events and the patch were 3 writes a tick), counted on the server's own TCP sockets (each `_write` /
 * `_writev` call is one write to the kernel; a corked tick flushes as one `_writev`). An in-process line can't see
 * this: its reads run after the server's whole tick and coalesce the writes. Also: every patch exactly one tick,
 * patches/s = ticks/s, the input 14 B + the 2-byte Colyseus header (≤ 0.6 KB/s up; before ≈ 2.3). Liveness: inputs,
 * patches and writes really flowed. (`npm run bots` measures the same through the separate-process lag line.)
 */
let colyseus: ColyseusTestServer;
let port = 0;

beforeAll(async () => {
  ({ colyseus, port } = await bootTestServer({ allowTestScenarios: true }));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await colyseus.shutdown();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Story 8.11 one packet per tick (bots on a real server)", () => {
  it("mid-wave: ≤ 25 down writes per phone per s, one tick per patch, 20 B per input (Story 8.13: 18 + the 2-byte header)", async () => {
    const url = `http://127.0.0.1:${port}`;
    const log = (): void => {};
    const host = await BotClient.connect({ url, name: "Bot 1", log, scenario: "net150" });
    const bots = [host, await BotClient.connect({ url, name: "Bot 2", roomId: host.roomId, log })];
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    try {
      await vi.waitFor(() => expect(room.members.size === 2 && [...room.state.players.values()].every((p) => p.ready)).toBe(true), { timeout: 30_000 });
      host.room.send(C2S.RUN_START, {});
      await vi.waitFor(() => expect(room.state.phase).toBe("wave"), { timeout: 60_000, interval: 50 });
      await sleep(1000); // into the wave
      const world = room.controller?.world;
      if (!world) throw new Error("no run");
      // Count each server-side socket's kernel writes from here on.
      const writes = room.clients.map((c) => {
        const sock = (c as unknown as { ref: { _socket: { _write: (...a: unknown[]) => void; _writev: (...a: unknown[]) => void } } }).ref._socket;
        const n = { count: 0 };
        for (const k of ["_write", "_writev"] as const) {
          const orig = sock[k];
          sock[k] = function (this: unknown, ...a: unknown[]) {
            n.count++;
            return orig.apply(this, a);
          };
        }
        return n;
      });
      const tick0 = world.tick;
      const marks = bots.map((b) => b.wireMeter.snapshot());
      const t0 = performance.now();
      await sleep(4000);
      const s = (performance.now() - t0) / 1000;
      expect(room.state.phase).toBe("wave"); // the window stayed inside the wave
      const ticksPerS = (world.tick - tick0) / s;
      expect(ticksPerS).toBeGreaterThan(15); // liveness: the World ran
      expect(writes).toHaveLength(2);
      for (const w of writes) {
        expect(w.count / s).toBeGreaterThan(10); // liveness
        expect(w.count / s).toBeLessThanOrEqual(25); // AC 4: ≤ 25 down writes per phone per s
      }
      bots.forEach((b, i) => {
        const now = b.wireMeter.snapshot();
        const mark = marks[i] as typeof now;
        const patches = now.patches - mark.patches;
        const [h0, h1, h2, h3] = now.ticksPerPatch.map((v, k) => v - (mark.ticksPerPatch[k] as number)) as [number, number, number, number];
        expect(patches).toBeGreaterThan(40); // liveness
        expect(h1).toBeGreaterThan(40);
        expect(h0 + h2 + h3, `ticks per patch ${h0}/${h1}/${h2}/${h3}`).toBe(0); // F3: never 0 or 2+
        expect(Math.abs(patches / s - ticksPerS) / ticksPerS).toBeLessThan(0.1); // patches/s = ticks/s (window edges)
        const inputs = now.inputMsgs - mark.inputMsgs;
        expect(inputs).toBeGreaterThan(40); // liveness
        expect((now.inputBytes - mark.inputBytes) / inputs).toBe(INPUT_BYTES + 2); // [17][2] + 18 B (Story 8.13: with the tick ack and the send time)
        expect((now.inputBytes - mark.inputBytes) / 1024 / s).toBeLessThanOrEqual(0.6); // AC 4
      });
    } finally {
      await Promise.all(bots.map((b) => b.stop()));
    }
  });
});
