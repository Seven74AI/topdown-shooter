/**
 * Story 7.1: applies the committed Drizzle Kit migrations (`apps/server/drizzle/`) to either driver. Idempotent:
 * Drizzle records applied migrations in `drizzle.__drizzle_migrations`, so running it twice is a no-op.
 */
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDb(target: { kind: "postgres" | "pglite"; db: Db }): Promise<void> {
  if (target.kind === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(target.db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(target.db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS_FOLDER });
  }
}
