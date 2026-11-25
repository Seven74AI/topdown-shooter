import { randomBytes } from "node:crypto";
import { Callbacks, type Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { BYTES, C2S, DEFAULT_LOOK, DOWNTOWN_MAP, LOOK_CODE_MAX, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, S2C, decodeLook, downPlayer, encodeLook, endWave, startWave, type RunStateView } from "@topdown/shared";
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
  netProtocolVersion: NET_PROTOCOL_VERSION, // Story 8.10 (review M2)
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
  it("1,000 random looks (unicode, v1| prefixes, objects, up to the 1 KB options cap) are all accepted, each canonical ≤ 96 characters; larger options are refused by the cap, not the look", async () => {
    let s = 0x79;
    const r = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const alphabet = "v1|:,abcdefghijklmnopqrstuvwxyz0123456789#ÉΩ😀 ";
    const parts = ["top:hoodie", "head:riot", "head:prop", "pack:golf", "skin:9", "c:ffffff,000000,123456", "hair:bald"];
    let accepted = 0;
    let capped = 0;
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
      if (JSON.stringify(options).length > 1024) {
        // Review L3: the whole-options cap (MAX_CLIENT_MESSAGE_BYTES, Story 2.1) refuses these before any look rule.
        await expect(RunRoom.onAuth("", options, ctx)).rejects.toThrow("invalid_options");
        capped++;
        continue;
      }
      const auth = await RunRoom.onAuth("", options, ctx);
      expect(auth.look.length).toBeLessThanOrEqual(LOOK_CODE_MAX);
      expect(encodeLook(decodeLook(auth.look).look)).toBe(auth.look); // canonical
      accepted++;
    }
    expect(accepted).toBeGreaterThan(900); // liveness: the fuzz really went through onAuth
    expect(capped).toBeGreaterThan(0); // the 10 kB cases exist and meet the options cap
    expect(accepted + capped).toBe(1000);
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

  it("L4: 0 B/s per tick — 4 players, 200 ticks: the look never changes in a patch, and the bytes per tick equal a run with default looks", async () => {
    // Review L4: 4 custom looks vs 4 default looks, 200 ticks each; plus a listener on every player's `look` on a client.
    const run = async (looks: string[]): Promise<{ perTick: number; lookChanges: number }> => {
      vi.stubEnv("DEV_NO_WAVES", "1");
      const host = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "P0", token(), looks[0])));
      const others: RunSdkRoom[] = [];
      for (let i = 1; i < 4; i++) others.push(quiet(await colyseus.sdk.joinById<RunStateView>(host.roomId, opts("join", `P${i}`, token(), looks[i]))));
      const room = roomOf(host);
      await vi.waitFor(() => expect(room.members.size).toBe(4));
      for (const c of [host, ...others]) c.send(C2S.LOBBY_SET_READY, { ready: true });
      await vi.waitFor(() => expect([...room.state.players.values()].every((p) => p.ready)).toBe(true));
      host.send(C2S.RUN_START, {});
      for (const c of [host, ...others]) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
      const w = room.controller?.world;
      if (!w) throw new Error("no run");
      // The build phase (25 s): it ticks with idle bots (a wave would put 4 quiet players on hold and freeze, Story 8.1).
      await new Promise((r) => setTimeout(r, 300)); // the start patch has gone out
      let lookChanges = 0;
      const $ = Callbacks.get(others[0] as never) as unknown as { listen(o: unknown, k: string, cb: () => void, immediate?: boolean): () => void };
      const offs: (() => void)[] = [];
      (others[0] as RunSdkRoom).state.players.forEach((p) => offs.push($.listen(p, "look", () => lookChanges++, false)));
      expect(offs).toHaveLength(4);
      const meter = room.netMeters.get(host.sessionId);
      if (!meter) throw new Error("no meter");
      const start = meter.out.totalBytes;
      const t0 = w.tick;
      await vi.waitFor(() => expect(w.tick - t0).toBeGreaterThanOrEqual(200), { timeout: 20_000, interval: 50 });
      const perTick = (meter.out.totalBytes - start) / (w.tick - t0);
      for (const off of offs) off();
      await colyseus.cleanup();
      return { perTick, lookChanges };
    };
    const plain = await run([DEFAULT_CODE, DEFAULT_CODE, DEFAULT_CODE, DEFAULT_CODE]);
    const custom = await run([STARTER, STARTER.replace("skin:4", "skin:7"), STARTER.replace("top:hoodie", "top:puffer"), STARTER.replace("hair:mohawk", "hair:bald")]);
    expect(plain.perTick).toBeGreaterThan(0); // liveness: ticks were sent
    expect(custom.lookChanges).toBe(0);
    expect(plain.lookChanges).toBe(0);
    expect(Math.abs(custom.perTick - plain.perTick) / plain.perTick).toBeLessThan(0.05); // same run, only the looks differ
  }, 60_000);
});
