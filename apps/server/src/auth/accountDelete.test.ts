import { BYTES, DOWNTOWN_MAP, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, S2C, accountSessionResponseSchema, deviceSessionResponseSchema, upgradeResponseSchema } from "@topdown/shared";
import type { ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { accountsRepo } from "../db/accountsRepo";
import { savedRunsRepo } from "../db/savedRunsRepo";
import { accountFootprintForTest, savedRunForTest } from "../db/testQueries";
import { DELETED_SEAT_NAME, scrubSeats } from "../db/accountsRepo";
import { deviceTokensRepo } from "../db/deviceTokensRepo";
import { log } from "../ops/logger";
import { RunRoom, serverBalance } from "../rooms/RunRoom";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { NameFailureLimiter, SlidingWindowLimiter } from "../net/rateLimit";
import { MAX_DELETE_CALLS_PER_IP_PER_MIN } from "../net/limits";
import { deleteMyProgress } from "./accountDelete";
import { isSwitching } from "./devicesInRooms";
import { readTicket } from "./ticket";

/** Story 10.1 (AC 6, 8–10; retro E7-A8): `/account/settings` and `/account/delete` over real HTTP, on PGlite. */
const SECRET = "test-secret-101".padEnd(48, "x");
const PASSWORD = "correct horse 1";

interface Reply {
  status: number;
  body: Record<string, unknown>;
  setCookie: string | null;
  token: string | undefined;
}

let colyseus: ColyseusTestServer;
let database: Database;
let port: number;
let ipSeq = 0;
const nextIp = () => `10.101.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

async function post(path: string, body: unknown, opts: { cookie?: string | undefined; ip?: string; raw?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": opts.ip ?? nextIp() };
  if (opts.cookie !== undefined) headers.cookie = `__Host-tdg=${opts.cookie}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  const setCookie = res.headers.get("set-cookie");
  return { status: res.status, body: parsed, setCookie, token: /^__Host-tdg=([0-9a-f]{32});/.exec(setCookie ?? "")?.[1] };
}

async function guest(): Promise<{ token: string; id: string; ticket: unknown }> {
  const r = await post("/account/session", {});
  return { token: r.token as string, id: readTicket(r.body.ticket, SECRET)?.accountId as string, ticket: r.body.ticket };
}

let names = 0;
const uname = () => `del_${Date.now() % 100000}_${++names}`;

async function account(username = uname()): Promise<{ token: string; id: string; username: string; ticket: unknown }> {
  const g = await guest();
  const r = await post("/account/upgrade", { username, password: PASSWORD }, { cookie: g.token });
  expect(r.status).toBe(200);
  upgradeResponseSchema.parse(r.body);
  return { ...g, username };
}

async function bank(id: string, n: number): Promise<void> {
  await progressRepo(database).addSupplies(crypto.randomUUID(), id, () => ({ supplies: n, breakdown: {} }));
}

async function seatAccount(guestToken: string, ticket: unknown): Promise<string | null> {
  const opts = { intent: "create", name: "Ana", balanceVersion: serverBalance.version, mapVersion: DOWNTOWN_MAP.version, netProtocolVersion: NET_PROTOCOL_VERSION, guestToken, ...(typeof ticket === "string" ? { ticket } : {}) };
  const c = await colyseus.sdk.create(RUN_ROOM_NAME, opts);
  for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) c.onMessage(t, () => {});
  const room = colyseus.getRoomById(c.roomId) as unknown as RunRoom;
  const id = room.members.get(c.sessionId)?.accountId ?? null;
  await c.leave();
  return id;
}

const saveRow = (id: string, links: string[]) => ({
  id,
  district: "downtown",
  seed: 7,
  snapshot: { schemaVersion: 1, wave: 3 },
  schemaVersion: 1,
  wave: 3,
  names: [{ name: "Ana", slot: 0 }],
  roomCode: "DELT",
  links: links.map((a) => ({ accountId: a, seatKey: `acct:${a}` })),
});

beforeAll(async () => {
  log.level = "silent";
  database = openPglite();
  const booted = await bootTestServer({ database, sessionSecret: SECRET });
  colyseus = booted.colyseus;
  port = booted.port;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await colyseus.cleanup();
});
afterAll(async () => colyseus.shutdown());

