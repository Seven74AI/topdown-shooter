import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
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
  // E8-A8 (no test over 30 s; was 36 s in CI): the one run is split into its steps, in order, on the same room and
  // bots: each step needs the ones before it (a -t filter on one step fails it).
  describe("a bot joins at a build phase and plays; a bot joining mid-wave waits, enters at the next build phase, then shoots", () => {
    const lines: Record<string, unknown>[] = [];
    const log = (l: Record<string, unknown>): void => void lines.push(l);
    const url = () => `http://127.0.0.1:${port}`;
    const bots: BotClient[] = [];
    let room: RunRoom;
    let info: MockInstance<RunRoom["log"]["info"]>;
    const logged = (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);
    let world: NonNullable<RunRoom["controller"]>["world"];
    let b3: BotClient;
    let b4: BotClient;
    let shots = 0;
    afterAll(async () => {
      await Promise.all(bots.map((b) => b.stop()));
    });

    it("step 1: two bots start the run; bot 3 joins in the first build phase and gets a seat at once", async () => {
      const host = await BotClient.connect({ url: url(), name: "Bot 1", log });
      bots.push(host, await BotClient.connect({ url: url(), name: "Bot 2", roomId: host.roomId, log }));
      room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
      room.allowSoloStart = true;
      info = vi.spyOn(room.log, "info");
      expect(await until(() => room.members.size === 2 && [...room.state.players.values()].every((p) => p.ready), 30_000)).toBe(true);
      host.room.send("run.start", {});
      expect(await until(() => room.state.phase === "build", 30_000)).toBe(true);
      // Bot 3: a build-phase join → a new seat at once.
      b3 = await BotClient.connect({ url: url(), name: "Bot 3", roomId: host.roomId, log });
      bots.push(b3);
      const w = room.controller?.world;
      if (!w) throw new Error("no run");
      world = w;
      expect(await until(() => world.players.has(b3.playerId), 10_000)).toBe(true);
      expect(logged("player_joined_mid_run").map((l) => l.playerId)).toEqual([b3.playerId]);
    }, 120_000);

    it("step 2: bot 4 joins mid-wave 1 and waits (in the state as waiting, not in the World)", async () => {
      expect(world, "step 1 ran").toBeDefined();
      // Mid-wave 1: bot 4 joins and waits.
      expect(await until(() => room.state.phase === "wave", 90_000)).toBe(true);
      b4 = await BotClient.connect({ url: url(), name: "Bot 4", roomId: room.roomId, log });
      bots.push(b4);
      // E8-A1 (PR #39): everyone Ready ends a build phase on the next tick, and bots Ready as soon as they've shopped, so
      // the build after wave 1 could last a few ticks and step 4's poll first saw bot 4 in wave 2. Hold Ready after
      // wave 1 (the build then runs its countdown) until step 4 has seen bot 4 enter.
      for (const b of bots) b.holdReadyAfterWave = 1;
      expect(await until(() => b4.waited, 10_000)).toBe(true);
      expect(world.players.has(b4.playerId)).toBe(false);
      expect(room.state.players.get(b4.playerId)?.waiting).toBe(true);
      expect(lines.some((l) => l.msg === "bot_waiting" && l.bot === "Bot 4")).toBe(true);
    }, 120_000);

    // E8-A8: the wait for the next build phase (the rest of wave 1 in real time) is split at three milestones of the same
    // wait — a quarter, half and three quarters of the wave down — so no step takes 30 s. Until the wave ends, bot 4 stays out.
    it.each([["a quarter", 3 / 4], ["half", 1 / 2], ["three quarters", 1 / 4]] as const)("step 3: %s of wave 1 down, bot 4 still waits outside the World", async (_, left) => {
      expect(b4?.waited, "step 2 ran").toBe(true);
      expect(await until(() => world.waves.remaining <= world.waves.size * left || room.state.phase !== "wave", 150_000, 250)).toBe(true);
      if (room.state.phase === "wave") {
        expect(world.players.has(b4.playerId)).toBe(false);
        expect(room.state.players.get(b4.playerId)?.waiting).toBe(true);
      }
    }, 180_000);

    it("step 4: bot 4 enters at the next build phase", async () => {
      expect(b4?.waited, "step 2 ran").toBe(true);
      // The next build phase: it enters; wave 2: it shoots.
      expect(await until(() => world.players.has(b4.playerId), 150_000, 250)).toBe(true);
      expect(world.waves.number).toBe(1);
      expect(room.state.phase).toBe("build");
      expect(await until(() => b4.entered, 10_000)).toBe(true);
      for (const b of bots) b.holdReadyAfterWave = 0; // wave 2 may start (step 5)
    }, 180_000);

    it("step 5: bot 4 shoots in wave 2", async () => {
      expect(b4?.entered, "step 4 ran").toBe(true);
      const off = world.events.subscribe((e: SimEvent) => {
        if (e.type === "weapon.fired" && e.playerId === b4.playerId) shots++;
      });
      expect(await until(() => shots > 0, 120_000, 250)).toBe(true);
      off?.();
      expect(world.waves.number).toBeGreaterThanOrEqual(2);
      expect(room.members.size).toBe(4);
      console.log(JSON.stringify({ msg: "late_join_test", b3: b3.playerId, b4: b4.playerId, shots, wave: world.waves.number }));
    }, 180_000);
  });
});
