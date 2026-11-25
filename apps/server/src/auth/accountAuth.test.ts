import { DOWNTOWN_MAP, NET_PROTOCOL_VERSION, RUN_ROOM_NAME, BYTES, S2C, deviceSessionResponseSchema, recoverResponseSchema, upgradeResponseSchema } from "@topdown/shared";
import type { ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { log } from "../ops/logger";
import { serverBalance } from "../rooms/RunRoom";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { MAX_LOGIN_ATTEMPTS_PER_IP_PER_MIN, MAX_LOGIN_ATTEMPTS_PER_NAME_PER_MIN } from "../net/limits";
import { verifyCount } from "./passwords";
import { deviceInRoom } from "./devicesInRooms";
import { readTicket, verifyTicket } from "./ticket";

/** Story 7.6 (A1–A5, AC 2–11): the account routes over real HTTP, on PGlite. */
const SECRET = "test-secret-76".padEnd(48, "x");
const PASSWORD = "correct horse 1";

interface Reply {
  status: number;
  text: string;
  body: Record<string, unknown>;
  token: string | undefined;
}

let colyseus: ColyseusTestServer;
let database: Database;
let port: number;
let ipSeq = 0;
/** A fresh client IP per test step unless one is given (the login limiter is per IP). */
const nextIp = () => `10.7.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

async function post(path: string, body: unknown, opts: { cookie?: string | undefined; ip?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": opts.ip ?? nextIp() };
  if (opts.cookie !== undefined) headers.cookie = `__Host-tdg=${opts.cookie}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return { status: res.status, text, body: parsed, token: /^__Host-tdg=([0-9a-f]{32});/.exec(res.headers.get("set-cookie") ?? "")?.[1] };
}

/** A new guest device: its token (from the cookie of `/account/session`) and account id. */
async function guest(): Promise<{ token: string; id: string }> {
  const r = await post("/account/session", {});
  const token = r.token as string;
  const id = readTicket(r.body.ticket, SECRET)?.accountId as string;
  return { token, id };
}

let names = 0;
const uname = () => `mo_${Date.now() % 100000}_${++names}`;

/** A full account (guest saved) and its recovery code. */
async function account(username = uname(), password = PASSWORD): Promise<{ token: string; id: string; username: string; code: string }> {
  const g = await guest();
  const r = await post("/account/upgrade", { username, password }, { cookie: g.token });
  expect(r.status).toBe(200);
  return { ...g, username, code: upgradeResponseSchema.parse(r.body).recoveryCode };
}

async function setSupplies(id: string, n: number, unlocks: string[] = []): Promise<void> {
  // Through the bank (the only Supplies writer), then an unlock purchase: no SQL outside src/db.
  const repo = progressRepo(database);
  await repo.addSupplies(crypto.randomUUID(), id, () => ({ supplies: n, breakdown: {} }));
  for (const u of unlocks) await repo.unlock(id, u, 100);
}

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