describe("Story 10.1 AC 6: POST /account/settings", () => {
  it("stores the changed fields in progress.settings (unknown keys dropped) and the session answer carries them back", async () => {
    const a = await account();
    const r = await post("/account/settings", { settings: { rain: "off", sfxVolume: 40, aimAssist: false, futureThing: 1 } }, { cookie: a.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, settings: { rain: "off", sfxVolume: 40, aimAssist: false } });
    const s = accountSessionResponseSchema.parse((await post("/account/session", {}, { cookie: a.token })).body);
    if (!s.saved) throw new Error("expected saved");
    expect(s.progress?.settings).toEqual({ rain: "off", sfxVolume: 40, aimAssist: false });
  });

  it("a login on a new phone answers the account's settings; an account with none answers null", async () => {
    const a = await account();
    const none = deviceSessionResponseSchema.parse((await post("/account/login", { username: a.username, password: PASSWORD })).body);
    expect(none.progress?.settings).toBeNull();
    await post("/account/settings", { settings: { glow: "low" } }, { cookie: a.token });
    const li = deviceSessionResponseSchema.parse((await post("/account/login", { username: a.username, password: PASSWORD })).body);
    expect(li.progress?.settings).toEqual({ glow: "low" });
  });

  it("refuses: no cookie 401, a bad value 400, a body over 1 KB 413", async () => {
    const a = await account();
    expect((await post("/account/settings", { settings: { rain: "full" } })).status).toBe(401);
    expect((await post("/account/settings", { settings: { sfxVolume: 101 } }, { cookie: a.token })).status).toBe(400);
    expect((await post("/account/settings", { settings: {}, pad: "x".repeat(1100) }, { cookie: a.token })).status).toBe(413);
  });

  it("over 20 saves a minute for one account → 429", async () => {
    const a = await account();
    const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await post("/account/settings", { settings: { sfxVolume: i } }, { cookie: a.token })).status);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});

