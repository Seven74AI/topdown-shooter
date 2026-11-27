import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { reportDeviceSchema, reportPayloadSchema } from "@topdown/shared";

/**
 * Story 10.6 (AC 1, B6, B7): the report log carries no names, usernames, tokens, cookies or IPs, and it is never written
 * from per-frame code. Scans every `clientLog.note(kind, { … })` call site in the client.
 */
const SRC = join(__dirname, "..", "..", "apps", "client", "src");
const DENY = /^(name|names|username|user|displayName|token|guestToken|deviceToken|ticket|cookie|ip|address|password|email|note)$/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") ? [p] : [];
  });
}

/** Every note call: its kind and its field names (`{ a: …, b }` → a, b). */
function noteCalls(): { file: string; kind: string; fields: string[] }[] {
  const out: { file: string; kind: string; fields: string[] }[] = [];
  for (const f of files(SRC)) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/clientLog\.note\(\s*"([^"]+)"\s*(?:,\s*\{([^}]*)\})?\s*\)/g)) {
      const fields = (m[2] ?? "")
        .split(",")
        .map((p) => p.trim().split(":")[0]!.trim())
        .filter((k) => k.length > 0);
      out.push({ file: relative(SRC, f), kind: m[1]!, fields });
    }
  }
  return out;
}

describe("Story 10.6 (B7): report log privacy", () => {
  it("every clientLog.note call names only ids, codes and numbers (no name / token / cookie / ip fields)", () => {
    const calls = noteCalls();
    // Liveness: the seams B6 lists are really there.
    const kinds = new Set(calls.map((c) => c.kind));
    for (const k of ["boot", "room.join", "room.leave", "phase", "run.started", "connection.lost", "link", "join.refused", "webgl.lost", "webgl.restored", "texture.rebuild"]) expect(kinds, k).toContain(k);
    const bad = calls.flatMap((c) => c.fields.filter((k) => DENY.test(k)).map((k) => `${c.file}: ${c.kind} ${k}`));
    expect(bad).toEqual([]);
    // every call site is a literal (the scan sees all of them)
    const all = files(SRC).reduce((n, f) => n + (readFileSync(f, "utf8").match(/clientLog\.note\(/g)?.length ?? 0), 0);
    expect(all).toBe(calls.length);
  });

  it("the report payload's schema has no field for a name, token, cookie or IP", () => {
    const keys = [...Object.keys(reportPayloadSchema.shape), ...Object.keys(reportDeviceSchema.shape)];
    expect(keys.filter((k) => DENY.test(k) || /token|cookie|name|ip$/i.test(k))).toEqual([]);
  });

  it("AC 1: clientLog is not imported by render/ or sim/ code, except the WebGL loss / texture rebuild events", () => {
    const allowed = new Set(["render/gfx/textureRegistry.ts", "render/gfx/graphicsGuard.ts"]);
    const importers = files(SRC)
      .filter((f) => /from\s+"[^"]*debug\/clientLog"/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(importers.length).toBeGreaterThan(3);
    expect(importers.filter((f) => (f.startsWith("render/") || f.startsWith("sim/")) && !allowed.has(f))).toEqual([]);
    // the two allowed ones call it only inside their event handlers (never from update / preUpdate)
    for (const f of allowed) expect(readFileSync(join(SRC, f), "utf8")).not.toMatch(/update\([^)]*\)\s*\{[^}]*clientLog/);
  });
});
