import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import type { ColyseusTestServer } from "@colyseus/testing";
import type { Room as SdkRoom } from "@colyseus/sdk";
import { randomBytes } from "node:crypto";
import {
  BYTES,
  C2S,
  HORDE_KIND_KEY,
  HordeStreamDecoder,
  NET_PROTOCOL_VERSION,
  spawnZombie,
  DOWNTOWN_MAP,
  NEUTRAL_INPUT,
  RUN_ROOM_NAME,
  S2C,
  downPlayer,
  endWave,
  startWave,
  worldDigest,
  type PlayerLeft,
  type RunJoined,
  type RunStateView,
} from "@topdown/shared";
import { bootTestServer } from "../test/bootTestServer";
import { CLOSE_TAKEN_OVER, QUIET_HOLD_TICKS } from "../net/limits";
import { RunRoom, serverBalance } from "./RunRoom";

/** Story 8.1 integration: drop → hold → return, takeover, remembered seats, quiet holds, freeze. */
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NAMES = ["Ana", "Bo", "Cy", "Di"];
const options = (intent: "create" | "join", name: string, guestToken: string) => ({
  intent,
  name,
  balanceVersion: serverBalance.version,
  mapVersion: DOWNTOWN_MAP.version,
  netProtocolVersion: NET_PROTOCOL_VERSION, // Story 8.10's join check
  guestToken,
});

interface Seen {
  left: PlayerLeft[];
  joined: RunJoined[];
}

function record(client: RunSdkRoom): Seen {
  const seen: Seen = { left: [], joined: [] };
  client.onMessage(S2C.RUN_JOINED, (m: RunJoined) => seen.joined.push(m));
  client.onMessage(BYTES.HORDE_FRAME, () => {});
  client.onMessage(S2C.SIM_EVENTS_FLUSHED, () => {});
  client.onMessage(S2C.NET_PINGED, () => {});
  client.onMessage(S2C.PLAYER_LEFT, (m: PlayerLeft) => seen.left.push(m));
  client.onMessage(S2C.SHOP_OFFERED, () => {});
  return seen;
}

/** A started run (waves paused: only what the test does happens). `tokens[i]` is player i's guest token. */
async function runOf(n: number) {
  vi.stubEnv("DEV_NO_WAVES", "1");
  const tokens = Array.from({ length: n }, () => randomBytes(16).toString("hex"));
  const clients: RunSdkRoom[] = [];
  const seen: Seen[] = [];
  for (let i = 0; i < n; i++) {
    const c =
      i === 0
        ? await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", NAMES[i] as string, tokens[i] as string))
        : await colyseus.sdk.joinById<RunStateView>((clients[0] as RunSdkRoom).roomId, options("join", NAMES[i] as string, tokens[i] as string));
    seen.push(record(c));
    await c.waitForInitialState();
    clients.push(c);
  }
  const room = colyseus.getRoomById<RunRoom>((clients[0] as RunSdkRoom).roomId) as unknown as RunRoom;
  await vi.waitFor(() => expect(room.members.size).toBe(n));
  for (const c of clients) c.send(C2S.LOBBY_SET_READY, { ready: true });
  await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true));
  (clients[0] as RunSdkRoom).send(C2S.RUN_START, {});
  for (const c of clients) await vi.waitFor(() => expect(c.state.phase).toBe("build"));
  return { clients, seen, room, tokens };
}

const world = (room: RunRoom) => {
  const w = room.controller?.world;
  if (!w) throw new Error("no run");
  return w;
};

/** Kills the player's socket on the server side without a close handshake (a lost phone signal). */
function dropSocket(room: RunRoom, client: RunSdkRoom): void {
  const server = room.clients.find((c) => c.sessionId === client.sessionId);
  (server?.ref as unknown as { terminate(): void }).terminate();
}

/** The SDK's auto-reconnect, on (a real phone) or off (a phone that never comes back by token). */
function reconnect(client: RunSdkRoom, on: boolean): void {
  client.reconnection.enabled = on;
  client.reconnection.minUptime = 0;
  client.reconnection.minDelay = 50;
  client.reconnection.maxDelay = 100;
  client.reconnection.maxEnqueuedMessages = 0;
}

function logLines(room: RunRoom) {
  const info = vi.spyOn(room.log, "info");
  return (msg: string) => info.mock.calls.filter((c) => c[1] === msg).map((c) => c[0] as Record<string, unknown>);
}