describe("Story 10.1 AC 8–10 (E7-A8): POST /account/delete", () => {
  it("a guest: one call deletes its account, progress, run_rewards and device rows; the cookie is cleared; the old token is a stranger", async () => {
    const g = await guest();
    await bank(g.id, 70);
    expect((await accountFootprintForTest(database, [g.id])).runRewards).toBe(1);
    const r = await post("/account/delete", {}, { cookie: g.token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, kind: "guest" });
    expect(r.setCookie).toMatch(/^__Host-tdg=;/);
    expect(r.setCookie).toMatch(/Max-Age=0/i);
    expect(await accountFootprintForTest(database, [g.id])).toEqual({ accounts: 0, progress: 0, runRewards: 0, deviceTokens: 0, savedRunPlayers: 0, savedRuns: 0 });
    // B14: the old cookie gets 401 on account actions; its old ticket no longer seats the account.
    expect((await post("/account/settings", { settings: { rain: "off" } }, { cookie: g.token })).status).toBe(401);
    expect((await post("/account/look", { look: "" }, { cookie: g.token })).status).toBe(401);
    expect((await post("/account/delete", {}, { cookie: g.token })).status).toBe(401);
    expect(await seatAccount(g.token, g.ticket)).toBeNull();
    // A session with the old token never returns the deleted account: a fresh empty guest.
    const again = accountSessionResponseSchema.parse((await post("/account/session", {}, { cookie: g.token })).body);
    if (!again.saved) throw new Error("expected saved");
    expect(readTicket(again.ticket, SECRET)?.accountId).not.toBe(g.id);
    expect(again.progress).toMatchObject({ supplies: 0, lifetimeSupplies: 0, unlocks: [] });
  });

  it("an account: wrong password 401 (nothing deleted), right password deletes everything incl. the merged guest and solo saved runs; a shared saved run keeps playing for the other account", async () => {
    const a = await account();
    await bank(a.id, 50);
    // A guest phone with progress logs in: the guest is merged into the account (retired, merged_into = a).
    const phone = await guest();
    await bank(phone.id, 20);
    const li = deviceSessionResponseSchema.parse((await post("/account/login", { username: a.username, password: PASSWORD }, { cookie: phone.token })).body);
    const other = await account();
    const saves = savedRunsRepo(database);
    const solo = crypto.randomUUID();
    const shared = crypto.randomUUID();
    expect(await saves.upsertOpen(saveRow(solo, [a.id]))).toBe(true);
    expect(await saves.upsertOpen({ ...saveRow(shared, [a.id, other.id]), roomCode: "DELU" })).toBe(true);

    const wrong = await post("/account/delete", { password: "wrong pass" }, { cookie: a.token });
    expect(wrong).toMatchObject({ status: 401, body: { message: "wrong_password" } });
    expect((await post("/account/delete", {}, { cookie: a.token })).body).toEqual({ message: "invalid_body" }); // review nit: no password = bad body
    expect((await accountFootprintForTest(database, [a.id])).accounts).toBeGreaterThan(0);

    const lines: string[] = [];
    vi.spyOn(log, "info").mockImplementation(((...args: unknown[]) => {
      lines.push(JSON.stringify(args));
    }) as never);
    const r = await post("/account/delete", { password: PASSWORD }, { cookie: li.deviceToken });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, kind: "account" });
    expect(await accountFootprintForTest(database, [a.id, phone.id], [solo])).toEqual({ accounts: 0, progress: 0, runRewards: 0, deviceTokens: 0, savedRunPlayers: 0, savedRuns: 0 });
    // B12: the shared run stays, with only the other account's link.
    expect(await accountFootprintForTest(database, [other.id], [shared])).toMatchObject({ savedRunPlayers: 1, savedRuns: 1 });
    // B13: account_deleted with counts only, never an id, a name, a token or an IP.
    const line = lines.find((l) => l.includes("account_deleted")) as string;
    expect(JSON.parse(line)[0]).toEqual({ kind: "account", guests: 1, savedRunsDeleted: 1, seatsRemoved: 1 });
    for (const secret of [a.id, phone.id, a.username, a.token, li.deviceToken, hashGuestToken(li.deviceToken), "10.101."]) expect(line).not.toContain(secret);
    // Every device of the account is gone (the first phone's cookie too).
    expect((await post("/account/session", {}, { cookie: a.token })).body.account).toEqual({ displayName: "", username: null, admin: false });
  });

  it("the deleted account's username can be registered again; the old login is refused", async () => {
    const a = await account();
    expect((await post("/account/delete", { password: PASSWORD }, { cookie: a.token })).status).toBe(200);
    expect((await post("/account/login", { username: a.username, password: PASSWORD })).status).toBe(401);
    const g = await guest();
    const again = await post("/account/upgrade", { username: a.username.toUpperCase(), password: "another pass 9" }, { cookie: g.token });
    expect(again.status).toBe(200);
    expect(again.body.username).toBe(a.username.toUpperCase());
  });

  it("refused with 409 in_room while ANY device of the account is in a room; the hashes are marked only during the call", async () => {
    const a = await account();
    const li = deviceSessionResponseSchema.parse((await post("/account/login", { username: a.username, password: PASSWORD })).body);
    const second = hashGuestToken(li.deviceToken);
    const deps = { accounts: accountsRepo(database), ipLimiter: new SlidingWindowLimiter(5, 60_000), nameLimiter: new NameFailureLimiter(10, 60_000), logGate: new SlidingWindowLimiter(1, 60_000) };
    expect(await deleteMyProgress({ cookieToken: a.token, password: PASSWORD, ip: "10.9.9.9" }, { ...deps, inRoom: (h) => h === second })).toEqual({ status: 409, error: "in_room" });
    // Re-checked after the marks (7.6 L2): a seat that appears between the two checks → 409, nothing deleted.
    let calls = 0;
    expect(await deleteMyProgress({ cookieToken: a.token, password: PASSWORD, ip: "10.9.9.9" }, { ...deps, inRoom: (h) => h === second && ++calls > 1 })).toEqual({ status: 409, error: "in_room" });
    expect(isSwitching(second)).toBe(false);
    expect((await accountFootprintForTest(database, [a.id])).accounts).toBe(1);
    // Liveness: the same call with nobody in a room deletes.
    let markedDuring = false;
    const out = await deleteMyProgress({ cookieToken: a.token, password: PASSWORD, ip: "10.9.9.9" }, { ...deps, inRoom: (h) => {
      if (h === second && isSwitching(second)) markedDuring = true;
      return false;
    } });
    expect(out).toEqual({ status: 200, body: { ok: true, kind: "account" } });
    expect(markedDuring).toBe(true);
    expect(isSwitching(second)).toBe(false);
  });

  it("a real room seat refuses it over HTTP too", async () => {
    const g = await guest();
    const opts = { intent: "create", name: "Ana", balanceVersion: serverBalance.version, mapVersion: DOWNTOWN_MAP.version, netProtocolVersion: NET_PROTOCOL_VERSION, guestToken: g.token, ticket: g.ticket as string };
    const c = await colyseus.sdk.create(RUN_ROOM_NAME, opts);
    for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) c.onMessage(t, () => {});
    expect(await post("/account/delete", {}, { cookie: g.token })).toMatchObject({ status: 409, body: { message: "in_room" } });
    await c.leave();
  });

  it(`rate-limited: the ${MAX_DELETE_CALLS_PER_IP_PER_MIN + 1}th call a minute from one address → 429 before anything is read`, async () => {
    const ip = nextIp();
    const codes: number[] = [];
    for (let i = 0; i <= MAX_DELETE_CALLS_PER_IP_PER_MIN; i++) codes.push((await post("/account/delete", {}, { ip })).status);
    expect(codes.slice(0, MAX_DELETE_CALLS_PER_IP_PER_MIN).every((c) => c === 401)).toBe(true);
    expect(codes[MAX_DELETE_CALLS_PER_IP_PER_MIN]).toBe(429);
  });

  it("a body with unknown keys is a bad body (400): the body is strict", async () => {
    expect((await post("/account/delete", { nope: 1 })).status).toBe(400);
  });
});

