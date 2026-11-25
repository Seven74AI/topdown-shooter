import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { MatchMakeError, type Room as SdkRoom } from "@colyseus/sdk";
import type { ColyseusTestServer } from "@colyseus/testing";
import { BYTES, C2S, DOWNTOWN_MAP, RUN_ROOM_NAME, S2C, type RunStateView, NET_PROTOCOL_VERSION } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setRoomAccounts } from "../auth/roomAccounts";
import { signTicket } from "../auth/ticket";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { CLOSE_TAKEN_OVER, SESSION_TICKET_TTL_MS } from "../net/limits";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { JOIN_REFUSED_CODE, RunRoom, serverBalance } from "./RunRoom";

/** Story 7.1 T6: the room trusts only a signed ticket; seats match by `acct:` (or the same guest token). */
const SECRET = "room-secret-".padEnd(48, "r");
const ACCT = "0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4";
const OTHER = "11111111-2222-4333-8444-555555555555";

let colyseus: ColyseusTestServer;
let port: number;
let database: Database;

beforeAll(async () => {
  database = openPglite();
  ({ colyseus, port } = await bootTestServer({ database, sessionSecret: SECRET }));
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
const token = (): string => randomBytes(16).toString("hex");
/** `ticket: bound(acct)` in `extra` becomes a real ticket for `acct` issued for THIS join's guest token (review M1). */
const BOUND = Symbol("bound");
const bound = (accountId: string) => ({ [BOUND]: accountId });
const opts = (intent: "create" | "join", name: string, guestToken: string, extra: Record<string, unknown> = {}) => {
  const t = extra.ticket as { [BOUND]?: string } | undefined;
  const ticket = t && typeof t === "object" && t[BOUND] ? signTicket(t[BOUND], hashGuestToken(guestToken), SECRET) : extra.ticket;
  return { intent, name, balanceVersion: serverBalance.version, mapVersion: DOWNTOWN_MAP.version, netProtocolVersion: NET_PROTOCOL_VERSION, guestToken, ...extra, ...(ticket === undefined ? {} : { ticket }) };
};
const quiet = (c: RunSdkRoom): RunSdkRoom => {
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) c.onMessage(t, () => {});
  return c;
};
const roomOf = (c: RunSdkRoom): RunRoom => colyseus.getRoomById<RunRoom>(c.roomId) as unknown as RunRoom;
const memberOf = (room: RunRoom, c: RunSdkRoom) => room.members.get(c.sessionId);

async function refusal(p: Promise<unknown>): Promise<MatchMakeError> {
  try {
    await p;
  } catch (e) {
    return e as MatchMakeError;
  }
  throw new Error("expected a refusal");
}

async function host(guestToken = token(), extra: Record<string, unknown> = {}) {
  const c = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", guestToken, extra)));
  const room = roomOf(c);
  await vi.waitFor(() => expect(room.members.size).toBe(1), { timeout: 5000 });
  return { c, room };
}

describe("Story 7.1 AC 5: the join ticket names the account", () => {
  it("a valid ticket sets Member.accountId and the acct: identity key", async () => {
    const t = token();
    const { c, room } = await host(t, { ticket: bound(ACCT) });
    expect(memberOf(room, c)).toMatchObject({ accountId: ACCT, seatKey: `acct:${ACCT}`, guestTokenHash: hashGuestToken(t) });
  });

  it("no ticket: accountId null and today's guest: key (unsaved play)", async () => {
    const t = token();
    const { c, room } = await host(t);
    expect(memberOf(room, c)).toMatchObject({ accountId: null, seatKey: `guest:${hashGuestToken(t)}` });
  });

  it("P4: a forged, expired or other-secret ticket is accepted as a join but names no account", async () => {
    const real = signTicket(ACCT, hashGuestToken(token()), SECRET);
    const sig = real.split(".")[1];
    const forged = `${Buffer.from(`${OTHER}.${Date.now() + 86_400_000}`).toString("base64url")}.${sig}`;
    for (const make of [
      () => forged,
      (t: string) => signTicket(ACCT, hashGuestToken(t), SECRET, Date.now() - SESSION_TICKET_TTL_MS - 1),
      (t: string) => signTicket(ACCT, hashGuestToken(t), "another-secret-".padEnd(48, "z")),
      () => "garbage",
    ]) {
      const t = token();
      const { c, room } = await host(t, { ticket: make(t) });
      expect(memberOf(room, c)?.accountId).toBeNull();
      expect(memberOf(room, c)?.seatKey.startsWith("guest:")).toBe(true);
      await c.leave();
    }
  });

  it("an accountId (or an over-long ticket) in the join options is refused as invalid_options", async () => {
    const e1 = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, opts("create", "Ana", token(), { accountId: ACCT })));
    expect([e1.code, e1.message]).toEqual([JOIN_REFUSED_CODE, "invalid_options"]);
    const e2 = await refusal(colyseus.sdk.create(RUN_ROOM_NAME, opts("create", "Ana", token(), { ticket: "x".repeat(201) })));
    expect([e2.code, e2.message]).toEqual([JOIN_REFUSED_CODE, "invalid_options"]);
  });

  it("logs join_account with the account id, never the ticket or the token", async () => {
    const t = token();
    const ticket = signTicket(ACCT, hashGuestToken(t), SECRET);
    const c = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", t, { ticket })));
    const room = roomOf(c);
    const info = vi.spyOn(room.log, "info");
    const b = quiet(await colyseus.sdk.joinById<RunStateView>(c.roomId, opts("join", "Bo", token(), { ticket: bound(OTHER) })));
    await vi.waitFor(() => expect(info.mock.calls.some((x) => x[1] === "join_account")).toBe(true), { timeout: 5000 });
    expect(info.mock.calls.find((x) => x[1] === "join_account")?.[0]).toEqual({ accountId: OTHER });
    const all = JSON.stringify(info.mock.calls);
    expect(all).not.toContain(ticket);
    expect(all).not.toContain(t);
    await b.leave();
  });
});