describe("Story 8.1 drop → hold → return (AC 1, 3)", () => {
  it("a drop mid-wave holds the seat (out of the World, chip for the others) and the SDK's reconnect brings it back exactly as held", async () => {
    const { clients, room, seen } = await runOf(2);
    const lines = logLines(room);
    const w = world(room);
    startWave(w);
    const p1 = w.players.get("p1");
    if (!p1) throw new Error("no p1");
    p1.wallet = 321;
    p1.hp = 44;
    const ana = clients[0] as RunSdkRoom;
    let anaSeq = 0;
    const keepAlive = setInterval(() => ana.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: ++anaSeq }), 50); // Ana stays present (no freeze)
    onTestFinished(() => clearInterval(keepAlive));
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(room.holds.get("p1")?.reason).toBe("drop"));
    const dropTick = w.tick;
    expect(w.players.has("p1")).toBe(true); // B16: the dropped body stands for 3 s first …
    // RR2-M1: … and teammates still see it (no heldUntilTick yet: their mirror keeps the body, no chip) …
    await sleep(300);
    expect((clients[0] as RunSdkRoom).state.players.get("p1")?.heldUntilTick).toBe(0);
    await vi.waitFor(() => expect(w.players.has("p1")).toBe(false), { timeout: 5000 }); // … then vanishes into the hold
    await vi.waitFor(() => expect((clients[0] as RunSdkRoom).state.players.get("p1")?.heldUntilTick).toBeGreaterThan(w.tick));
    // RR3-N1: written at the vanish, but the 120 s still run from the DROP (not 3 s more from the vanish).
    const until = (clients[0] as RunSdkRoom).state.players.get("p1")?.heldUntilTick ?? 0;
    expect(Math.abs(until - dropTick - Math.round(room.holdS * 20))).toBeLessThanOrEqual(5);
    expect(lines("player_held")).toEqual([expect.objectContaining({ playerId: "p1", reason: "drop" })]);
    // Back with the SDK's token, on a fresh client object (what `client.reconnect(token)` does after a reload).
    const back = await colyseus.sdk.reconnect<RunStateView>(bo.reconnectionToken);
    record(back);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(false));
    expect(w.players.get("p1")).toBe(p1);
    expect(p1.wallet).toBe(321);
    expect(p1.hp).toBe(44);
    expect(p1.protectTicks).toBeGreaterThan(0); // RR2-M2: away > 3 s since the DROP (B16 3 s + the hold): the wave's one protected return
    await vi.waitFor(() => expect((clients[0] as RunSdkRoom).state.players.get("p1")?.heldUntilTick).toBe(0));
    expect(lines("player_returned")).toEqual([expect.objectContaining({ playerId: "p1", via: "token", reason: "drop" })]);
    expect(seen[0]?.left).toEqual([]);
    // The returning seat applies its next input whatever its seq (no seq_gap_suspect for a legit return).
    back.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: 9000, moveX: 1 });
    await vi.waitFor(() => expect(room.controller?.ackSeq("p1")).toBe(9000));
    expect(lines("seq_gap_suspect")).toEqual([]);
  });

  it("the SDK's automatic reconnect (same Room object) returns the seat: no scene restart needed", async () => {
    const { clients, room } = await runOf(2);
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, true);
    let reconnected = 0;
    let frames = 0;
    bo.onReconnect(() => reconnected++);
    bo.onMessage(BYTES.HORDE_FRAME, () => frames++); // T4: the handlers registered at the join survive the reconnect
    dropSocket(room, bo);
    await vi.waitFor(() => expect(reconnected).toBe(1), { timeout: 4000 });
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(false));
    expect(world(room).players.has("p1")).toBe(true);
    // The reconnected client is JOINED again: it gets state patches and horde frames at once (HordeEncoder sends to JOINED only).
    const tick = bo.state.tick;
    const f0 = frames;
    await vi.waitFor(() => expect(bo.state.tick).toBeGreaterThan(tick + 2));
    await vi.waitFor(() => expect(frames).toBeGreaterThan(f0 + 2));
  });

  it("downed when dropped → out after the return (F1), mid-wave", async () => {
    const { clients, room } = await runOf(2);
    const w = world(room);
    startWave(w);
    const p1 = w.players.get("p1");
    if (!p1) throw new Error("no p1");
    downPlayer(w, p1);
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(true));
    await vi.waitFor(() => expect(w.heldPlayers.has("p1")).toBe(true), { timeout: 5000 }); // B16: vanished after 3 s
    const back = await colyseus.sdk.reconnect<RunStateView>(bo.reconnectionToken);
    record(back);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(false));
    expect(p1.status).toBe("out");
  });

  it("B16: downed and back within the 3 s: still downed in place (no free revive, no escape)", async () => {
    const { clients, room } = await runOf(2);
    const w = world(room);
    startWave(w);
    const p1 = w.players.get("p1");
    if (!p1) throw new Error("no p1");
    downPlayer(w, p1);
    const x = p1.x;
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(true));
    const back = await colyseus.sdk.reconnect<RunStateView>(bo.reconnectionToken);
    record(back);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(false));
    expect(w.heldPlayers.has("p1")).toBe(false);
    expect(p1.status).toBe("downed");
    expect(p1.x).toBe(x);
  });

  it("a drop in the lobby is a leave, as today (D7)", async () => {
    vi.stubEnv("DEV_NO_WAVES", "1");
    const token = randomBytes(16).toString("hex");
    const ana = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana", token));
    const seen = record(ana);
    const bo = await colyseus.sdk.joinById<RunStateView>(ana.roomId, options("join", "Bo", randomBytes(16).toString("hex")));
    record(bo);
    const room = colyseus.getRoomById<RunRoom>(ana.roomId) as unknown as RunRoom;
    await vi.waitFor(() => expect(room.members.size).toBe(2));
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(seen.left).toEqual([{ playerId: "p1", name: "Bo", reason: "disconnected" }]));
    expect(room.holds.size).toBe(0);
  });

  it("a consented Leave mid-run frees the seat at once (player.left 'left') and remembers it (F8: no fresh money later)", async () => {
    const { clients, room, seen } = await runOf(2);
    await (clients[1] as RunSdkRoom).leave(true);
    await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "left" }]));
    expect(room.holds.size).toBe(0);
    expect(room.rememberedSeats.size).toBe(1);
    expect(world(room).players.has("p1")).toBe(false);
    expect(world(room).heldPlayers.has("p1")).toBe(false);
  });
});