describe("Story 10.1: the two new routes refuse a foreign Origin like every account call (CSRF)", () => {
  it("403 for a foreign or missing Origin with PUBLIC_ORIGIN set", async () => {
    const booted = await bootTestServer({ allowedOrigins: ["https://hordes.example"], sessionSecret: SECRET });
    try {
      for (const path of ["/account/settings", "/account/delete"]) {
        for (const origin of ["https://evil.example", undefined]) {
          const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": nextIp() };
          if (origin) headers.origin = origin;
          const res = await fetch(`http://127.0.0.1:${booted.port}${path}`, { method: "POST", headers, body: "{}" });
          expect(res.status).toBe(403);
        }
      }
    } finally {
      await booted.colyseus.shutdown();
    }
  });
});

describe("Story 10.1 review fixes (server)", () => {
  it("L1: a guest's /account/settings → 401 (only a logged-in account syncs); nothing stored", async () => {
    const g = await guest();
    expect((await post("/account/settings", { settings: { rain: "off" } }, { cookie: g.token })).status).toBe(401);
    const s = accountSessionResponseSchema.parse((await post("/account/session", {}, { cookie: g.token })).body);
    if (!s.saved) throw new Error("expected saved");
    expect(s.progress?.settings).toBeNull();
  });

  it("nit: an account's delete with no password → 400 before any Argon2 verify; nothing deleted", async () => {
    const a = await account();
    expect(await post("/account/delete", {}, { cookie: a.token })).toMatchObject({ status: 400, body: { message: "invalid_body" } });
    expect((await accountFootprintForTest(database, [a.id])).accounts).toBe(1);
  });

  it("M2: a login that lands after the room check (an unchecked, unmarked device) → 409 in_room, nothing deleted", async () => {
    const a = await account();
    const real = accountsRepo(database);
    let raced: string | null = null;
    const accounts = {
      ...real,
      deleteAccount: async (...args: Parameters<typeof real.deleteAccount>) => {
        // between the route's room check and the transaction, another phone logs in
        raced = deviceSessionResponseSchema.parse((await post("/account/login", { username: a.username, password: PASSWORD })).body).deviceToken;
        return real.deleteAccount(...args);
      },
    };
    const deps = { accounts, ipLimiter: new SlidingWindowLimiter(5, 60_000), nameLimiter: new NameFailureLimiter(10, 60_000), logGate: new SlidingWindowLimiter(1, 60_000), inRoom: () => false };
    expect(await deleteMyProgress({ cookieToken: a.token, password: PASSWORD, ip: "10.9.9.8" }, deps)).toEqual({ status: 409, error: "in_room" });
    expect(raced).not.toBeNull();
    expect((await accountFootprintForTest(database, [a.id])).deviceTokens).toBe(2);
    // the retry (both devices now checked) deletes
    expect(await deleteMyProgress({ cookieToken: a.token, password: PASSWORD, ip: "10.9.9.8" }, { ...deps, accounts: real })).toEqual({ status: 200, body: { ok: true, kind: "account" } });
  });

  it("L4: a login whose account was deleted after the password check answers stale (401), never 503", async () => {
    const a = await account();
    const devices = deviceTokensRepo(database);
    expect((await post("/account/delete", { password: PASSWORD }, { cookie: a.token })).status).toBe(200);
    expect(await devices.logIn({ oldTokenHash: null, newTokenHash: hashGuestToken("ee".repeat(16)), accountId: a.id, expectPasswordHash: "x" })).toEqual({ outcome: "stale_credentials" });
  });

  it("M3: a bank for a deleted account's seat is a quiet no-op (no FK error, no supplies_bank_failed)", async () => {
    const g = await guest();
    expect((await post("/account/delete", {}, { cookie: g.token })).status).toBe(200);
    const errors: string[] = [];
    vi.spyOn(log, "error").mockImplementation(((...args: unknown[]) => void errors.push(JSON.stringify(args))) as never);
    const r = await progressRepo(database).addSupplies(crypto.randomUUID(), g.id, () => ({ supplies: 40, breakdown: {} }));
    expect(r).toMatchObject({ banked: false, supplies: 0 });
    expect(errors).toEqual([]);
    expect(await accountFootprintForTest(database, [g.id])).toMatchObject({ accounts: 0, progress: 0, runRewards: 0 });
  });

  it("L5: in a shared saved run my seat is scrubbed (no account id, no matchable key, neutral name); the other seat is untouched", async () => {
    const a = await account();
    const other = await account();
    const run = crypto.randomUUID();
    const snapshot = { schemaVersion: 1, wave: 3, seats: [{ seatKey: `acct:${a.id}`, accountId: a.id, name: "Ana Real", slot: 0 }, { seatKey: `acct:${other.id}`, accountId: other.id, name: "Bo", slot: 1 }], bannedSeats: [] };
    expect(await savedRunsRepo(database).upsertOpen({ ...saveRow(run, [a.id, other.id]), roomCode: "DELV", snapshot, names: [{ name: "Ana Real", slot: 0 }, { name: "Bo", slot: 1 }] })).toBe(true);
    expect((await post("/account/delete", { password: PASSWORD }, { cookie: a.token })).status).toBe(200);
    const after = await savedRunForTest(database, run);
    expect(after?.names).toEqual([{ name: DELETED_SEAT_NAME, slot: 0 }, { name: "Bo", slot: 1 }]);
    const seats = after?.snapshot.seats as Record<string, unknown>[];
    expect(seats[0]).toEqual({ seatKey: "deleted:0", accountId: null, name: DELETED_SEAT_NAME, slot: 0 });
    expect(seats[1]).toEqual(snapshot.seats[1]);
    expect(JSON.stringify(after)).not.toContain(a.id);
    expect(JSON.stringify(after)).not.toContain("Ana Real");
  });

  it("L5 (pure): scrubSeats also clears a ban of my seat and returns null when no seat is mine", () => {
    const mine = new Set(["m1"]);
    const out = scrubSeats({ seats: [{ seatKey: "acct:m1", accountId: "m1", name: "Me", slot: 2 }], bannedSeats: [{ seatKey: "acct:m1", guestTokenHash: "abc" }] }, [{ name: "Me", slot: 2 }], mine);
    expect(out?.snapshot.bannedSeats).toEqual([{ seatKey: "deleted", guestTokenHash: "" }]);
    expect(scrubSeats({ seats: [{ seatKey: "acct:x", accountId: "x", name: "X", slot: 0 }] }, [], mine)).toBeNull();
  });

  it("L6: deleting the account that found a run's bag never lets another account of that run be paid a second bag", async () => {
    const finder = await account();
    const other = await account();
    const run = crypto.randomUUID();
    const repo = progressRepo(database);
    const meta = (key: string) => ({
      statsDelta: { revives: 0, kills: 1, barricades: 0, runs: 1 },
      grant: () => ({ cosmetics: [key], districts: [], breakdown: { loot: { key } } }),
    });
    const first = await repo.addSupplies(run, finder.id, () => ({ supplies: 10, breakdown: {} }), meta("hat:red"));
    expect(first.breakdown.loot).toEqual({ key: "hat:red" });
    expect((await post("/account/delete", { password: PASSWORD }, { cookie: finder.token })).status).toBe(200);
    const second = await repo.addSupplies(run, other.id, () => ({ supplies: 10, breakdown: {} }), meta("hat:blue"));
    expect(second.banked).toBe(true);
    expect(second.breakdown.loot).toBeUndefined();
    expect((await repo.get(other.id))?.cosmetics).not.toContain("hat:blue");
  });
});