describe("Story 7.6: Save my progress (POST /account/upgrade)", () => {
  it("A1: the guest becomes an account in place: same id, same progress, username set, the code shown once as ABCD-EFGH-JKMN", async () => {
    const g = await guest();
    await setSupplies(g.id, 250, ["mine"]);
    const name = uname();
    const r = await post("/account/upgrade", { username: name, password: PASSWORD }, { cookie: g.token });
    expect(r.status).toBe(200);
    const body = upgradeResponseSchema.parse(r.body);
    expect(body.username).toBe(name);
    expect(body.recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    const s = await post("/account/session", {}, { cookie: g.token });
    expect(readTicket(s.body.ticket, SECRET)?.accountId).toBe(g.id);
    expect(s.body.account).toEqual({ displayName: "", username: name });
    expect(s.body.progress).toEqual({ supplies: 150, lifetimeSupplies: 250, unlocks: ["mine"] });
    // The password and the code both work (they were stored as hashes that verify).
    expect((await post("/account/login", { username: name, password: PASSWORD })).status).toBe(200);
    expect((await post("/account/recover", { username: name, code: body.recoveryCode, newPassword: "another pass 2" })).status).toBe(200);
  });

  it("AC 2: taken (any case), already an account, bad name, bad password, no cookie", async () => {
    const a = await account("Taken_Name");
    const g = await guest();
    expect(await post("/account/upgrade", { username: "taken_name", password: PASSWORD }, { cookie: g.token })).toMatchObject({ status: 409, body: { message: "name_taken" } });
    expect(await post("/account/upgrade", { username: uname(), password: PASSWORD }, { cookie: a.token })).toMatchObject({ status: 409, body: { message: "already_account" } });
    for (const bad of ["ab", "a".repeat(21), "mo 42", "mo@42", "mø42"]) {
      expect(await post("/account/upgrade", { username: bad, password: PASSWORD }, { cookie: g.token })).toMatchObject({ status: 400, body: { message: "bad_username" } });
    }
    expect(await post("/account/upgrade", { username: "mo.4-2_", password: "short" }, { cookie: g.token })).toMatchObject({ status: 400, body: { message: "bad_password" } });
    expect(await post("/account/upgrade", { username: "mo.4-2_", password: "x".repeat(129) }, { cookie: g.token })).toMatchObject({ status: 400, body: { message: "bad_password" } });
    expect(await post("/account/upgrade", { username: "mo.4-2_", password: PASSWORD })).toMatchObject({ status: 401, body: { message: "no_account" } });
    expect(await post("/account/upgrade", { username: "mo.4-2_", password: PASSWORD, accountId: a.id }, { cookie: g.token })).toMatchObject({ status: 400, body: { message: "invalid_body" } });
  });
});

describe("Story 7.6: log in (POST /account/login)", () => {
  it("A2 + A5: a guest phone with progress logs in: merged (refund), new token in the cookie, the old token is a stranger now", async () => {
    const a = await account();
    await setSupplies(a.id, 400, ["mine"]);
    const phone = await guest();
    await setSupplies(phone.id, 120, ["mine"]); // 20 left after mine; the account refunds mine's 100
    const r = await post("/account/login", { username: a.username.toUpperCase(), password: PASSWORD }, { cookie: phone.token });
    expect(r.status).toBe(200);
    const body = deviceSessionResponseSchema.parse(r.body);
    expect(r.token).toBe(body.deviceToken);
    expect(body.deviceToken).not.toBe(phone.token);
    expect(verifyTicket(body.ticket, SECRET, hashGuestToken(body.deviceToken))).toBe(a.id); // ticket bound to the NEW token
    expect(body.account.username).toBe(a.username);
    expect(body.progress).toEqual({ supplies: 300 + 20 + 100, lifetimeSupplies: 520, unlocks: ["mine"] });
    const after = await post("/account/session", {}, { cookie: body.deviceToken });
    expect(readTicket(after.body.ticket, SECRET)?.accountId).toBe(a.id);
    const stale = await post("/account/session", {}, { cookie: phone.token });
    const staleId = readTicket(stale.body.ticket, SECRET)?.accountId;
    expect(staleId).not.toBe(a.id);
    expect(staleId).not.toBe(phone.id); // a brand-new empty guest, never the merged one
    expect(stale.body.progress).toEqual({ supplies: 0, lifetimeSupplies: 0, unlocks: [] });
  });

  it("A3: wrong name and wrong password give byte-identical answers; a missing name still runs one Argon2 verify", async () => {
    const a = await account();
    const before = verifyCount();
    const wrongPass = await post("/account/login", { username: a.username, password: "wrong password" });
    const mid = verifyCount();
    const wrongName = await post("/account/login", { username: "nobody_here", password: PASSWORD });
    const badShape = await post("/account/login", { username: "x", password: PASSWORD });
    expect(wrongPass.status).toBe(401);
    expect(wrongName.status).toBe(401);
    expect(wrongName.text).toBe(wrongPass.text);
    expect(badShape.text).toBe(wrongPass.text);
    expect(wrongPass.body).toEqual({ message: "wrong_login" });
    expect(mid - before).toBe(1);
    expect(verifyCount() - mid).toBe(2); // the missing name and the malformed name each paid one verify
  });

  it("A3 / AC 8: the 6th attempt in a minute from one IP gets 429, right or wrong; login and recover share the limit", async () => {
    const a = await account();
    const ip = "10.99.0.1";
    expect(MAX_LOGIN_ATTEMPTS_PER_IP_PER_MIN).toBe(5);
    for (let i = 0; i < 3; i++) expect((await post("/account/login", { username: a.username, password: PASSWORD }, { ip })).status).toBe(200);
    expect((await post("/account/recover", { username: a.username, code: "AAAA-AAAA-AAAA", newPassword: PASSWORD }, { ip })).status).toBe(401);
    expect((await post("/account/login", { username: a.username, password: "nope nope" }, { ip })).status).toBe(401);
    const sixth = await post("/account/login", { username: a.username, password: PASSWORD }, { ip });
    expect(sixth).toMatchObject({ status: 429, body: { message: "rate_limited" } });
    expect((await post("/account/recover", { username: a.username, code: a.code, newPassword: PASSWORD }, { ip })).status).toBe(429);
    // IPv6: one /64 is one bucket
    for (let i = 0; i < 5; i++) await post("/account/login", { username: "nobody", password: PASSWORD }, { ip: `2001:db8:5:6::${i + 1}` });
    expect((await post("/account/login", { username: a.username, password: PASSWORD }, { ip: "2001:db8:5:6::99" })).status).toBe(429);
  });

  it("A3: six attempts from six addresses are all evaluated; brief 19: over 10 wrong a minute, an address that failed for the name is refused", async () => {
    const a = await account();
    for (let i = 0; i < 6; i++) expect((await post("/account/login", { username: a.username, password: "wrong one!" })).status).toBe(401);
    const repeat = "10.66.0.9";
    expect((await post("/account/login", { username: a.username, password: "wrong one!" }, { ip: repeat })).status).toBe(401);
    for (let i = 7; i < MAX_LOGIN_ATTEMPTS_PER_NAME_PER_MIN; i++) await post("/account/login", { username: a.username, password: "wrong one!" });
    // over the name's budget: the address that already failed for it gets 429, even with the right password
    expect(await post("/account/login", { username: a.username, password: PASSWORD }, { ip: repeat })).toMatchObject({ status: 429, body: { message: "rate_limited" } });
    // the same for a name that doesn't exist (the answer never says whether it does)
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS_PER_NAME_PER_MIN; i++) await post("/account/login", { username: "ghost_name", password: "x".repeat(8) }, { ip: `10.67.0.${i % 2}` });
    expect((await post("/account/login", { username: "GHOST_NAME", password: "x".repeat(8) }, { ip: "10.67.0.1" })).status).toBe(429);
  });

  it("review M1: 2 addresses × 5 wrong guesses can't lock the owner out: the right password (and recovery) from a clean address → 200", async () => {
    const a = await account();
    for (const ip of ["10.70.0.1", "10.70.0.2"]) for (let i = 0; i < 5; i++) expect((await post("/account/login", { username: a.username, password: "guess guess" }, { ip })).status).toBe(401);
    expect((await post("/account/login", { username: a.username, password: PASSWORD }, { ip: "10.70.0.3" })).status).toBe(200);
    expect((await post("/account/recover", { username: a.username.toUpperCase(), code: a.code, newPassword: "fresh pass 9" }, { ip: "10.70.0.4" })).status).toBe(200);
    // a fresh attacking address still gets ONE evaluated guess, then it is refused for this name
    expect((await post("/account/login", { username: a.username, password: "guess again" }, { ip: "10.70.0.5" })).status).toBe(401);
    expect((await post("/account/login", { username: a.username, password: "guess more" }, { ip: "10.70.0.5" })).status).toBe(429);
    // right answers never count toward the name budget
    const b = await account();
    for (let i = 0; i < MAX_LOGIN_ATTEMPTS_PER_NAME_PER_MIN + 2; i++) expect((await post("/account/login", { username: b.username, password: PASSWORD })).status).toBe(200);
  });

  it("AC 9: log in while the phone is in a lobby → 409 in_room (nothing changed); Save my progress is allowed there", async () => {
    const a = await account();
    const g = await guest();
    const room = await colyseus.sdk.create(RUN_ROOM_NAME, {
      intent: "create",
      name: "Ana",
      balanceVersion: serverBalance.version,
      mapVersion: DOWNTOWN_MAP.version,
      netProtocolVersion: NET_PROTOCOL_VERSION,
      guestToken: g.token,
    });
    for (const t of [BYTES.HORDE_FRAME, S2C.SIM_EVENTS_FLUSHED, S2C.NET_PINGED, S2C.PLAYER_LEFT, S2C.SHOP_OFFERED, S2C.RUN_JOINED]) room.onMessage(t, () => {});
    expect(await post("/account/login", { username: a.username, password: PASSWORD }, { cookie: g.token })).toMatchObject({ status: 409, body: { message: "in_room" } });
    expect(await post("/account/recover", { username: a.username, code: a.code, newPassword: PASSWORD }, { cookie: g.token })).toMatchObject({ status: 409 });
    const save = await post("/account/upgrade", { username: uname(), password: PASSWORD }, { cookie: g.token });
    expect(save.status).toBe(200);
    expect(await post("/account/logout", {}, { cookie: g.token })).toMatchObject({ status: 409, body: { message: "in_room" } });
    await room.leave();
    await vi.waitFor(() => expect(deviceInRoom(hashGuestToken(g.token))).toBe(false));
    expect((await post("/account/logout", {}, { cookie: g.token })).status).toBe(200);
  });
});

