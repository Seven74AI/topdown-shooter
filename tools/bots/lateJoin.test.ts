import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { SimEvent } from "@topdown/shared";
import { bootTestServer } from "../../apps/server/src/test/bootTestServer";
import type { RunRoom } from "../../apps/server/src/rooms/RunRoom";
import { BotClient } from "./botClient";

/**
 * Story 8.2 T8 liveness: real bots on a real server. Two bots start the run; bot 3 joins in the first build phase
 * (enters at once: a new seat with late-join money); bot 4 joins mid-wave 1 (waits: `waiting` in its state, not in the
 * World), enters at the next build phase and then shoots in wave 2. Every step is asserted from the server's World and
 * log, and from the bot's own `bot_waiting` / `bot_entered` lines.
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, timeoutMs: number, stepMs = 50): Promise<boolean> {
  const t0 = performance.now();
  while (!ok()) {
    if (performance.now() - t0 > timeoutMs) return false;
    await sleep(stepMs);
  }
  return true;
}

describe("Story 8.2 late bots (T8)", () => {
  it("a bot joins at a build phase and plays; a bot joining mid-wave waits, enters at the next build phase, then shoots", async () => {
    const lines: Record<string, unknown>[] = [];
    const log = (l: Record<string, unknown>): void => void lines.push(l);
    const url = `http://127.0.0.1:${port}`;
    const host = await BotClient.connect({ url, name: "Bot 1", log });
    const bots = [host, await BotClient.connect({ url, name: "Bot 2", roomId: host.roomId, log })];
    const room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
    room.allowSoloStart = true;
    const info = vi.spyOn(room.log, "info");
    const logged = (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);
    try {
      expect(await until(() => room.members.size === 2 && [...room.state.players.values()].every((p) => p.ready), 30_000)).toBe(true);
      host.room.send("run.start", {});
      expect(await until(() => room.state.phase === "build", 30_000)).toBe(true);
      // Bot 3: a build-phase join → a new seat at once.
      const b3 = await BotClient.connect({ url, name: "Bot 3", roomId: host.roomId, log });
      bots.push(b3);
      const world = room.controller?.world;
      if (!world) throw new Error("no run");
      expect(await until(() => world.players.has(b3.playerId), 10_000)).toBe(true);
      expect(logged("player_joined_mid_run").map((l) => l.playerId)).toEqual([b3.playerId]);
      // Mid-wave 1: bot 4 joins and waits.
      expect(await until(() => room.state.phase === "wave", 90_000)).toBe(true);
      const b4 = await BotClient.connect({ url, name: "Bot 4", roomId: host.roomId, log });
      bots.push(b4);
      expect(await until(() => b4.waited, 10_000)).toBe(true);
      expect(world.players.has(b4.playerId)).toBe(false);
      expect(room.state.players.get(b4.playerId)?.waiting).toBe(true);
      expect(lines.some((l) => l.msg === "bot_waiting" && l.bot === "Bot 4")).toBe(true);
      // The next build phase: it enters; wave 2: it shoots.
      expect(await until(() => world.players.has(b4.playerId), 150_000, 250)).toBe(true);
      expect(world.waves.number).toBe(1);
      expect(await until(() => b4.entered, 10_000)).toBe(true);
      let shots = 0;
      const off = world.events.subscribe((e: SimEvent) => {
        if (e.type === "weapon.fired" && e.playerId === b4.playerId) shots++;
      });
      expect(await until(() => shots > 0, 120_000, 250)).toBe(true);
      off?.();
      expect(world.waves.number).toBeGreaterThanOrEqual(2);
      expect(room.members.size).toBe(4);
      console.log(JSON.stringify({ msg: "late_join_test", b3: b3.playerId, b4: b4.playerId, shots, wave: world.waves.number }));
    } finally {
      await Promise.all(bots.map((b) => b.stop()));
    }
  }, 360_000);
});
