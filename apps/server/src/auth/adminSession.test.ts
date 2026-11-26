import { accountSessionResponseSchema, deviceSessionResponseSchema, upgradeResponseSchema } from "@topdown/shared";
import type { ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { adminsRepo } from "../db/accountsRepo";
import { runAdminCommand } from "../db/adminCommand";
import { type Database, openPglite } from "../db/client";
import { log } from "../ops/logger";
import { bootTestServer } from "../test/bootTestServer";

/** Story 10.11 (AC 1, 2): the admin mark, the operator command and the session's `account.admin`, over real HTTP on PGlite. */
const SECRET = "test-secret-1011".padEnd(48, "x");
const PASSWORD = "correct horse 1";

let colyseus: ColyseusTestServer;
let database: Database;
let port: number;
let ipSeq = 0;
const nextIp = () => `10.11.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

async function post(path: string, body: unknown, cookie?: string): Promise<{ status: number; body: Record<string, unknown>; token: string | undefined }> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": nextIp() };
  if (cookie !== undefined) headers.cookie = `__Host-tdg=${cookie}`;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, token: /^__Host-tdg=([0-9a-f]{32});/.exec(res.headers.get("set-cookie") ?? "")?.[1] };
}

let names = 0;
const uname = () => `ad_${Date.now() % 100000}_${++names}`;

/** A full account (a guest saved) on its own device. */
async function account(username = uname()): Promise<{ token: string; username: string; code: string }> {
  const g = await post("/account/session", {});
  const r = await post("/account/upgrade", { username, password: PASSWORD }, g.token);
  expect(r.status).toBe(200);
  const up = upgradeResponseSchema.parse(r.body);
  expect(up.username).toBe(username);
  return { token: g.token as string, username, code: up.recoveryCode };
}

const adminOf = async (token: string): Promise<boolean | undefined> => {
  const s = accountSessionResponseSchema.parse((await post("/account/session", {}, token)).body);
  return s.saved ? s.account.admin : undefined;
};

/** The operator command, with its terminal output collected. */
async function admin(...args: string[]): Promise<{ code: number; out: string[] }> {
  const out: string[] = [];
  const code = await runAdminCommand(args, adminsRepo(database), (l) => out.push(l));
  return { code, out };
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

describe("Story 10.11 AC 1: the admin command", () => {
  it("add (case-blind) marks the account, list shows it, remove unmarks it; each change logs account_admin {accountId, admin} only", async () => {
    const a = await account("Mo_Admin");
    const info = vi.spyOn(log, "info");
    expect(await admin("add", "MO_ADMIN")).toMatchObject({ code: 0 });
    expect(await adminOf(a.token)).toBe(true);
    expect((await admin("list")).out).toContain("Mo_Admin");
    expect(await admin("remove", "mo_admin")).toMatchObject({ code: 0 });
    expect(await adminOf(a.token)).toBe(false);
    expect((await admin("list")).out).not.toContain("Mo_Admin");
    const lines = info.mock.calls.filter((c) => c[1] === "account_admin");
    expect(lines).toHaveLength(2);
    expect(lines.map((c) => (c[0] as { admin: boolean }).admin)).toEqual([true, false]);
    for (const [fields] of lines) expect(Object.keys(fields as object).sort()).toEqual(["accountId", "admin"]);
    expect(JSON.stringify(lines)).not.toMatch(/mo_admin/i);
  });

  it("an unknown username is refused (exit 1, nothing changed); a bad argument prints the usage (exit 2)", async () => {
    const before = (await admin("list")).out;
    expect(await admin("add", "nobody_here_1011")).toEqual({ code: 1, out: ['no registered account named "nobody_here_1011"'] });
    expect(await admin("remove", "nobody_here_1011")).toMatchObject({ code: 1 });
    expect((await admin("list")).out).toEqual(before);
    for (const bad of [[], ["add"], ["add", ""], ["add", "a", "b"], ["grant", "a"], ["list", "x"]]) {
      const r = await admin(...bad);
      expect(r.code).toBe(2);
      expect(r.out[0]).toMatch(/^usage:/);
    }
  });

  it("a guest can't be named: the repo only matches rows with a username, and a guest session always says admin: false", async () => {
    const g = await post("/account/session", {});
    expect(accountSessionResponseSchema.parse(g.body)).toMatchObject({ saved: true, account: { username: null, admin: false } });
    expect(await adminsRepo(database).setAdmin("", true)).toBeNull();
    expect(await adminOf(g.token as string)).toBe(false);
  });
});

describe("Story 10.11 AC 2: every session reply carries account.admin", () => {
  it("session: false for a fresh guest and a plain account, true for an admin", async () => {
    const plain = await account();
    expect(await adminOf(plain.token)).toBe(false);
    const a = await account();
    await admin("add", a.username);
    expect(await adminOf(a.token)).toBe(true);
    expect(await adminOf(plain.token)).toBe(false);
  });

  it("login into an admin account → true; recover → true; logout → the new guest is false", async () => {
    const a = await account();
    await admin("add", a.username);
    const phone = await post("/account/session", {});
    const login = await post("/account/login", { username: a.username, password: PASSWORD }, phone.token);
    expect(login.status).toBe(200);
    expect(deviceSessionResponseSchema.parse(login.body).account.admin).toBe(true);
    const out = await post("/account/logout", {}, login.token);
    expect(out.status).toBe(200);
    expect(deviceSessionResponseSchema.parse(out.body).account).toEqual({ displayName: "", username: null, admin: false });
    expect(await adminOf(out.token as string)).toBe(false);
    const rec = await post("/account/recover", { username: a.username, code: a.code, newPassword: "another pass 2" }, (await post("/account/session", {})).token);
    expect(rec.status).toBe(200);
    expect(deviceSessionResponseSchema.parse(rec.body).account.admin).toBe(true);
    // Login into a non-admin account → false.
    const plain = await account();
    const login2 = await post("/account/login", { username: plain.username, password: PASSWORD }, out.token);
    expect(deviceSessionResponseSchema.parse(login2.body).account.admin).toBe(false);
  });

  it("the flag is in the reply only for its own device (never in another device's session)", async () => {
    const a = await account();
    await admin("add", a.username);
    const other = await post("/account/session", {});
    expect(JSON.stringify(other.body)).not.toContain(a.username);
    expect(await adminOf(other.token as string)).toBe(false);
  });
});
