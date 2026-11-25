import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANK_TX_BUDGET_MS, BANK_LOCK_TIMEOUT_MS } from "./boundedTx";
import { PG_QUERY_TIMEOUT_MS } from "./client";

/** Story 7.2 re-review 2 (RR2-L1): a dead line always settles. (RR2-M1's client error handler is 7.1's, in db/client.ts.) */
describe("db client (re-review 2)", () => {
  it("RR2-L1: the client query timeout (3 s) is above every PostgreSQL-side bound of a bank; migrations pass 0", () => {
    expect(PG_QUERY_TIMEOUT_MS).toBe(3000);
    expect(PG_QUERY_TIMEOUT_MS).toBeGreaterThan(Math.max(BANK_TX_BUDGET_MS, BANK_LOCK_TIMEOUT_MS));
    const cli = readFileSync(fileURLToPath(new URL("./migrateCli.ts", import.meta.url)), "utf8");
    expect(cli).toMatch(/databaseFromEnv\(process\.env, DEFAULT_PGLITE_DIR, \{ queryTimeoutMs: 0 \}\)/);
  });
});
