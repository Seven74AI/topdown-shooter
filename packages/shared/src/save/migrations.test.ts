/**
 * Story 8.4 (D14, S6 "Updates never kill a save"): saves migrate step by step; a save newer than the code or of a
 * foreign shape is refused cleanly; the committed version-1 save keeps resuming; and the saved SHAPE can't change
 * without a `SAVE_SCHEMA_VERSION` bump plus its migration step.
 */
import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { DOWNTOWN_MAP } from "../map/downtown";
import { SAVE_MIGRATIONS, migrateRunSave } from "./migrations";
import { SAVE_SCHEMA_VERSION, captureRunSave } from "./runSave";
import { restoreRunSave } from "./restore";
import { playToBuild } from "./saveFixtures";

import v1json from "./fixtures/runSave.v1.json";

const v1 = v1json as unknown as Record<string, unknown>;

/** Every key path of a JSON value (array items as `[]`), sorted: the save's shape. */
function shape(v: unknown, path = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) {
    for (const x of v) shape(x, `${path}[]`, out);
    if (v.length === 0) out.add(`${path}[]`);
  } else if (v !== null && typeof v === "object") {
    for (const k of Object.keys(v)) shape((v as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else out.add(`${path}:${v === null ? "null" : typeof v}`);
  return out;
}

describe("Story 8.4 S6: save migrations", () => {
  it("every version below the current one has its step (a version bump without a migration fails here)", () => {
    for (let v = 1; v < SAVE_SCHEMA_VERSION; v++) expect(SAVE_MIGRATIONS[v], `migration ${v} → ${v + 1}`).toBeTypeOf("function");
  });

  it("the committed version-1 save migrates and restores on today's code", () => {
    const m = migrateRunSave(v1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.from).toBe(1);
    const r = restoreRunSave(m.save, { balance: loadBalance(), map: DOWNTOWN_MAP });
    expect(r.present.length + r.away.length).toBe(2);
    expect(r.world.waves.number).toBe(2);
  });

  it("the saved shape is the version-1 shape (changing it needs SAVE_SCHEMA_VERSION + 1 and a step in SAVE_MIGRATIONS)", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 2, buildings: 6 });
    const now = JSON.parse(JSON.stringify(captureRunSave(world, seats, { runId: "x", district: "downtown" })));
    const typeless = (s: Set<string>) => [...s].map((p) => p.replace(/:(number|string|boolean|null)$/, "")).filter((p, i, a) => a.indexOf(p) === i).sort();
    if (SAVE_SCHEMA_VERSION === 1) expect(typeless(shape(now))).toEqual(typeless(shape(v1)));
  });

  it("steps run in order, each stamped with its new version", () => {
    const seen: number[] = [];
    const steps = { 1: (s: Record<string, unknown>) => (seen.push(1), { ...s, a: 1 }), 2: (s: Record<string, unknown>) => (seen.push(2), { ...s, b: (s.a as number) + 1 }) };
    const r = migrateRunSave({ ...v1, schemaVersion: 1 }, steps, 3);
    expect(seen).toEqual([1, 2]);
    expect(r.ok && r.save.schemaVersion).toBe(3);
    expect(r.ok && (r.save as unknown as { b: number }).b).toBe(2);
  });

  it("refuses a newer save, a missing step, a throwing step and foreign data — never throws", () => {
    expect(migrateRunSave({ ...v1, schemaVersion: SAVE_SCHEMA_VERSION + 1 })).toEqual({ ok: false, reason: "newer", version: SAVE_SCHEMA_VERSION + 1 });
    expect(migrateRunSave({ ...v1, schemaVersion: 1 }, {}, 2)).toEqual({ ok: false, reason: "no_migration", version: 1 });
    expect(migrateRunSave({ ...v1, schemaVersion: 1 }, { 1: () => { throw new Error("x"); } }, 2)).toEqual({ ok: false, reason: "broken", version: 1 });
    for (const bad of [null, 3, "save", [], {}, { schemaVersion: "1" }, { schemaVersion: 0 }, { schemaVersion: 1, runId: 3 }, { ...v1, phase: "wave" }]) expect(migrateRunSave(bad).ok).toBe(false);
  });
});
