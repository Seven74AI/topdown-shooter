import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 1.11 (architecture boundary 7): dev cheats are compiled out of the release build. Scans the
 * built client (`apps/client/dist`) for strings that only the cheat UI and dev hooks contain.
 *
 * `npm test` runs before the build, so locally and in the first CI test step this suite skips when
 * there is no dist. CI runs it again after `npm run build` with REQUIRE_DIST=1, where a missing dist
 * fails instead of skipping.
 */
/** `CHEAT_SCAN_DIR` overrides the folder (used once to prove the check fails on a doctored bundle). */
const DIST = process.env.CHEAT_SCAN_DIR ?? join(process.cwd(), "apps/client/dist");
const REQUIRED = process.env.REQUIRE_DIST === "1";
// Only with REQUIRE_DIST=1 (CI, right after a fresh build): a local `npm test` would otherwise scan a
// stale dist from an older build and pass or fail on old code.
const hasDist = REQUIRED && existsSync(DIST);

/** Strings unique to DevCheats.tsx / DevCheats.css, the dev loadout picker and the dev-only window hook. */
export const CHEAT_STRINGS = [
  "DevCheats",
  "Dev cheats",
  "Spawn zombies",
  "God mode",
  "Restart with seed",
  "Leave last 5",
  "dev-gear",
  "Dev loadout",
  "__game",
  "Collision / grid view", // Story 4.3
  "Decay stage (whole map)", // Stories 4.2 + 4.3 solo stage cheat; Story 4.5: the decay engine's path
];

function builtFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...builtFiles(p));
    else if (/\.(js|mjs|css|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

describe.skipIf(!hasDist && !REQUIRED)("release build has no dev cheats", () => {
  it("dist exists", () => {
    expect(hasDist, `${DIST} is missing: run npm run build first`).toBe(true);
  });

  it("contains none of the cheat UI strings", () => {
    const files = builtFiles(DIST);
    expect(files.some((f) => f.endsWith(".js"))).toBe(true);
    const found: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const s of CHEAT_STRINGS) if (text.includes(s)) found.push(`${s} in ${f}`);
    }
    expect(found).toEqual([]);
  });

  it("still contains the release-mode stress tooling (the scan reads the real bundle)", () => {
    const js = builtFiles(DIST)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(js).toContain("Copy results");
    expect(js).toContain("Stress test results");
  });
});