describe("Story 7.6: forgot password (POST /account/recover)", () => {
  it("A4: username + code (lower case, no dashes) + new password: old password and old code dead, new ones work, new code shown", async () => {
    const a = await account();
    const wrong = await post("/account/recover", { username: a.username, code: "0000-0000-0000", newPassword: "brand new 1" });
    const missing = await post("/account/recover", { username: "nobody_x", code: a.code, newPassword: "brand new 1" });
    expect(wrong).toMatchObject({ status: 401, body: { message: "wrong_code" } });
    expect(missing.text).toBe(wrong.text);
    const r = await post("/account/recover", { username: a.username, code: a.code.replace(/-/g, "").toLowerCase(), newPassword: "brand new 1" });
    expect(r.status).toBe(200);
    const body = recoverResponseSchema.parse(r.body);
    expect(body.recoveryCode).not.toBe(a.code);
    expect(verifyTicket(body.ticket, SECRET, hashGuestToken(body.deviceToken))).toBe(a.id);
    expect((await post("/account/login", { username: a.username, password: PASSWORD })).status).toBe(401);
    expect((await post("/account/login", { username: a.username, password: "brand new 1" })).status).toBe(200);
    expect((await post("/account/recover", { username: a.username, code: a.code, newPassword: "again new 1" })).status).toBe(401);
    expect((await post("/account/recover", { username: a.username, code: body.recoveryCode, newPassword: "again new 1" })).status).toBe(200);
  });

  it("a too-short new password is refused before the code is checked (the answer says nothing about the code)", async () => {
    const a = await account();
    expect(await post("/account/recover", { username: a.username, code: a.code, newPassword: "short" })).toMatchObject({ status: 400, body: { message: "bad_password" } });
    expect(await post("/account/recover", { username: a.username, code: "0000-0000-0000", newPassword: "short" })).toMatchObject({ status: 400, body: { message: "bad_password" } });
  });
});