describe("Story 10.1 re-review round 1 (server)", () => {
  it("L5-live: a live room remembers my seat; I delete; its next autosave keeps my seat scrubbed (snapshot and names)", async () => {
    const me = await account();
    const other = await account();
    const run = crypto.randomUUID();
    const saves = savedRunsRepo(database);
    const snapshot = () => ({ schemaVersion: 1, wave: 4, seats: [{ seatKey: `acct:${me.id}`, accountId: me.id, name: "Ana Real", slot: 0 }, { seatKey: `acct:${other.id}`, accountId: other.id, name: "Bo", slot: 1 }], bannedSeats: [] });
    const row = () => ({ ...saveRow(run, [me.id, other.id]), roomCode: "LIVE", snapshot: snapshot(), names: [{ name: "Ana Real", slot: 0 }, { name: "Bo", slot: 1 }] });
    expect(await saves.upsertOpen(row())).toBe(true);
    expect((await post("/account/delete", { password: PASSWORD }, { cookie: me.token })).status).toBe(200);
    // the room still remembers the seat (its account id and real name) and autosaves
    expect(await saves.upsertOpen(row())).toBe(true);
    const after = await savedRunForTest(database, run);
    expect(JSON.stringify(after)).not.toContain(me.id);
    expect(JSON.stringify(after)).not.toContain("Ana Real");
    expect(after?.names).toEqual([{ name: DELETED_SEAT_NAME, slot: 0 }, { name: "Bo", slot: 1 }]);
    expect((after?.snapshot.seats as Record<string, unknown>[])[1]).toMatchObject({ accountId: other.id, name: "Bo" });
    expect(await accountFootprintForTest(database, [other.id], [run])).toMatchObject({ savedRunPlayers: 1, savedRuns: 1 });
  });

  it("L5-bans: a ban matching a scrubbed seat's guest key or token hash loses its hash too; other bans stay", () => {
    const out = scrubSeats(
      {
        seats: [{ seatKey: "acct:m1", accountId: "m1", name: "Me", slot: 0, guestTokenHash: "h-me" }, { seatKey: "guest:h-g", accountId: "m1", name: "Me2", slot: 1 }],
        bannedSeats: [{ seatKey: "guest:h-g", guestTokenHash: "x" }, { seatKey: "other", guestTokenHash: "h-me" }, { seatKey: "other", guestTokenHash: "h-g" }, { seatKey: "keep", guestTokenHash: "h-keep" }],
      },
      [],
      new Set(["m1"]),
    );
    expect(out?.snapshot.bannedSeats).toEqual([{ seatKey: "deleted", guestTokenHash: "" }, { seatKey: "deleted", guestTokenHash: "" }, { seatKey: "deleted", guestTokenHash: "" }, { seatKey: "keep", guestTokenHash: "h-keep" }]);
  });

  it("M3-log: a bank for a missing account logs supplies_bank_no_account { runId } once and answers noAccount (not 'already banked')", async () => {
    const warns: unknown[][] = [];
    vi.spyOn(log, "warn").mockImplementation(((...args: unknown[]) => void warns.push(args)) as never);
    const runId = crypto.randomUUID();
    const r = await progressRepo(database).addSupplies(runId, "99999999-9999-4999-8999-999999999999", () => ({ supplies: 5, breakdown: {} }));
    expect(r).toMatchObject({ banked: false, noAccount: true });
    expect(warns.filter((w) => w[1] === "supplies_bank_no_account")).toEqual([[{ runId }, "supplies_bank_no_account"]]);
  });
});