describe("Story 8.1 × 8.10: the horde stream after a reconnect and after a takeover", () => {
  /** Collects horde frames on `c` and checks: the first is a keyframe, a fresh phone decoder reads every one. */
  async function firstFramesOk(c: RunSdkRoom, zombieTick: number): Promise<void> {
    const frames: Uint8Array[] = [];
    c.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => frames.push(new Uint8Array(b)));
    await vi.waitFor(() => expect(frames.length).toBeGreaterThan(5));
    expect(frames[0]?.[4]).toBe(HORDE_KIND_KEY);
    const phone = new HordeStreamDecoder();
    let seen = 0;
    for (const f of frames) expect(phone.decode(f, { begin: () => {}, record: () => void seen++, end: () => {} })).toBe(true);
    expect(seen).toBeGreaterThan(0); // liveness: the frames carried the zombie
    expect(zombieTick).toBeGreaterThanOrEqual(0);
  }

  it("the first frame after a token reconnect, and after a takeover, is a keyframe and decodes with no error", async () => {
    const { clients, room, tokens } = await runOf(2);
    const w = world(room);
    w.debug.godMode = true;
    const p1 = w.players.get("p1");
    if (!p1) throw new Error("no p1");
    spawnZombie(w, "walker", p1.x + 3, p1.y);
    const t0 = w.tick;
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo); // build phase: held at once
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(true));
    const back = await colyseus.sdk.reconnect<RunStateView>(bo.reconnectionToken);
    record(back);
    await firstFramesOk(back, t0);
    const fresh = await colyseus.sdk.joinById<RunStateView>(back.roomId, options("join", "Bo", tokens[1] as string));
    record(fresh);
    await firstFramesOk(fresh, t0);
  });
});

