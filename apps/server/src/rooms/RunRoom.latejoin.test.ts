import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  BYTES,
  C2S,
  DOWNTOWN_MAP,
  NET_PROTOCOL_VERSION,
  RUN_ROOM_NAME,
  S2C,
  endWave,
  startWave,
  ticksFor,
  waveSize,
  type PlayerLeft,
  type RunJoined,
  type RunStateView,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { RunRoom, serverBalance } from "./RunRoom";

/**
 * Story 8.2 fairness rules (J1–J7) through a real room: join mid-run at a build phase, watch mid-wave, the money,
 * +15 s once, never a teammate's slot. Waves paused (DEV_NO_WAVES): only what the test does happens.
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
const NAMES = ["Ana", "Bo", "Cy", "Di", "Eve"];
const token = () => randomBytes(16).toString("hex");
const options = (intent: "create" | "join", name: string, guestToken: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION,
  guestToken,
});

interface Seen {
  left: PlayerLeft[];
  joined: RunJoined[];
  hordeFrames: number;
  offers: number;
}

function record(client: RunSdkRoom): Seen {
  const seen: Seen = { left: [], joined: [], hordeFrames: 0, offers: 0 };
  client.onMessage(S2C.RUN_JOINED, (m: RunJoined) => seen.joined.push(m));
  client.onMessage(BYTES.HORDE_FRAME, () => seen.hordeFrames++);
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.PLAYER_LEFT, (m: PlayerLeft) => seen.left.push(m));
  client.onMessage(S2C.SHOP_OFFERED, () => seen.offers++);
  client.onMessage(S2C.RUN_STARTED, () => {});
  client.onMessage(S2C.RUN_REWARDS, () => {});
  client.onMessage(S2C.PLAYER_REMOVED, () => {});
  return seen;
}

async function runOf(n: number) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const tokens = Array.from({ length: n }, token);
  const clients: RunSdkRoom[] = [];
  for (let i = 0; i < n; i++) {
    const c =
      i === 0
        ? await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", NAMES[i] as string, tokens[i] as string))
        : await colyseus.sdk.joinById<RunStateView>((clients[0] as RunSdkRoom).roomId, options("join", NAMES[i] as string, tokens[i] as string));
    record(c);
    await c.waitForInitialState();
    clients.push(c);
  }
  const room = colyseus.getRoomById<RunRoom>((clients[0] as RunSdkRoom).roomId) as unknown as RunRoom;
  room.allowSoloStart = true;
  await vi.waitFor(() => expect(room.members.size).toBe(n));
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  (clients[0] as RunSdkRoom).send(C2S.RUN_START, {});
  for (const c of clients) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { clients, room, tokens };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

async function late(room: RunRoom, name: string, guestToken = token()) {
  const c = await colyseus.sdk.joinById<RunStateView>(room.roomId, options("join", name, guestToken));
  const seen = record(c);
  await c.waitForInitialState();
  return { c, seen, guestToken };
}

function logLines(room: RunRoom) {
  const info = vi.spyOn(room.log, "info");
  return (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);
}

const EXTRA = ticksFor(serverBalance.economy.lateJoin.extraBuildS);

describe("Story 8.2 J1: late is welcome, not rich", () => {
  it("a build-phase joiner gets max(own start, 100 + ⌊0.6 × team average earned⌋), a Pistol and a new slot (log player_joined_mid_run)", async () => {
    const { room } = await runOf(2);
    const lines = logLines(room);
    const w = world(room);
    w.players.get("p0")!.earned = 800;
    w.players.get("p1")!.earned = 1000; // avg 900 → 640
    const { c } = await late(room, "Cy");
    await vi.waitFor(() => expect(w.players.has("p2")).toBe(true));
    const cy = w.players.get("p2")!;
    expect(cy.wallet).toBe(640);
    expect(cy.loadout.slots[0]?.weapon).toBe("pistol");
    expect(room.state.players.get("p2")?.waiting).toBe(false);
    await vi.waitFor(() => expect(c.state.players.get("p2")?.wallet).toBe(640)); // from the patch (the client never computes it)
    expect(lines("player_joined_mid_run")).toEqual([expect.objectContaining({ playerId: "p2", slot: 2, wave: 0, wallet: 640, avgEarned: 900 })]);
  });

  it("the first build phase never pays less than a normal start (avg 0 → 200)", async () => {
    const { room } = await runOf(1);
    const w = world(room);
    await late(room, "Bo");
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    expect(w.players.get("p1")?.wallet).toBe(serverBalance.economy.startingWallet);
  });

  it("≈ wave 9 (team average 2,170 earned) → 1,402: still behind the others", async () => {
    const { room } = await runOf(1);
    const w = world(room);
    w.players.get("p0")!.earned = 2170;
    await late(room, "Bo");
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    expect(w.players.get("p1")?.wallet).toBe(1402);
  });
});

describe("Story 8.2 J2: quitting and rejoining never pays", () => {
  it("a consented Leave then a rejoin with the same token in a build phase → the own seat (its wallet), never late money", async () => {
    const { clients, room, tokens } = await runOf(2);
    const w = world(room);
    w.players.get("p0")!.earned = 3000;
    w.players.get("p1")!.wallet = 15;
    await (clients[1] as RunSdkRoom).leave(true);
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
    const { c } = await late(room, "Bo", tokens[1]);
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    expect(w.players.get("p1")?.wallet).toBe(15);
    expect(c.state.players.get("p1")?.waiting ?? false).toBe(false);
  });
});

describe("Story 8.2 J3: a late join never steals a teammate's seat", () => {
  it("every free slot belongs to a held/remembered seat → run_full; the remembered seat keeps its slot", async () => {
    const { clients, room } = await runOf(4);
    await (clients[3] as RunSdkRoom).leave(true); // Di's seat is remembered (slot 3)
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
    expect(room.takenSlots().sort()).toEqual([0, 1, 2, 3]);
    await expect(colyseus.sdk.joinById(room.roomId, options("join", "Eve", token()))).rejects.toThrow("run_full");
    expect(room.state.players.has("p3")).toBe(false);
    expect([...room.rememberedSeats.values()][0]?.slot).toBe(3);
  });

  it("two strangers at once into the last free slot: one gets in, the other run_full", async () => {
    const { room } = await runOf(3);
    const both = await Promise.allSettled([
      colyseus.sdk.joinById<RunStateView>(room.roomId, options("join", "Di", token())),
      colyseus.sdk.joinById<RunStateView>(room.roomId, options("join", "Eve", token())),
    ]);
    const ok = both.filter((r) => r.status === "fulfilled");
    const bad = both.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect(String((bad[0] as PromiseRejectedResult).reason)).toContain("run_full");
    for (const r of ok) record((r as PromiseFulfilledResult<RunSdkRoom>).value);
    expect(room.members.size).toBe(4);
  });
});

describe("Story 8.2 J4 + J6: mid-wave, you watch; the next wave is sized for who is here", () => {
  it("a mid-wave joiner waits (not in the World, horde frames to watch), then enters at build.started with money computed then", async () => {
    const { room } = await runOf(2);
    const lines = logLines(room);
    const w = world(room);
    startWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    const { c, seen } = await late(room, "Cy");
    await vi.waitFor(() => expect(room.state.players.get("p2")?.waiting).toBe(true));
    expect(w.players.has("p2")).toBe(false); // not a target, not counted, not in the wipe check or the freeze
    expect(room.controller?.activeCount()).toBe(2);
    await vi.waitFor(() => expect(seen.hordeFrames).toBeGreaterThan(3)); // watching the fight
    expect(c.state.players.get("p2")?.waiting).toBe(true);
    w.players.get("p0")!.earned = 900;
    w.players.get("p1")!.earned = 900; // earned during the wave: the money is computed at entry
    endWave(w);
    await vi.waitFor(() => expect(w.players.has("p2")).toBe(true));
    expect(room.state.players.get("p2")?.waiting).toBe(false);
    // Computed at entry: the wave-1 clear bonus (15) is in the team's earned by then → avg 915 → 100 + 549.
    expect(w.players.get("p0")?.earned).toBe(915);
    expect(w.players.get("p2")?.wallet).toBe(649);
    expect(w.run.buildTicksLeft).toBeGreaterThan(ticksFor(serverBalance.waves.buildPhaseS)); // +15 s applied once
    expect(lines("player_joined_mid_run")).toEqual([expect.objectContaining({ playerId: "p2", wave: 1 })]);
    await vi.waitFor(() => expect(seen.offers).toBeGreaterThan(0)); // its card offer
    startWave(w);
    expect(w.waves.size).toBe(waveSize(serverBalance, 2, 3)); // J6: 3 seats now
  });

  it("everyone held + one waiting joiner: the World stays frozen (the waiter is no one to play)", async () => {
    const { clients, room } = await runOf(1);
    const w = world(room);
    startWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    await late(room, "Bo");
    await vi.waitFor(() => expect(room.state.players.get("p1")?.waiting).toBe(true));
    const ana = clients[0] as RunSdkRoom;
    ana.reconnection.enabled = false;
    const server = room.clients.find((x) => x.sessionId === ana.sessionId);
    (server?.ref as unknown as { terminate(): void }).terminate();
    await vi.waitFor(() => expect(room.state.frozen).toBe(true), { timeout: 8000 });
    expect(room.state.hostSlot).toBe(0); // nobody connected and non-waiting: the role stays (H1)
  });

  it("a waiting joiner who drops just frees the reserved slot (nothing held or remembered)", async () => {
    const { room } = await runOf(1);
    const w = world(room);
    startWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    const { c } = await late(room, "Bo");
    await vi.waitFor(() => expect(room.state.players.get("p1")?.waiting).toBe(true));
    c.reconnection.enabled = false;
    const server = room.clients.find((x) => x.sessionId === c.sessionId);
    (server?.ref as unknown as { terminate(): void }).terminate();
    await vi.waitFor(() => expect(room.state.players.has("p1")).toBe(false));
    expect(room.holds.size).toBe(0);
    expect(room.rememberedSeats.size).toBe(0);
    expect(room.takenSlots()).toEqual([0]);
  });
});

describe("Story 8.2 J5: a join buys shopping time, once", () => {
  it("the first late join of a build adds +15 s; a second join adds nothing; an own seat back adds nothing", async () => {
    const { clients, room, tokens } = await runOf(2);
    const w = world(room);
    await (clients[1] as RunSdkRoom).leave(true);
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
    const t0 = w.run.buildTicksLeft;
    await late(room, "Bo", tokens[1]); // own seat back
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    expect(w.run.joinExtendedBuild).toBe(false);
    expect(t0 - w.run.buildTicksLeft).toBeLessThan(EXTRA / 2); // only ticking down
    await late(room, "Cy");
    await vi.waitFor(() => expect(w.players.has("p2")).toBe(true));
    expect(w.run.joinExtendedBuild).toBe(true);
    const t1 = w.run.buildTicksLeft;
    expect(t1).toBeGreaterThan(t0 + EXTRA - 40);
    await late(room, "Di");
    await vi.waitFor(() => expect(w.players.has("p3")).toBe(true));
    expect(w.run.buildTicksLeft).toBeLessThanOrEqual(t1); // no second extension
  });
});

describe("Story 8.2 J7: Supplies count only the waves I was in", () => {
  it("a late joiner's wavesIn / bossesIn start at 0; the team's keep theirs", async () => {
    const { room } = await runOf(1);
    const w = world(room);
    w.players.get("p0")!.wavesIn = 4;
    await late(room, "Bo");
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(true));
    expect([w.players.get("p1")?.wavesIn, w.players.get("p1")?.bossesIn]).toEqual([0, 0]);
    expect(w.players.get("p0")?.wavesIn).toBe(4);
  });
});

describe("Story 8.2 AC 4: a run that ends while they wait shows them Results", () => {
  it("the last player's hold runs out mid-wave with only a waiting joiner left → Results for them", async () => {
    const { clients, room } = await runOf(1);
    room.holdS = 0.5;
    const w = world(room);
    startWave(w);
    await vi.waitFor(() => expect(room.state.phase).toBe("wave"));
    const { c } = await late(room, "Bo");
    await vi.waitFor(() => expect(room.state.players.get("p1")?.waiting).toBe(true));
    const ana = clients[0] as RunSdkRoom;
    ana.reconnection.enabled = false;
    const server = room.clients.find((x) => x.sessionId === ana.sessionId);
    (server?.ref as unknown as { terminate(): void }).terminate();
    await vi.waitFor(() => expect(c.state.phase).toBe("results"), { timeout: 10_000 });
  });
});
