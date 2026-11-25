import { randomBytes } from "node:crypto";
import type { Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { BYTES, C2S, DEFAULT_LOOK, DOWNTOWN_MAP, LOOK_CODE_MAX, RUN_ROOM_NAME, S2C, decodeLook, downPlayer, encodeLook, endWave, startWave, type RunStateView } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, authLog, serverBalance } from "./RunRoom";

/**
 * Story 7.9 T3 (AC 5, 6; L1, L2, L4, NP 21): the join carries the look, the server decodes it against what the account
 * owns (starter parts until 7.11), one canonical string sits on the player state, set once, kept on a lobby return,
 * by a held seat, a takeover and a remembered seat, and never costs a byte per tick.
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
const DEFAULT_CODE = encodeLook(DEFAULT_LOOK);
const STARTER = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";
const token = (): string => randomBytes(16).toString("hex");
const opts = (intent: "create" | "join", name: string, guestToken: string, look?: unknown) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  guestToken,
  ...(look === undefined ? {} : { look }),
});
const quiet = (c: RunSdkRoom): RunSdkRoom => {
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) c.onMessage(t, () => {});
  return c;
};
const roomOf = (c: RunSdkRoom): RunRoom => colyseus.getRoomById<RunRoom>(c.roomId) as unknown as RunRoom;

/** A context for the static onAuth (what Colyseus passes). */
const ctx = { ip: "10.9.9.9" } as Parameters<typeof RunRoom.onAuth>[2];

describe("L1: a look can't break the game (checkAuth)", () => {
  it("1,000 random looks (10 kB, unicode, v1| prefixes, objects) are all accepted, each canonical ≤ 96 characters", async () => {
    let s = 0x79;
    const r = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const alphabet = "v1|:,abcdefghijklmnopqrstuvwxyz0123456789#ÉΩ😀 ";
    const parts = ["top:hoodie", "head:riot", "head:prop", "pack:golf", "skin:9", "c:ffffff,000000,123456", "hair:bald"];
    let accepted = 0;
    for (let i = 0; i < 1000; i++) {
      let look: unknown;
      if (i % 97 === 0) look = { head: "riot" };
      else if (i % 89 === 0) look = 12345;
      else {
        let str = r() < 0.6 ? "v1|" : "";
        const n = i % 100 === 0 ? Math.floor(3000 + r() * 7000) : Math.floor(r() * 120);
        for (let j = 0; j < n; j++) str += r() < 0.15 ? `${parts[Math.floor(r() * parts.length)]}|` : alphabet[Math.floor(r() * alphabet.length)];
        look = str;
      }
      const options = opts("join", "Ana", token(), look);
      if (JSON.stringify(options).length > 1024) continue; // the whole-options size cap applies as before (not a look rule)
      const auth = await RunRoom.onAuth("", options, ctx);
      expect(auth.look.length).toBeLessThanOrEqual(LOOK_CODE_MAX);
      expect(encodeLook(decodeLook(auth.look).look)).toBe(auth.look); // canonical
      accepted++;
    }
    expect(accepted).toBeGreaterThan(900); // liveness: the fuzz really went through onAuth
  });

  it("logs look_replaced with the count only, never the look text; a clean look logs nothing", async () => {
    const info = vi.spyOn(authLog, "info");
    const auth = await RunRoom.onAuth("", opts("join", "Ana", token(), "v1|top:secretword|head:riot|hair:short|pack:backpack|skin:1|c:3c5670,231f1c,1f2326"), ctx);
    expect(auth.look).toBe(DEFAULT_CODE);
    const lines = info.mock.calls.filter((c) => c[1] === "look_replaced");
    expect(lines).toEqual([[{ fields: 2 }, "look_replaced"]]);
    expect(JSON.stringify(info.mock.calls)).not.toContain("secretword");
    info.mockClear();
    await RunRoom.onAuth("", opts("join", "Ana", token(), STARTER), ctx);
    await RunRoom.onAuth("", opts("join", "Ana", token()), ctx); // no look sent: not a replacement
    expect(info.mock.calls.filter((c) => c[1] === "look_replaced")).toEqual([]);
  });
});

describe("AC 5: the join carries the look; a look never stops a join", () => {
  it("12 bad looks: 12 joins accepted (4 rooms × create + 2 joins), each with default parts where it is bad", async () => {
    const bad: unknown[] = ["", "x".repeat(800), "v2|top:hoodie", "v1|head:RIOT", "v1|head:riot ", "v1|head:riot|head:cap", `v1|top:${"a".repeat(9)}`, { look: 1 }, 42, ["v1"], "v1|" + "|".repeat(200), "v1|c:#ff0000,ZZZZZZ"];
    let joined = 0;
    for (let k = 0; k < 4; k++) {
      const host = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", token(), bad[k * 3])));
      const room = roomOf(host);
      joined++;
      for (const j of [1, 2]) {
        quiet(await colyseus.sdk.joinById<RunStateView>(host.roomId, opts("join", `P${j}`, token(), bad[k * 3 + j])));
        joined++;
      }
      await vi.waitFor(() => expect(room.members.size).toBe(3));
      for (const p of room.state.players.values()) expect(decodeLook(p.look).replaced).toBe(0); // every stored code is clean
    }
    expect(joined).toBe(12);
  });

  it("L2: an unowned part (head:riot, pack:golf) is the default part on the room state; owned parts are kept", async () => {
    const host = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", token(), STARTER.replace("head:beanie", "head:riot").replace("pack:school", "pack:golf"))));
    const room = roomOf(host);
    await vi.waitFor(() => expect(room.members.size).toBe(1));
    expect(room.state.players.get("p0")?.look).toBe(STARTER.replace("head:beanie", "head:cap").replace("pack:school", "pack:backpack"));
    // the wearer's own copy of the state says the same (the client draws state.look for itself too)
    await vi.waitFor(() => expect(host.state.players.get("p0")?.look).toBe(STARTER.replace("head:beanie", "head:cap").replace("pack:school", "pack:backpack")));
  });

  it("no look (bots, old tabs) joins with the default look", async () => {
    const host = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", token())));
    await vi.waitFor(() => expect(host.state.players.get("p0")?.look).toBe(DEFAULT_CODE));
  });
});