describe("Story 7.1 AC 6: one account, one seat", () => {
  it("lobby: a second join of the same account (another guest token) is already_joined", async () => {
    const { c } = await host(token(), { ticket: bound(ACCT) });
    const e = await refusal(colyseus.sdk.joinById(c.roomId, opts("join", "Bo", token(), { ticket: bound(ACCT) })));
    expect([e.code, e.message]).toEqual([JOIN_REFUSED_CODE, "already_joined"]);
  });

  it("lobby: the same guest token with and without a ticket is one seat (a phone can't sit twice when the save server flips)", async () => {
    const t = token();
    const { c } = await host(t, { ticket: bound(ACCT) });
    const e = await refusal(colyseus.sdk.joinById(c.roomId, opts("join", "Bo", t)));
    expect(e.message).toBe("already_joined");
    const { c: c2 } = await host(token());
    const same = (await colyseus.sdk.joinById<RunStateView>(c2.roomId, opts("join", "Bo", t))) as RunSdkRoom;
    quiet(same);
    const e2 = await refusal(colyseus.sdk.joinById(c2.roomId, opts("join", "Bo", t, { ticket: bound(ACCT) })));
    expect(e2.message).toBe("already_joined");
  });

  it("two different accounts in one lobby both get seats", async () => {
    const { c, room } = await host(token(), { ticket: bound(ACCT) });
    quiet(await colyseus.sdk.joinById<RunStateView>(c.roomId, opts("join", "Bo", token(), { ticket: bound(OTHER) })));
    await vi.waitFor(() => expect(room.members.size).toBe(2), { timeout: 5000 });
  });

  /** A started run with Ana (host) and Bo, Bo joining with `boOpts`. */
  async function started(boToken: string, boExtra: Record<string, unknown>) {
    vi.stubEnv("DEV_NO_WAVES", "1");
    const { c, room } = await host(token(), { ticket: bound(OTHER) });
    const bo = quiet(await colyseus.sdk.joinById<RunStateView>(c.roomId, opts("join", "Bo", boToken, boExtra)));
    await vi.waitFor(() => expect(room.members.size).toBe(2), { timeout: 5000 });
    for (const x of [c, bo]) x.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true), { timeout: 5000 });
    c.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(c.state.phase).toBe("build"), { timeout: 5000 });
    return { room, bo };
  }

  async function expectTakeover(room: RunRoom, bo: RunSdkRoom, fresh: Promise<RunSdkRoom>): Promise<void> {
    let code = 0;
    bo.onLeave((c) => (code = c));
    const f = quiet(await fresh);
    await vi.waitFor(() => expect(code).toBe(CLOSE_TAKEN_OVER), { timeout: 5000 });
    expect(room.members.size).toBe(2);
    const m = [...room.members.values()].find((x) => x.playerId === "p1");
    expect(m?.sessionId).toBe(f.sessionId);
    expect(m?.accountId).toBe(ACCT);
  }

  it("started run: the same account from another device (another guest token) takes the seat over (8.1 D5)", async () => {
    const { room, bo } = await started(token(), { ticket: bound(ACCT) });
    await expectTakeover(room, bo, colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", token(), { ticket: bound(ACCT) })));
  });

  it("started run: a copied guest token (7.1 D5, same token, its own ticket) behaves exactly the same", async () => {
    const t = token();
    const { room, bo } = await started(t, { ticket: bound(ACCT) });
    await expectTakeover(room, bo, colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", t, { ticket: bound(ACCT) })));
  });

  it("started run: a seat that joined unsaved takes the account of a later valid ticket from the same token", async () => {
    const t = token();
    const { room, bo } = await started(t, {});
    expect([...room.members.values()].find((x) => x.playerId === "p1")?.accountId).toBeNull();
    await expectTakeover(room, bo, colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", t, { ticket: bound(ACCT) })));
  });

  it("review M1: my OWN valid ticket + someone's copied token takes their unsaved seat as a token holder but never re-labels it to my account", async () => {
    const t = token();
    const { room, bo } = await started(t, {});
    const mine = token();
    let code = 0;
    bo.onLeave((c) => (code = c));
    const thief = quiet(await colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", t, { ticket: signTicket(ACCT, hashGuestToken(mine), SECRET) })));
    await vi.waitFor(() => expect(code).toBe(CLOSE_TAKEN_OVER), { timeout: 5000 });
    const m = [...room.members.values()].find((x) => x.playerId === "p1");
    expect(m?.sessionId).toBe(thief.sessionId);
    expect(m?.accountId).toBeNull(); // 7.2 would bank into nobody's account, not into mine
    expect(m?.seatKey).toBe(`guest:${hashGuestToken(t)}`);
  });

  it("review M1: account A's ticket + Bo's token never takes Ana's (A's) seat", async () => {
    vi.stubEnv("DEV_NO_WAVES", "1");
    const anaToken = token();
    const boToken = token();
    const { c, room } = await host(anaToken, { ticket: bound(ACCT) });
    const bo = quiet(await colyseus.sdk.joinById<RunStateView>(c.roomId, opts("join", "Bo", boToken)));
    await vi.waitFor(() => expect(room.members.size).toBe(2), { timeout: 5000 });
    for (const x of [c, bo]) x.send(C2S.LOBBY_SET_READY, { ready: true });
    await vi.waitFor(() => expect([...room.members.values()].every((m) => room.state.players.get(m.playerId)?.ready)).toBe(true), { timeout: 5000 });
    c.send(C2S.RUN_START, {});
    await vi.waitFor(() => expect(c.state.phase).toBe("build"), { timeout: 5000 });
    let anaCode = 0;
    c.onLeave((x) => (anaCode = x));
    const anaTicket = signTicket(ACCT, hashGuestToken(anaToken), SECRET);
    const probe = quiet(await colyseus.sdk.joinById<RunStateView>(c.roomId, opts("join", "Bo", boToken, { ticket: anaTicket })));
    await vi.waitFor(() => expect([...room.members.values()].find((x) => x.playerId === "p1")?.sessionId).toBe(probe.sessionId), { timeout: 5000 });
    const ana = [...room.members.values()].find((x) => x.playerId === "p0");
    expect(ana?.sessionId).toBe(c.sessionId); // Ana keeps her seat
    expect(anaCode).toBe(0);
    expect([...room.members.values()].find((x) => x.playerId === "p1")?.accountId).toBeNull();
  });

  it("review M1: a leaked ticket with any other token can't take the account's seat (run_started)", async () => {
    const t = token();
    const { bo } = await started(t, { ticket: bound(ACCT) });
    const leaked = signTicket(ACCT, hashGuestToken(t), SECRET);
    const e = await refusal(colyseus.sdk.joinById(bo.roomId, opts("join", "Bo", token(), { ticket: leaked })));
    expect(e.message).toBe("run_started");
  });

  it("review L1: a seat that gained an account is re-keyed, so the same account from another device then takes it over", async () => {
    const t = token();
    const { room, bo } = await started(t, {});
    const same = quiet(await colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", t, { ticket: bound(ACCT) })));
    await vi.waitFor(() => expect([...room.members.values()].find((x) => x.playerId === "p1")?.sessionId).toBe(same.sessionId), { timeout: 5000 });
    expect([...room.members.values()].find((x) => x.playerId === "p1")?.seatKey).toBe(`acct:${ACCT}`);
    await expectTakeover(room, same, colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", token(), { ticket: bound(ACCT) })));
  });

  it("re-review N-R1: a remembered unsaved seat restored with a ticket is re-keyed to acct: and gets the account", async () => {
    const t = token();
    const { room, bo } = await started(t, {});
    room.holdS = 0.4;
    bo.reconnection.enabled = false;
    const server = room.clients.find((c) => c.sessionId === bo.sessionId);
    (server?.ref as unknown as { terminate(): void }).terminate();
    await vi.waitFor(() => expect(room.rememberedSeats.size).toBe(1), { timeout: 5000 });
    const back = quiet(await colyseus.sdk.joinById<RunStateView>(bo.roomId, opts("join", "Bo", t, { ticket: bound(ACCT) })));
    await vi.waitFor(() => expect(room.members.get(back.sessionId)?.playerId).toBe("p1"), { timeout: 5000 });
    expect(room.members.get(back.sessionId)).toMatchObject({ accountId: ACCT, seatKey: `acct:${ACCT}` });
    expect(room.rememberedSeats.size).toBe(0);
  });

  it("started run: another account (new token) is still run_started", async () => {
    const { bo } = await started(token(), { ticket: bound(ACCT) });
    const e = await refusal(colyseus.sdk.joinById(bo.roomId, opts("join", "Cy", token(), { ticket: bound("22222222-2222-4333-8444-555555555555") })));
    expect(e.message).toBe("run_started");
  });
});

describe("Story 7.1 AC 7: the join name becomes the display name", () => {
  it("saves the name used at a successful join (async, best effort)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/account/session`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const session = (await res.json()) as { deviceToken: string; ticket: string };
    const c = quiet(await colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "  Zed  ", session.deviceToken, { ticket: session.ticket })));
    const accounts = accountsRepo(database);
    await vi.waitFor(async () => expect((await accounts.findByTokenHash(hashGuestToken(session.deviceToken)))?.displayName).toBe("Zed"), { timeout: 5000 });
    await c.leave();
  });

  it("P3: with the database down a ticketed join is still accepted (the save fails quietly)", async () => {
    const down: Database = { kind: "postgres", db: () => Promise.reject(new Error("ECONNREFUSED")), close: async () => {} };
    const other = await bootTestServer({ database: down, sessionSecret: SECRET });
    try {
      const c = await other.colyseus.sdk.create<RunStateView>(RUN_ROOM_NAME, opts("create", "Ana", token(), { ticket: bound(ACCT) }));
      quiet(c as RunSdkRoom);
      const room = other.colyseus.getRoomById<RunRoom>(c.roomId) as unknown as RunRoom;
      await vi.waitFor(() => expect(room.members.get(c.sessionId)?.accountId).toBe(ACCT), { timeout: 5000 });
      await c.leave();
    } finally {
      await other.colyseus.shutdown();
      // Back to this file's server's room services (one game server per process; the newest boot wins).
      setRoomAccounts({ sessionSecret: SECRET, accounts: accountsRepo(database) });
    }
  });
});

describe("Story 7.1 AC 9: the tick never waits for the database", () => {
  it("onTick has no await and the room reaches the database only through roomAccountsRepo in saveDisplayName", () => {
    const src = readFileSync(new URL("./RunRoom.ts", import.meta.url), "utf8");
    const start = src.indexOf("  onTick(): void {");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf("\n  }\n", start));
    expect(body).not.toMatch(/\bawait\b|roomAccountsRepo|Repo\(/);
    expect(src.match(/roomAccountsRepo\(\)/g)).toHaveLength(1);
    expect(src).not.toMatch(/\.then\(|await accounts|await .*setDisplayName/);
  });
});
