import { describe, expect, it } from "vitest";
import { AdminCheatGate, CHEAT_LOG_EVERY_MS, devAdminCheats } from "./adminCheatGate";

/** Story 10.12 (B4, B7, B9; review N2): the server's admin decision and the log rate, without a room. */
const seat = { seatId: "p0#1", guestTokenHash: "h", accountId: "acc" };
const admin = { id: "acc", username: "ana", isAdmin: true } as never;

describe("AdminCheatGate", () => {
  it("B7: one read per seat, then cached; a guest seat or no database is never an admin", async () => {
    let reads = 0;
    const gate = new AdminCheatGate(() => ({ findByTokenHash: async () => (reads++, admin) }), {});
    expect(await gate.isAdmin(seat)).toBe(true);
    expect(gate.isAdmin(seat)).toBe(true);
    expect(reads).toBe(1);
    expect(gate.isAdmin({ ...seat, seatId: "p1#1", accountId: null })).toBe(false);
    expect(new AdminCheatGate(() => null, {}).isAdmin(seat)).toBe(false);
    // Another account's device, or an account without the mark: no.
    const other = new AdminCheatGate(() => ({ findByTokenHash: async () => ({ id: "x", username: "ana", isAdmin: true }) as never }), {});
    expect(await other.isAdmin(seat)).toBe(false);
  });

  it("review N2: a failed read refuses and is cached for 10 s, then read again", async () => {
    let now = 1000;
    let fail = true;
    let reads = 0;
    const gate = new AdminCheatGate(() => ({ findByTokenHash: async () => (reads++, fail ? Promise.reject(new Error("db")) : admin) }), {}, () => now);
    expect(await gate.isAdmin(seat)).toBe(false);
    now += CHEAT_LOG_EVERY_MS - 1;
    expect(gate.isAdmin(seat)).toBe(false);
    expect(reads).toBe(1);
    fail = false;
    now += 1;
    expect(await gate.isAdmin(seat)).toBe(true);
    expect(reads).toBe(2);
  });

  it("B9 + B4: the dev switch (never in production); one log line per seat, kind and outcome per 10 s", () => {
    expect(devAdminCheats({ DEV_ADMIN_CHEATS: "1" })).toBe(true);
    expect(devAdminCheats({ DEV_ADMIN_CHEATS: "1", NODE_ENV: "production" })).toBe(false);
    let now = 0;
    const gate = new AdminCheatGate(() => null, {}, () => now);
    expect(gate.shouldLog("s", "money", "refused")).toBe(true);
    expect(gate.shouldLog("s", "money", "refused")).toBe(false);
    expect(gate.shouldLog("s", "spawn", "refused")).toBe(true);
    expect(gate.shouldLog("s", "money", "used")).toBe(true);
    now = CHEAT_LOG_EVERY_MS;
    expect(gate.shouldLog("s", "money", "refused")).toBe(true);
  });
});