describe("Story 8.1 takeover by guest token (AC 6, D5)", () => {
  it("a second tab with the same guest token takes a CONNECTED seat: the old socket closes with 4021 and the seat is the new one's", async () => {
    const { clients, room, tokens } = await runOf(2);
    const lines = logLines(room);
    const old = clients[1] as RunSdkRoom;
    const oldGuard = (room.net as unknown as { clients: Map<string, unknown> }).clients.get(old.sessionId);
    expect(oldGuard).toBeDefined();
    let oldLeftCode = 0;
    old.onLeave((code) => (oldLeftCode = code));
    const fresh = await colyseus.sdk.joinById<RunStateView>(old.roomId, options("join", "Bo", tokens[1] as string));
    const seen = record(fresh);
    await vi.waitFor(() => expect(seen.joined).toEqual([expect.objectContaining({ playerId: "p1", slot: 1 })]));
    await vi.waitFor(() => expect(oldLeftCode).toBe(CLOSE_TAKEN_OVER));
    expect(room.members.size).toBe(2);
    expect([...room.members.values()].find((m) => m.playerId === "p1")?.sessionId).toBe(fresh.sessionId);
    expect(room.holds.size).toBe(0); // the old socket's close is no drop (no hold restart)
    expect(lines("seat_taken_over")).toEqual([expect.objectContaining({ playerId: "p1", held: false })]);
    // Review L2 / RR1-N3: the seat's message guard (buckets, drop counters) moved to the new session.
    const guards = (room.net as unknown as { clients: Map<string, unknown> }).clients;
    expect(guards.get(fresh.sessionId)).toBe(oldGuard);
    expect(guards.has(old.sessionId)).toBe(false);
    expect(lines("player_left")).toEqual([]);
  });

  it("a takeover of a HELD seat (the old socket the server still waits for) returns it at once, via guest", async () => {
    const { clients, room, tokens } = await runOf(2);
    const lines = logLines(room);
    const w = world(room);
    startWave(w);
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(true));
    const fresh = await colyseus.sdk.joinById<RunStateView>(bo.roomId, options("join", "Bo", tokens[1] as string));
    record(fresh);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(false));
    expect(w.players.has("p1")).toBe(true);
    expect(lines("player_returned")).toEqual([expect.objectContaining({ playerId: "p1", via: "guest" })]);
    await sleep(200); // the rejected reconnection must not free the seat afterwards
    expect(room.members.size).toBe(2);
    expect(lines("player_left")).toEqual([]);
  });

  it("works in a full 4-player run (a held seat keeps Colyseus's reserved seat: maxClients has room)", async () => {
    const { clients, room, tokens } = await runOf(4);
    const di = clients[3] as RunSdkRoom;
    reconnect(di, false);
    dropSocket(room, di);
    await vi.waitFor(() => expect(room.holds.has("p3")).toBe(true));
    const fresh = await colyseus.sdk.joinById<RunStateView>(di.roomId, options("join", "Di", tokens[3] as string));
    record(fresh);
    await vi.waitFor(() => expect(room.holds.size).toBe(0));
    expect(room.members.size).toBe(4);
  });

  it("a stranger (unknown guest token) is still refused in a started run (run_started)", async () => {
    const { clients } = await runOf(2);
    await expect(colyseus.sdk.joinById((clients[0] as RunSdkRoom).roomId, options("join", "Eve", randomBytes(16).toString("hex")))).rejects.toThrow("run_started");
  });

  it("the lobby keeps the already_joined refusal", async () => {
    const token = randomBytes(16).toString("hex");
    const ana = await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, options("create", "Ana", token));
    record(ana);
    await expect(colyseus.sdk.joinById(ana.roomId, options("join", "Ana", token))).rejects.toThrow("already_joined");
  });
});

describe("Story 8.1 review H2: a Leave + rejoin in the same build heals nothing (repeatable before the fix)", () => {
  it("HP 20 stays 20 across a consented Leave and a rejoin by the link in the same build phase, twice", async () => {
    const { clients, room, tokens } = await runOf(2);
    const w = world(room);
    const p1 = w.players.get("p1");
    if (!p1) throw new Error("no p1");
    p1.hp = 20;
    let bo = clients[1] as RunSdkRoom;
    for (let k = 0; k < 2; k++) {
      await bo.leave(true);
      await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1));
      bo = await colyseus.sdk.joinById<RunStateView>(bo.roomId, options("join", "Bo", tokens[1] as string));
      record(bo);
      await vi.waitFor(() => expect(w.players.get("p1")).toBe(p1));
      expect(p1.hp).toBe(20);
    }
    expect(room.state.phase).toBe("build");
  });
});