/** A started 2-player run (waves paused). */
async function startedTwo(looks: [string, string]) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const tokens = [token(), token()];
  const host = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", tokens[0] as string, looks[0])));
  const bo = quiet(await colyseus.sdk.joinById<RunStateView>(host.roomId, opts("join", "Bo", tokens[1] as string, looks[1])));
  const room = roomOf(host);
  await vi.waitFor(() => expect(room.members.size).toBe(2));
  for (const c of [host, bo]) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.state.players.values()].every((p) => p.ready)).toBe(true));
  host.send(C2S.RUN_START, {});
  for (const c of [host, bo]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return { host, bo, room, w, tokens };
}

describe("AC 6: one string on the room state, set once", () => {
  it("kept through a run and a lobby return (resetRunFields keeps it, like the name)", async () => {
    const { host, bo, room, w } = await startedTwo([STARTER, DEFAULT_CODE]);
    expect(room.state.players.get("p0")?.look).toBe(STARTER);
    startWave(w);
    endWave(w);
    w.players.forEach((p) => downPlayer(w, p));
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    host.send(C2S.LOBBY_RETURN, {});
    await vi.waitFor(() => expect(bo.state.phase).toBe("lobby"));
    expect(bo.state.players.get("p0")?.look).toBe(STARTER);
    expect(bo.state.players.get("p1")?.look).toBe(DEFAULT_CODE);
  });

  it("NP 21: a takeover keeps the seat's look; the new connection's look is ignored mid-run", async () => {
    const { bo, room, tokens } = await startedTwo([DEFAULT_CODE, STARTER]);
    const fresh = quiet(await colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", tokens[1] as string, DEFAULT_CODE.replace("top:jacket", "top:puffer"))));
    await vi.waitFor(() => expect([...room.members.values()].some((m) => m.sessionId === fresh.sessionId)).toBe(true));
    expect(room.state.players.get("p1")?.look).toBe(STARTER);
    expect([...room.members.values()].find((m) => m.playerId === "p1")?.look).toBe(STARTER);
  });

  it("NP 21: a remembered seat (hold ran out) comes back with its own look", async () => {
    const { bo, room, w, tokens } = await startedTwo([DEFAULT_CODE, STARTER]);
    room.holdS = 0.3;
    startWave(w);
    bo.reconnection.enabled = false;
    const server = room.clients.find((c) => c.sessionId === bo.sessionId);
    (server?.ref as unknown as { terminate(): void }).terminate();
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1), { timeout: 3000 });
    expect([...room.rememberedSeats.values()][0]?.look).toBe(STARTER);
    endWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    quiet(await colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", tokens[1] as string, DEFAULT_CODE)));
    await vi.waitFor(() => expect(room.state.players.get("p1")?.look).toBe(STARTER));
    expect([...room.members.values()].find((m) => m.playerId === "p1")?.look).toBe(STARTER); // remembered again with it
  });

  it("L4: 0 B/s per tick — the bytes per tick with 4 custom looks equal those with 4 default looks", async () => {
    // Same run twice, only the looks differ: what the room sends per tick after the join must be identical.
    const bytesPerTick = async (looks: [string, string]): Promise<number> => {
      const { host, room, w } = await startedTwo(looks);
      const meter = room.netMeters.get(host.sessionId);
      if (!meter) throw new Error("no meter");
      startWave(w);
      await new Promise((r) => setTimeout(r, 300)); // the look went out with the join; now only ticks
      const start = meter.out.totalBytes;
      const t0 = w.tick;
      await vi.waitFor(() => expect(w.tick - t0).toBeGreaterThanOrEqual(20), { timeout: 5000 });
      const ticks = w.tick - t0;
      const bytes = meter.out.totalBytes - start;
      await colyseus.cleanup();
      expect(ticks).toBeGreaterThan(0);
      return bytes / ticks;
    };
    const plain = await bytesPerTick([DEFAULT_CODE, DEFAULT_CODE]);
    const custom = await bytesPerTick([STARTER, STARTER.replace("skin:4", "skin:7")]);
    expect(plain).toBeGreaterThan(0); // liveness: ticks were sent
    expect(Math.abs(custom - plain) / plain).toBeLessThan(0.15); // no look bytes per tick (pings and timing jitter only)
  });
});
