import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 10.7 AC 3 (B7): practice runs are never recorded in the run stats. Only the server's run room writes a
 * `run_results` row, and a practice run is the client-only `LocalSimHost`: nothing it loads (its value imports, followed
 * through the client's own files) can reach the server — no Colyseus client, no `fetch`, no client net module.
 */
const CLIENT = join(__dirname, "..", "..", "apps", "client", "src");
const ENTRY = join(CLIENT, "sim", "LocalSimHost.ts");

/** Value imports only (`import type` and `import { type … }`-only lines are erased at build). */
function valueImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/gms)) {
    const names = m[1] as string;
    const braces = /^\{([^}]*)\}$/.exec(names.trim());
    if (braces && (braces[1] as string).split(",").every((n) => n.trim() === "" || n.trim().startsWith("type "))) continue;
    out.push(m[2] as string);
  }
  for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1] as string);
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const p of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (/\.tsx?$/.test(p) && existsSync(p)) return p;
  return null;
}

describe("Story 10.7 AC 3: a practice run makes no request that could record it", () => {
  it("LocalSimHost's client files load no Colyseus client, no fetch and no net/ module", () => {
    const seen = new Set<string>();
    const packages = new Set<string>();
    const todo = [ENTRY];
    while (todo.length > 0) {
      const f = todo.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      const src = readFileSync(f, "utf8");
      for (const spec of valueImports(src)) {
        const local = resolveLocal(f, spec);
        if (local) todo.push(local);
        else if (!spec.startsWith(".")) packages.add(spec);
      }
    }
    const files = [...seen].map((f) => relative(CLIENT, f));
    expect(files).toEqual(expect.arrayContaining(["sim/LocalSimHost.ts", "sim/SimHost.ts"])); // liveness: the walk really followed imports
    expect(packages.has("@topdown/shared")).toBe(true);
    expect(files.filter((f) => f.split(/[\\/]/)[0] === "net")).toEqual([]);
    expect([...packages].filter((p) => p.startsWith("@colyseus"))).toEqual([]);
    expect([...seen].filter((f) => /\bfetch\(|new WebSocket\(/.test(readFileSync(f, "utf8"))).map((f) => relative(CLIENT, f))).toEqual([]);
  });
});
