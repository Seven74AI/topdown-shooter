import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { log } from "../ops/logger";
import { BANK_TX_BUDGET_MS, BANK_LOCK_TIMEOUT_MS } from "./boundedTx";
import { PG_QUERY_TIMEOUT_MS, onClientError } from "./client";

/** Story 7.2 re-review 2 (RR2-M1, RR2-L1): a lost connection never crashes the server; a dead line always settles. */
describe("db client (re-review 2)", () => {
  it("RR2-M1: a pool client's 'error' event is logged as db_error and never thrown (a fake client emitting 'error')", () => {
    const spy = vi.spyOn(log, "error").mockImplementation(() => undefined);
    const fakeClient = new EventEmitter();
    fakeClient.on("error", onClientError);
    expect(() => fakeClient.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    expect(spy).toHaveBeenCalledWith({ op: "client", err: "terminating connection due to administrator command" }, "db_error");
    spy.mockRestore();
    // Without a listener Node throws on 'error' — the crash the handler prevents.
    expect(() => new EventEmitter().emit("error", new Error("x"))).toThrow();
  });

  it("RR2-M1 wiring: openPostgres attaches the handler to every client the pool connects", () => {
    const src = readFileSync(fileURLToPath(new URL("./client.ts", import.meta.url)), "utf8");
    expect(src).toMatch(/pool\.on\("connect", \(c\) => \{\s*c\.on\("error", onClientError\);/);
  });

  it("RR2-L1: the client query timeout (3 s) is above every PostgreSQL-side bound of a bank; migrations pass 0", () => {
    expect(PG_QUERY_TIMEOUT_MS).toBe(3000);
    expect(PG_QUERY_TIMEOUT_MS).toBeGreaterThan(Math.max(BANK_TX_BUDGET_MS, BANK_LOCK_TIMEOUT_MS));
    const cli = readFileSync(fileURLToPath(new URL("./migrateCli.ts", import.meta.url)), "utf8");
    expect(cli).toMatch(/databaseFromEnv\(process\.env, DEFAULT_PGLITE_DIR, \{ queryTimeoutMs: 0 \}\)/);
  });
});
