/**
 * Story 8.4 (D14, S6 "Updates never kill a save"): step-by-step save migrations. `SAVE_MIGRATIONS[v]` turns a version-v
 * save into a version-(v + 1) save; `migrateRunSave` applies them in order up to `SAVE_SCHEMA_VERSION`. A save NEWER
 * than the code (a rollback) or of a foreign shape is refused (never thrown into a room). A test fails when
 * `SAVE_SCHEMA_VERSION` grows without its step, or when the saved shape changes without a version bump.
 */
import { SAVE_SCHEMA_VERSION, type RunSave } from "./runSave";

export type SaveMigration = (save: Record<string, unknown>) => Record<string, unknown>;

/** v → v + 1. */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  // Story 10.7: version 2 adds `PlayerState.weaponsBought` (the run stats' loadout). Nothing to rewrite here: the
  // restore gives a seat without it an empty list AFTER its digest check (the v1 digest was taken without the field).
  1: (s) => s,
};

export type MigrateResult = { ok: true; save: RunSave; from: number } | { ok: false; reason: "not_a_save" | "newer" | "no_migration" | "broken"; version: number | null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A stored save (parsed JSON) → the current format, or why not. Never throws. */
export function migrateRunSave(raw: unknown, migrations: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS, current = SAVE_SCHEMA_VERSION): MigrateResult {
  if (!isObj(raw) || !Number.isInteger(raw.schemaVersion)) return { ok: false, reason: "not_a_save", version: null };
  const from = raw.schemaVersion as number;
  if (from < 1) return { ok: false, reason: "not_a_save", version: from };
  if (from > current) return { ok: false, reason: "newer", version: from };
  let s: Record<string, unknown> = raw;
  try {
    for (let v = from; v < current; v++) {
      const step = migrations[v];
      if (!step) return { ok: false, reason: "no_migration", version: v };
      s = { ...step(s), schemaVersion: v + 1 };
    }
  } catch {
    return { ok: false, reason: "broken", version: from };
  }
  if (typeof s.runId !== "string" || typeof s.seed !== "number" || !isObj(s.world) || !Array.isArray(s.seats) || (s.phase !== "build" && s.phase !== "vote")) {
    return { ok: false, reason: "not_a_save", version: from };
  }
  return { ok: true, save: s as unknown as RunSave, from };
}