describe("Story 8.1 review L5: a drop on Results is a leave (D7)", () => {
  it("no hold on Results: the others get player.left 'disconnected' at once", async () => {
    const { clients, room, seen } = await runOf(2);
    const w = world(room);
    startWave(w);
    for (const p of w.players.values()) downPlayer(w, p);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"));
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "disconnected" }]));
    expect(room.holds.size).toBe(0);
  });
});

describe("Story 8.1 after the hold (AC 9, F8)", () => {
  it("the hold runs out → 'left' for the others, the seat is remembered; refused mid-wave (seat_kept), restored at the next build phase with its stuff", async () => {
    const { clients, room, seen, tokens } = await runOf(2);
    room.holdS = 0.4;
    const lines = logLines(room);
    const w = world(room);
    const p1 = w.players.get("p1");
    if (!p1) throw new Error("no p1");
    p1.wallet = 999;
    p1.loadout.slots[1] = { weapon: "shotgun", ammo: 3, reloadTicks: 0, cooldownS: 0, level: 2 };
    startWave(w);
    const bo = clients[1] as RunSdkRoom;
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "disconnected" }]), { timeout: 3000 });
    expect(lines("player_hold_expired")).toEqual([expect.objectContaining({ playerId: "p1" })]);
    expect(room.rememberedSeats.size).toBe(1);
    expect(w.heldPlayers.has("p1")).toBe(false);
    // F5 (after the hold nothing pays this seat) is hold.test.ts › F5.
    await expect(colyseus.sdk.joinById(bo.roomId, options("join", "Bo", tokens[1] as string))).rejects.toThrow("seat_kept");
    endWave(w); // → build phase
    await vi.waitFor(() => expect(room.state.phase).toBe("build"));
    const back = await colyseus.sdk.joinById<RunStateView>(bo.roomId, options("join", "Bo", tokens[1] as string));
    const s = record(back);
    await vi.waitFor(() => expect(s.joined).toEqual([expect.objectContaining({ playerId: "p1", slot: 1 })]));
    expect(w.players.get("p1")).toBe(p1);
    expect(p1.wallet).toBe(999 + 0); // its own wallet, never late-joiner money (+ nothing paid while gone)
    expect(p1.loadout.slots[1]?.weapon).toBe("shotgun");
    expect(room.rememberedSeats.size).toBe(0);
    await vi.waitFor(() => expect(back.state.players.get("p1")?.wallet).toBe(999));
  });
});

describe("Story 8.1 quiet player (AC 2, D1)", () => {
  it("a quiet seat that then drops keeps its 120 s clock (the hold never restarts): it runs out from the first hold", async () => {
    const { clients, room, seen } = await runOf(2);
    room.holdS = 3.6;
    // Flake fix (re-review 2): assert the window the room asks Colyseus for, not wall time (timers drift under load).
    const windows: number[] = [];
    const allow = room.allowReconnection.bind(room);
    vi.spyOn(room, "allowReconnection").mockImplementation((c, s) => {
      windows.push(Number(s));
      return allow(c, s);
    });
    const w = world(room);
    startWave(w);
    const ana = clients[0] as RunSdkRoom;
    let seq = 0;
    const keepAlive = setInterval(() => ana.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: ++seq }), 50);
    try {
      await vi.waitFor(() => expect(room.holds.get("p1")?.reason).toBe("quiet"), { timeout: 10_000 });
      const until = room.state.players.get("p1")?.heldUntilTick;
      const heldAtMs = room.holds.get("p1")?.atMs ?? 0;
      await sleep(1500);
      const bo = clients[1] as RunSdkRoom;
      reconnect(bo, false);
      dropSocket(room, bo);
      await vi.waitFor(() => expect(room.holds.get("p1")?.reason).toBe("drop"));
      expect(room.state.players.get("p1")?.heldUntilTick).toBe(until); // the chip's countdown doesn't jump back
      // The window is what is left of the FIRST hold's 3.6 s (≤ 3.6 − the ≥ 1.5 s already held), never a fresh 3.6 s.
      expect(windows).toHaveLength(1);
      const elapsedS = (performance.now() - heldAtMs) / 1000;
      expect(windows[0]).toBeLessThanOrEqual(3.6 - 1.5 + 0.01);
      expect(windows[0]).toBeGreaterThanOrEqual(Math.max(1, 3.6 - elapsedS) - 0.01);
      await vi.waitFor(() => expect(seen[0]?.left).toEqual([{ playerId: "p1", name: "Bo", reason: "disconnected" }]), { timeout: 15_000 });
    } finally {
      clearInterval(keepAlive);
    }
  });

  it("a connected player with no input for 3 s in a wave is held (reason quiet); its next input returns it next to a teammate", async () => {
    const { clients, room } = await runOf(2);
    const lines = logLines(room);
    const w = world(room);
    startWave(w);
    const ana = clients[0] as RunSdkRoom;
    let seq = 0;
    const keepAlive = setInterval(() => ana.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: ++seq }), 50);
    try {
      await vi.waitFor(() => expect(room.holds.get("p1")?.reason).toBe("quiet"), { timeout: 6000 });
      expect(room.holds.has("p0")).toBe(false); // Ana kept sending
      const heldAt = lines("player_held").find((l) => l.playerId === "p1");
      expect(heldAt).toMatchObject({ reason: "quiet" });
      expect(QUIET_HOLD_TICKS).toBe(60);
      (clients[1] as RunSdkRoom).send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: 1 });
      await vi.waitFor(() => expect(room.holds.has("p1")).toBe(false));
      // RR3-M1: 3 s quiet + back after the vanish = away > 3 s since the last input: the wave's one protected return.
      expect(w.players.get("p1")?.protectTicks).toBeGreaterThan(0);
      expect(lines("player_returned")).toEqual([expect.objectContaining({ playerId: "p1", via: "input", reason: "quiet" })]);
    } finally {
      clearInterval(keepAlive);
    }
  });
});