describe("Story 7.6: log out (POST /account/logout)", () => {
  it("A5: the phone becomes a new empty guest (new cookie); the account still loads on a second phone; a guest can't log out", async () => {
    const a = await account();
    await setSupplies(a.id, 90);
    const r = await post("/account/logout", {}, { cookie: a.token });
    expect(r.status).toBe(200);
    const body = deviceSessionResponseSchema.parse(r.body);
    expect(r.token).toBe(body.deviceToken);
    expect(body.account).toEqual({ displayName: "", username: null });
    expect(body.progress).toEqual({ supplies: 0, lifetimeSupplies: 0, unlocks: [] });
    const newId = readTicket(body.ticket, SECRET)?.accountId;
    expect(newId).not.toBe(a.id);
    const other = await post("/account/login", { username: a.username, password: PASSWORD });
    expect(deviceSessionResponseSchema.parse(other.body).progress).toEqual({ supplies: 90, lifetimeSupplies: 90, unlocks: [] });
    expect(await post("/account/logout", {}, { cookie: body.deviceToken })).toMatchObject({ status: 409, body: { message: "not_logged_in" } });
  });
});

describe("Story 7.6 AC 11: logs", () => {
  it("logs account_upgraded, login_ok, login_failed {ip}, recover_ok, recover_failed {ip}, account_merged, logout, and never a secret", async () => {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error"] as const) {
      vi.spyOn(log, level).mockImplementation(((...args: unknown[]) => {
        lines.push(JSON.stringify(args));
      }) as never);
    }
    const name = uname();
    const g = await guest();
    await setSupplies(g.id, 10);
    const up = await post("/account/upgrade", { username: name, password: PASSWORD }, { cookie: g.token });
    const code = String(up.body.recoveryCode);
    const phone = await guest();
    await setSupplies(phone.id, 5);
    await post("/account/login", { username: name, password: "wrong pass" });
    const li = await post("/account/login", { username: name, password: PASSWORD }, { cookie: phone.token });
    await post("/account/recover", { username: name, code: "1111-1111-1111", newPassword: "newer pass" });
    const rc = await post("/account/recover", { username: name, code, newPassword: "newer pass" });
    await post("/account/logout", {}, { cookie: String(rc.body.deviceToken) });
    const all = lines.join("\n");
    for (const msg of ["account_upgraded", "login_ok", "login_failed", "recover_ok", "recover_failed", "account_merged", "logout"]) expect(all).toContain(msg);
    expect(lines.find((l) => l.includes("login_failed"))).toMatch(/"ip":"10\.7\./);
    for (const secret of [PASSWORD, "wrong pass", "newer pass", code, code.replace(/-/g, ""), g.token, phone.token, String(li.body.deviceToken), String(rc.body.recoveryCode), hashGuestToken(g.token), "$argon2id"]) {
      expect(all).not.toContain(secret);
    }
  });
});
