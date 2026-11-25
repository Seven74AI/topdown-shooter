/**
 * Story 7.1: the database tables (Drizzle, PostgreSQL 18 in production, PGlite in dev/tests). Only the repositories in
 * this folder import it (`noDbImports.test.ts`). Migrations are generated from this file with `npm run db:generate`
 * and committed under `apps/server/drizzle/`; never edit a committed migration, add a new one.
 */
import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per player. A guest account has only `guest_token_hash` (SHA-256 hex of the 128-bit device token; the raw
 * token is never stored); 7.6 fills `username`, `password_hash` (argon2id) and `recovery_code_hash`.
 * No email, no IP (privacy, brief 28).
 */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  recoveryCodeHash: text("recovery_code_hash"),
  guestTokenHash: text("guest_token_hash").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per account. `unlocks` holds only BOUGHT unlock ids (decision 7.1 D4: the starter pool is data in
 * `progression.json`), so a new row is "starter pool only" by definition.
 */
export const progress = pgTable("progress", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  supplies: integer("supplies").notNull().default(0),
  lifetimeSupplies: integer("lifetime_supplies").notNull().default(0),
  unlocks: jsonb("unlocks").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  training: jsonb("training").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  districts: jsonb("districts").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Story 7.9: the survivor look code (`lookCode.ts`, ≤ 96 chars); null = the default look. Written by 7.10's editor. */
  look: text("look"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Brief 18: a balance can never go below 0, whatever a later story's bank or purchase code does.
  check("progress_supplies_nonneg", sql`${t.supplies} >= 0 AND ${t.lifetimeSupplies} >= 0`),
]);

export type AccountRow = typeof accounts.$inferSelect;
export type ProgressRow = typeof progress.$inferSelect;
