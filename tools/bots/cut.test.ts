import { loadavg } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import { C2S, bulletLineClear, shotLineClear } from "@topdown/shared";
import { bootTestServer } from "../../apps/server/src/test/bootTestServer";
import type { RunRoom } from "../../apps/server/src/rooms/RunRoom";
import { BotClient } from "./botClient";
import { startCutLine, type CutLine } from "../netaudit/cutLine";
import { startLagLine, type LagLine } from "../netaudit/lagLine";

/**
 * Story 8.1 AC 11 "the 8 s cut": 4 real bots on a real server, wave 3+, one bot's line cut both ways
 * for 8 s (no bytes, no close). The bot must be back in its seat — loadout, wallet and HP as at the
 * hold — within 10 s of the cut ending, through its own watchdog + token reconnect / guest-token
 * takeover (the shared `net/reconnect.ts` rules the phone uses), and the run must go on to the next
 * build phase. All four bots play on Story 8.8's lossy line (150 ms ± 10, 1 % × 200 ms stalls both
 * ways, `lagLine.ts`); the cut line sits in front of bot 2's connection to it. Liveness: the server
 * really logged `player_held` and `player_returned`, the cut really held bytes, the lossy line
 * really stalled, and the bot really logged a reconnect.
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
async function until(ok: () => boolean, timeoutMs: number, stepMs = 50): Promise<boolean> {
  const t0 = performance.now();
  while (!ok()) {
    if (performance.now() - t0 > timeoutMs) return false;
    await sleep(stepMs);
  }
  return true;
}

describe("Story 8.1 the 8 s cut (AC 11)", () => {
  // E8-A8 (no test over 30 s; was 42 s in CI): the one run is split into its steps, in order, on the same room and
  // bots (as spots.test was split per stage): each step needs the ones before it (a -t filter on one step fails it).
  describe("a bot whose line is cut both ways for 8 s mid-wave is back in its seat within 10 s of the cut ending, as held, and the run goes on", () => {
    // The god-mode `net150` scenario (from wave 4): bots on the lossy line sometimes lose wave 3 outright
    // (1 of 3 runs before this switch: a wipe, not a reconnect failure; bots are not difficulty
    // evidence, brief 31), so the run's going on tests the reconnect, not the bots' aim.
    const lines: Record<string, unknown>[] = [];
    const log = (l: Record<string, unknown>): void => void lines.push(l);
    let lossy: LagLine | null = null;
    let cut: CutLine | null = null;
    const bots: BotClient[] = [];
    let room: RunRoom;
    let info: MockInstance<RunRoom["log"]["info"]>;
    const logged = (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);
    // Flake fix (re-review 2: failed twice at load ≈ 4.8): every wait is on a condition with room to spare,
    // scaled by the machine load (capped ×2, RR3-L1); the AC's 10 s bound itself stays fixed.
    let loadSlack = 1;
    let cutBot: BotClient;
    let id = "";
    let world: NonNullable<RunRoom["controller"]>["world"];
    // What the seat holds at the hold (the server decides it ~3 s into the cut: the bot went quiet).
    let atHold: { hp: number; wallet: number; weapons: string[] } | null = null;
    let backAfterMs = Infinity;
    afterAll(async () => {
      await Promise.all(bots.map((b) => b.stop()));
      await cut?.close();
      await lossy?.close();
    });

    it("step 1: 4 bots on the lossy line (bot 2 behind the cut line) start the net150 run and fight in wave 3+", async () => {
      lossy = await startLagLine({ listen: 0, target: port, rttMs: 150, jitterMs: 20, lossPct: 1 });
      const url = `http://127.0.0.1:${lossy.port}`;
      const host = await BotClient.connect({ url, name: "Bot 1", log, scenario: "net150" });
      bots.push(host);
      cut = await startCutLine({ target: lossy.port });
      for (let i = 2; i <= 4; i++) bots.push(await BotClient.connect({ url: i === 2 ? `http://127.0.0.1:${cut.port}` : url, name: `Bot ${i}`, roomId: host.roomId, log }));
      room = colyseus.getRoomById<RunRoom>(host.roomId) as unknown as RunRoom;
      info = vi.spyOn(room.log, "info");
      loadSlack = Math.min(2, Math.max(1, (loadavg()[0] ?? 0) / 2));
      expect(await until(() => room.members.size === 4 && [...room.state.players.values()].every((p) => p.ready), 30_000)).toBe(true);
      host.room.send(C2S.RUN_START, {});
      expect(await until(() => room.state.phase === "wave", 60_000)).toBe(true);
      cutBot = bots[1] as BotClient;
      id = cutBot.playerId;
      await sleep(2000); // a little fighting first
      const w = room.controller?.world;
      if (!w) throw new Error("no run");
      world = w;
      expect(world.waves.number).toBeGreaterThanOrEqual(3);
    }, 120_000);

    it("step 2: the 8 s cut both ways → held, then back in its seat within 10 s of the cut ending", async () => {
      expect(world, "step 1 ran").toBeDefined();
      const line = cut as CutLine;
      info.mockImplementation((obj: unknown, msg?: unknown) => {
        if (msg === "player_held" && (obj as { playerId?: string }).playerId === id) {
          const p = world.heldPlayers.get(id)?.player;
          if (p) atHold = { hp: p.hp, wallet: p.wallet, weapons: p.loadout.slots.map((s) => s?.weapon ?? "") };
        }
      });
      const cutEnds = line.cut(8000);
      const cutEndAt = performance.now() + 8000;
      await cutEnds;
      expect(line.stats().heldBytesDown).toBeGreaterThan(0); // the line really held traffic
      const back = await until(() => cutBot.link === "ok" && world.players.has(id), 15_000 * loadSlack);
      backAfterMs = performance.now() - cutEndAt;
      expect(back).toBe(true);
      expect(backAfterMs).toBeLessThanOrEqual(10_000);
      expect(logged("player_held").some((l) => l.playerId === id)).toBe(true);
      expect(logged("player_returned").some((l) => l.playerId === id)).toBe(true);
      expect(cutBot.reconnects.length).toBeGreaterThanOrEqual(1);
      expect(lines.some((l) => l.msg === "bot_reconnected" && l.bot === "Bot 2")).toBe(true);
    }, 120_000);

    it("step 3: back as held (HP and weapons exactly, wallet at least), and its inputs are applied again", async () => {
      expect(backAfterMs, "step 2 ran").toBeLessThanOrEqual(10_000);
      // As held: HP and weapons exactly, wallet at least (its turrets may pay while held: F5).
      const held = atHold as { hp: number; wallet: number; weapons: string[] } | null;
      expect(held).not.toBeNull();
      const p = world.players.get(id);
      expect(p?.loadout.slots.map((s) => s?.weapon ?? "")).toEqual(held?.weapons);
      expect(p?.wallet).toBeGreaterThanOrEqual(held?.wallet ?? Infinity);
      expect(p?.hp).toBeLessThanOrEqual(held?.hp ?? -1); // nothing healed it (protection: nothing hurt it either, at first)
      expect(room.members.size).toBe(4);
      // The bot plays again: its inputs are applied.
      const ack = room.controller?.ackSeq(id) ?? 0;
      expect(await until(() => (room.controller?.ackSeq(id) ?? 0) > ack, 15_000)).toBe(true);
    }, 60_000);

    it("step 4: the run goes on to the next build phase; the lossy line really stalled", async () => {
      expect(backAfterMs, "step 2 ran").toBeLessThanOrEqual(10_000);
      // The run goes on to the next build phase.
      const wave = world.waves.number;
      const ended = await until(() => room.state.phase === "build" || room.state.phase === "results", 150_000, 250);
      if (!ended) console.log(JSON.stringify({ msg: "cut_test_stuck", phase: room.state.phase, frozen: room.state.frozen, wave: world.waves.number, tick: world.tick, players: [...world.players.values()].map((q) => ({ id: q.id, x: Math.round(q.x), y: Math.round(q.y), status: q.status, protect: q.protectTicks })), zombies: Array.from(world.zombies.aliveIds.subarray(0, world.zombies.aliveCount), (z) => ({ x: Math.round(world.zombies.x[z] ?? 0), y: Math.round(world.zombies.y[z] ?? 0), t: world.zombies.type[z], s: world.zombies.state[z], hp: Math.round(world.zombies.hp[z] ?? 0), w: world.zombies.waveZombie[z] })), held: [...world.heldPlayers.keys()], holds: [...room.holds.keys()], remaining: world.waves.remaining, queued: world.waves.queued, bots: bots.map((b) => b.link), buildings: world.buildings.list.map((b) => ({ t: b.type, o: b.ownerId, x0: +b.minX.toFixed(1), y0: +b.minY.toFixed(1), x1: +b.maxX.toFixed(1), y1: +b.maxY.toFixed(1), hp: Math.round(b.hp), sb: b.stopsBullets })), lines: Array.from(world.zombies.aliveIds.subarray(0, world.zombies.aliveCount), (z) => [...world.players.values()].map((q) => { const zx = world.zombies.x[z] ?? 0; const zy = world.zombies.y[z] ?? 0; return `${q.id}:${Math.hypot(zx - q.x, zy - q.y).toFixed(1)}m bullet=${bulletLineClear(world, q.x, q.y, zx, zy) ? 1 : 0} spit=${shotLineClear(world, zx, zy, q.x, q.y) ? 1 : 0}`; })) }));
      expect(ended).toBe(true);
      expect(room.state.phase).toBe("build");
      expect(world.waves.number).toBe(wave);
      const st = (lossy as LagLine).stats();
      expect(st.stallsUp + st.stallsDown).toBeGreaterThan(0); // the lossy line really stalled
      console.log(JSON.stringify({ msg: "cut_test", backAfterCutEndMs: Math.round(backAfterMs), loadSlack, reconnects: cutBot.reconnects, held: atHold, wave, stalls: st }));
    }, 180_000);
  });
});
