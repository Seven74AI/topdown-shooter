import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Story 1.11 (architecture boundary 7): dev cheats are compiled out of the release build. Scans the
 * built client (`apps/client/dist`) for strings that only the cheat UI and dev hooks contain.
 *
 * Plain `npm test` (and the CI test shards) skip it. `npm run release:check` (in `npm run gate`, and the CI
 * `release` job) runs it right after `npm run build` with REQUIRE_DIST=1, where a missing dist fails instead
 * of skipping.
 *
 * Story 10.11 (AC 8): the cheat panel ships in ONE lazy chunk that only admins download, `assets/admin-tools-<hash>.js`
 * (+ its `.css`), named by `apps/client/vite.config.ts`. That chunk is the only exemption: every other built file is
 * still scanned; the chunk must exist and hold the panel (liveness), and the entry chunk and `index.html` must not even
 * name the panel's source module (`DevCheats`).
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
  "Spawn Behemoth", // Story 6.5
];

/** Story 10.11: the admin-only panel chunk (JS and CSS), by its fixed name. */
export const ADMIN_CHUNK = /(^|[\\/])assets[\\/]admin-tools-[\w-]+\.(js|css)$/;

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

  it("contains none of the cheat UI strings outside the admin-tools chunk", () => {
    const files = builtFiles(DIST);
    expect(files.some((f) => f.endsWith(".js"))).toBe(true);
    const found: string[] = [];
    for (const f of files.filter((x) => !ADMIN_CHUNK.test(x))) {
      const text = readFileSync(f, "utf8");
      for (const s of CHEAT_STRINGS) if (text.includes(s)) found.push(`${s} in ${f}`);
    }
    expect(found).toEqual([]);
  });

  it("Story 10.11: the admin-tools chunk exists (one JS, at most one CSS) and really holds the panel", () => {
    const admin = builtFiles(DIST).filter((f) => ADMIN_CHUNK.test(f));
    const js = admin.filter((f) => f.endsWith(".js"));
    expect(js, "assets/admin-tools-*.js is missing").toHaveLength(1);
    expect(admin.filter((f) => f.endsWith(".css")).length).toBeLessThanOrEqual(1);
    const text = readFileSync(js[0] as string, "utf8");
    expect(text).toContain("Spawn zombies");
    expect(text).toContain("Practice only");
    expect(text).not.toContain("__game"); // the dev-only window hooks never ship, even for admins
    expect(text).not.toContain("__gfx");
  });

  it("Story 10.11: index.html and the entry chunk name no cheat string and not the DevCheats module", () => {
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    const entry = /<script[^>]+src="[^"]*\/(assets\/main-[\w-]+\.js)"/.exec(html)?.[1];
    expect(entry, "no entry chunk in index.html").toBeDefined();
    for (const [name, text] of [["index.html", html], [entry as string, readFileSync(join(DIST, entry as string), "utf8")]] as const) {
      for (const s of CHEAT_STRINGS) expect(text.includes(s), `${s} in ${name}`).toBe(false);
    }
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