describe("Story 8.1 freeze when nobody is connected (AC 10, F6)", () => {
  it("solo drop mid-wave: the World stops (digest identical across the freeze); back → 3-2-1 → ticking again", async () => {
    const { clients, room } = await runOf(1);
    const lines = logLines(room);
    const w = world(room);
    startWave(w);
    const ana = clients[0] as RunSdkRoom;
    reconnect(ana, false);
    dropSocket(room, ana);
    await vi.waitFor(() => expect(room.state.frozen).toBe(true), { timeout: 5000 }); // B16: after the body's 3 s
    const tick = w.tick;
    const digest = worldDigest(w);
    await sleep(400);
    expect(w.tick).toBe(tick);
    expect(worldDigest(w)).toBe(digest);
    expect(lines("room_frozen")).toHaveLength(1);
    const back = await colyseus.sdk.reconnect<RunStateView>(ana.reconnectionToken);
    record(back);
    await vi.waitFor(() => expect(room.state.resumeIn).toBe(3));
    expect(w.players.get("p0")?.protectTicks).toBe(0); // B18: in a frozen World the 3-2-1 replaces protection
    const counts: number[] = [];
    back.onStateChange((s) => {
      if (counts[counts.length - 1] !== s.resumeIn) counts.push(s.resumeIn);
    });
    expect(w.tick).toBe(tick); // still frozen during the count
    await vi.waitFor(() => expect(room.state.frozen).toBe(false), { timeout: 5000 });
    await vi.waitFor(() => expect(w.tick).toBeGreaterThan(tick + 2));
    expect(counts).toEqual(expect.arrayContaining([2, 1, 0]));
    expect(lines("room_resumed")).toHaveLength(1);
  });

  it("a team wipes when every connected player is down, even with a teammate held (F3)", async () => {
    const { clients, room } = await runOf(2);
    const lines = logLines(room);
    const w = world(room);
    startWave(w);
    const bo = clients[1] as RunSdkRoom;
    w.players.get("p1")!.earned = 77;
    // Flake fix: Ana keeps sending (else D1's quiet rule can hold her ~3 s in and freeze the room before Bo's body vanishes).
    const ana = clients[0] as RunSdkRoom;
    let anaSeq = 0;
    const keepAlive = setInterval(() => ana.send(C2S.INPUT_SEND, { ...NEUTRAL_INPUT, seq: ++anaSeq }), 50);
    onTestFinished(() => clearInterval(keepAlive));
    reconnect(bo, false);
    dropSocket(room, bo);
    await vi.waitFor(() => expect(room.holds.has("p1")).toBe(true));
    downPlayer(w, w.players.get("p0") as never);
    await vi.waitFor(() => expect(room.state.phase).toBe("results"), { timeout: 10_000 }); // B16: once the dropped body vanished
    // Review L1: the held seat is in run_ended too.
    expect(lines("run_ended")[0]).toMatchObject({ earned: { p0: 0, p1: 77 } });
  });
});
