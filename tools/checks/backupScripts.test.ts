import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Story 7.1 review N1, N2: the backup scripts (no Docker here, so their rules are checked in the source). */
const DEPLOY = join(__dirname, "..", "..", "deploy");

describe("backup scripts (Story 7.1)", () => {
  it("N1: local and off-VPS copies keep the same 14 dumps", () => {
    const src = readFileSync(join(DEPLOY, "backup.sh"), "utf8");
    expect(src).toContain('local keep="${KEEP_DAYS:-14}"');
    expect(src).toContain('-mtime "+$((keep - 1))"');
    expect(src).toContain('rclone delete --min-age "$((keep - 1))d"');
  });

  it("N2: restore.sh drops the scratch database on any exit", () => {
    const src = readFileSync(join(DEPLOY, "restore.sh"), "utf8");
    const trap = src.indexOf("trap '");
    expect(trap).toBeGreaterThan(0);
    expect(src.slice(trap, src.indexOf("\n", trap))).toMatch(/DROP DATABASE IF EXISTS \$\{scratch\}.*EXIT$/);
    expect(trap).toBeLessThan(src.indexOf("exec -T postgres pg_restore"));
    // The trap runs after main() returns: what it uses must not be `local`.
    expect(src).not.toMatch(/local (scratch|COMPOSE)=/);
  });
});
