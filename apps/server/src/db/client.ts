/**
 * Story 7.1: the database handle. Production: PostgreSQL 18 through `pg` from `DATABASE_URL` (migrations are applied
 * beforehand by `npm run db:migrate`, deploy.sh runs it before `up -d`). Outside production without `DATABASE_URL`:
 * an embedded PGlite (decision 7.1 D1), opened and migrated on first use, so dev, builders and Vitest need no Docker.
 *
 * The handle is LAZY: nothing connects until a repository asks, so a server whose database is down still starts,
 * creates rooms and runs ticks (P3); every call goes through the repositories' 2 s timeout.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import { log } from "../ops/logger";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  readonly kind: "postgres" | "pglite";
  /** The Drizzle handle; opens (and for PGlite migrates) on the first call. Rejects when the database can't be reached. */
  db(): Promise<Db>;
  close(): Promise<void>;
}

/** PostgreSQL through a small `pg` pool. Never throws here: connection errors surface on the first query. */
export function openPostgres(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 2000, idleTimeoutMillis: 30_000 });
  // An idle client losing its connection must not crash the process (P3): log it; the pool replaces the client.
  pool.on("error", (e) => log.error({ op: "pool", err: e.message }, "db_error"));
  const db = drizzlePg({ client: pool, schema }) as unknown as Db;
  return {
    kind: "postgres",
    db: () => Promise.resolve(db),
    close: () => pool.end(),
  };
}

/**
 * PGlite in a directory (`dataDir`, survives restarts) or in memory (`memory://`, the default: tests). Opened and
 * migrated once, on first use; a failed open is retried on the next call.
 */
export function openPglite(dataDir = "memory://"): Database {
  let opening: Promise<{ db: Db; close: () => Promise<void> }> | null = null;
  let closed = false;
  const open = async () => {
    const [{ PGlite }, { drizzle }, { migrateDb }] = await Promise.all([
      import("@electric-sql/pglite"),
      import("drizzle-orm/pglite"),
      import("./migrate"),
    ]);
    const client = new PGlite(dataDir);
    const db = drizzle({ client, schema }) as unknown as Db;
    await migrateDb({ kind: "pglite", db });
    return { db, close: () => client.close() };
  };
  return {
    kind: "pglite",
    db: async () => {
      if (closed) throw new Error("database closed");
      opening ??= open().catch((e: unknown) => {
        opening = null;
        throw e;
      });
      return (await opening).db;
    },
    close: async () => {
      closed = true;
      if (opening === null) return;
      const handle = await opening.catch(() => null);
      opening = null;
      await handle?.close();
    },
  };
}

export interface DatabaseEnv {
  DATABASE_URL?: string | undefined;
  NODE_ENV?: string | undefined;
  PGLITE_DIR?: string | undefined;
}

/**
 * The database for this process from its environment. Production without `DATABASE_URL` throws (index.ts logs
 * `database_url_missing` and exits). Dev without it: PGlite in `PGLITE_DIR` (default `apps/server/.data/pglite`).
 */
export function databaseFromEnv(env: DatabaseEnv, defaultPgliteDir: string): Database {
  const url = env.DATABASE_URL?.trim();
  if (url) return openPostgres(url);
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
  return openPglite(env.PGLITE_DIR?.trim() || defaultPgliteDir);
}
