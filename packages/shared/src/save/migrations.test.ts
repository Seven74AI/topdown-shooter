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
/** The shape hash of every save version (append one per bump; never change an old one). */
const SHAPES: Record<number, string> = { 1: "ce5075fe", 2: "36cd5e58" }; // v2: Story 10.7 PlayerState.weaponsBought

/** Every key path of a JSON value (array items as `[]`) with the value types seen there, sorted: the save's shape. */
function shape(v: unknown, path = "", out = new Map<string, Set<string>>()): Map<string, Set<string>> {
  const add = (p: string, t: string) => (out.get(p) ?? out.set(p, new Set()).get(p))!.add(t);
  if (Array.isArray(v)) {
    add(path, "array");
    for (const x of v) shape(x, `${path}[]`, out);
  } else if (v !== null && typeof v === "object") {
    add(path, "object");
    for (const k of Object.keys(v)) shape((v as Record<string, unknown>)[k], `${path}.${k}`, out);
  } else add(path, v === null ? "null" : typeof v);
  return out;
}
const shapeList = (v: unknown): string[] => [...shape(v).entries()].map(([p, t]) => `${p}:${[...t].sort().join("|")}`).sort();
/** A stable fingerprint of a shape (FNV-1a of the joined list). */
function shapeHash(list: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const c of list.join("\n")) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
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

  it("review L: the saved shape (key paths AND value types) is the one recorded for SAVE_SCHEMA_VERSION — a change needs a version bump, a migration step and a new SHAPES entry", () => {
    const { world, seats } = playToBuild({ players: 2, waves: 2, buildings: 6 });
    const now = JSON.parse(JSON.stringify(captureRunSave(world, seats, { runId: "x", district: "downtown", lootFinderSeat: "p0#1" })));
    for (let v = 1; v <= SAVE_SCHEMA_VERSION; v++) expect(SHAPES[v], `SHAPES[${v}] (the shape hash of version ${v})`).toMatch(/^[0-9a-f]{8}$/);
    expect(shapeHash(shapeList(now)), "the save's shape changed: bump SAVE_SCHEMA_VERSION, add its migration step and record the new hash in SHAPES").toBe(SHAPES[SAVE_SCHEMA_VERSION]);
  });

  it("the committed fixture has the current version's shape (re-record it with the shape)", () => {
    expect(shapeHash(shapeList(v1))).toBe(SHAPES[1]);
  });

  it("Story 10.7: a version-1 seat restores with an empty weaponsBought", () => {
    const m = migrateRunSave(v1);
    expect(m.ok && m.save.schemaVersion).toBe(2);
    if (!m.ok) return;
    expect((m.save.seats[0]?.player as Record<string, unknown>).weaponsBought).toBeUndefined();
    const r = restoreRunSave(m.save, { balance: loadBalance(), map: DOWNTOWN_MAP });
    for (const x of [...r.present, ...r.away]) expect(x.player.weaponsBought).toEqual([]);
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
