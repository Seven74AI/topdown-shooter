import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Story 7.1 AC 8 / brief 21: the database only through the repositories in `src/db/`. */
const SRC = fileURLToPath(new URL("..", import.meta.url));
const DB_DIR = fileURLToPath(new URL(".", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

describe("database imports (Story 7.1 AC 8)", () => {
  it("no file outside src/db imports drizzle-orm, pg, PGlite or db/schema", () => {
    const bad = files(SRC)
      .filter((f) => !f.startsWith(DB_DIR))
      .filter((f) => /from\s+["'](drizzle-orm[^"']*|pg|@electric-sql\/pglite|[^"']*db\/schema)["']|import\(\s*["'](drizzle-orm|pg|@electric-sql)/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
    // Liveness: the scan really sees the repositories that do import Drizzle.
    expect(files(DB_DIR).some((f) => readFileSync(f, "utf8").includes('from "drizzle-orm"'))).toBe(true);
  });
});
