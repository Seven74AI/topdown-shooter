/**
 * Story 7.1: the database tables (Drizzle, PostgreSQL 18 in production, PGlite in dev/tests). Only the repositories in
 * this folder import it (`noDbImports.test.ts`). Migrations are generated from this file with `npm run db:generate`
 * and committed under `apps/server/drizzle/`; never edit a committed migration, add a new one.
 */
import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One row per player. A guest account has no `username`; Story 7.6 fills `username` (as typed), `username_lower` (the
 * unique, case-blind key), `password_hash` and `recovery_code_hash` (both argon2id; never the clear text). The devices
 * that are this account live in `device_tokens` (7.6 copied `guest_token_hash` there: one account, several phones).
 * `merged_into`: a guest whose progress was merged into this account at a login (D11; the guest is retired, its
 * `run_rewards` rows stay as history and a late bank of it pays the account). No email, no IP (privacy, brief 28).
 */
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").unique(),
  usernameLower: text("username_lower").unique(),
  passwordHash: text("password_hash"),
  recoveryCodeHash: text("recovery_code_hash"),
  /**
   * UNUSED since Story 7.6 (devices live in `device_tokens`; review ops item): kept nullable for one release so a
   * rollback to a 7.1–7.3 build still finds the guests it made; dropped by a later migration. Nothing writes it.
   */
  guestTokenHash: text("guest_token_hash").unique(),
  displayName: text("display_name").notNull().default(""),
  mergedInto: uuid("merged_into").references((): AnyPgColumn => accounts.id),
  /** Story 7.6 (AC 10, D9): the one-time Results "Save my progress" line was sent. */
  saveNudged: boolean("save_nudged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Story 7.6 (AC 1): one row per device: the SHA-256 hex of its 128-bit guest token (never the token) → the account it
 * plays as. A login re-points the device (with a fresh token: decision 7.6 B1); a logout deletes the row and makes a
 * new guest. 7.1's lookups read this table.
 */
export const deviceTokens = pgTable("device_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("device_tokens_account_idx").on(t.accountId)]);

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

/**
 * Story 7.2 (AC 4, decision 7.2 D3): one row per player per run, written in the SAME transaction as the Supplies it
 * records. The primary key (run_id, account_id) is the "already banked" guard (brief 18): a retry, a reconnect or a
 * second `endRun` inserts nothing and pays nothing. `breakdown` is the `runSupplies` result (lines, rookie, ending) so
 * a failed bank can be granted by hand and later stories (7.7, 7.11, 7.12) can add their own keys.
 */
export const runRewards = pgTable("run_rewards", {
  runId: uuid("run_id").notNull(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  supplies: integer("supplies").notNull(),
  breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ name: "run_rewards_pk", columns: [t.runId, t.accountId] }),
  check("run_rewards_supplies_nonneg", sql`${t.supplies} >= 0`),
]);

export type AccountRow = typeof accounts.$inferSelect;
export type ProgressRow = typeof progress.$inferSelect;
export type DeviceTokenRow = typeof deviceTokens.$inferSelect;
