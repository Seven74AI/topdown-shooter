import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Story 10.4 (B3, AC 4): the two cache rules a phone's return visit depends on, in `deploy/Caddyfile`, and the same rules
 * in `tools/perf/serveDist.cjs` (the server the load measures use), so the two can't drift silently:
 *   1. `/assets/*` (Vite's hashed files): `public, max-age=31536000, immutable`, only on files that exist, no index.html fallback;
 *   2. everything else (index.html, /j/<code>): `no-cache`.
 * Only these two rules are checked: other lines (10.5's short-cache ones) may come and go.
 */
const require = createRequire(import.meta.url);
const serveDist = require("../perf/serveDist.cjs") as {
  createServer(dir: string): Server;
  IMMUTABLE: string;
  NO_CACHE: string;
  SHORT: string;
};
const CADDYFILE = readFileSync(join(process.cwd(), "deploy/Caddyfile"), "utf8");

/** The body of the first `handle <matcher> {` block (brace-matched), or null. */
export function handleBlock(caddyfile: string, matcher: string): string | null {
  const lines = caddyfile.split("\n");
  const head = matcher ? `handle ${matcher} {` : "handle {";
  const start = lines.findIndex((l) => l.trim() === head);
  if (start < 0) return null;
  let depth = 0;
  const body: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const code = (lines[i] ?? "").replace(/#.*$/, "");
    depth += (code.match(/\{/g) ?? []).length - (code.match(/\}/g) ?? []).length;
    if (i > start) body.push(code);
    if (depth === 0) return body.join("\n");
  }
  return null;
}

describe("Story 10.4 B3: deploy/Caddyfile cache rules", () => {
  const assets = handleBlock(CADDYFILE, "/assets/*");
  const rest = handleBlock(CADDYFILE, "");

  it("hashed /assets/* files are immutable for a year, only when they exist, with no index.html fallback", () => {
    expect(assets).not.toBeNull();
    expect(assets).toMatch(/@exists\s+file/);
    expect(assets).toContain(`header @exists Cache-Control "${serveDist.IMMUTABLE}"`);
    expect(assets).toMatch(/\bfile_server\b/);
    expect(assets).not.toMatch(/\btry_files\b/);
  });

  it("everything else is revalidated (no-cache) and falls back to index.html", () => {
    expect(rest).not.toBeNull();
    expect(rest).toContain(`header Cache-Control "${serveDist.NO_CACHE}"`);
    expect(rest).toMatch(/try_files\s+\{path\}\s+\/index\.html/);
  });

  it("Story 10.5 (AC 1): the manifest and icons get the short cache (1 h) and the manifest MIME type, only when they exist, no index.html fallback", () => {
    expect(CADDYFILE).toMatch(/\n\s*@install path \/manifest\.webmanifest \/icons\/\*\n/);
    const install = handleBlock(CADDYFILE, "@install");
    expect(install).not.toBeNull();
    expect(install).toMatch(/@exists\s+file/);
    expect(install).toContain(`header @exists Cache-Control "${serveDist.SHORT}"`);
    expect(install).toContain('header /manifest.webmanifest Content-Type "application/manifest+json"');
    expect(install).not.toMatch(/immutable|try_files/);
    expect(serveDist.SHORT).toBe("public, max-age=3600");
    // Caddy puts a matcher-less `handle` last; written before it here too, for the reader.
    expect(CADDYFILE.indexOf("handle @install {")).toBeLessThan(CADDYFILE.indexOf("\thandle {"));
  });

  it("the check bites on a doctored Caddyfile", () => {
    const doctored = CADDYFILE.replace("max-age=31536000, immutable", "max-age=60");
    expect(handleBlock(doctored, "/assets/*")).not.toContain(`Cache-Control "${serveDist.IMMUTABLE}"`);
    expect(handleBlock("handle /x {\n}\n", "/assets/*")).toBeNull();
  });
});

describe("Story 10.4 B3: tools/perf/serveDist.cjs serves like Caddy", () => {
  let dir = "";
  let server: Server;
  let base = "";
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "servedist-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>t</title>");
    writeFileSync(join(dir, "assets/main-abc123.js"), "console.log(1);".repeat(50));
    mkdirSync(join(dir, "icons"));
    writeFileSync(join(dir, "manifest.webmanifest"), '{"name":"t"}');
    writeFileSync(join(dir, "icons/icon-192.png"), "png");
    server = serveDist.createServer(dir);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("an existing asset: immutable, gzip, 304 on revalidation", async () => {
    const r = await fetch(`${base}/assets/main-abc123.js`, { headers: { "accept-encoding": "gzip" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe(serveDist.IMMUTABLE);
    expect(r.headers.get("content-encoding")).toBe("gzip");
    expect(await r.text()).toContain("console.log(1);");
    const again = await fetch(`${base}/assets/main-abc123.js`, { headers: { "if-none-match": r.headers.get("etag") ?? "" } });
    expect(again.status).toBe(304);
  });

  it("Story 10.5: the manifest and an icon: the short cache and their types; a missing icon is a 404", async () => {
    const m = await fetch(`${base}/manifest.webmanifest`);
    expect(m.status).toBe(200);
    expect(m.headers.get("cache-control")).toBe(serveDist.SHORT);
    expect(m.headers.get("content-type")).toBe("application/manifest+json");
    const i = await fetch(`${base}/icons/icon-192.png`);
    expect(i.status).toBe(200);
    expect(i.headers.get("cache-control")).toBe(serveDist.SHORT);
    expect(i.headers.get("content-type")).toBe("image/png");
    const miss = await fetch(`${base}/icons/nope.png`);
    expect(miss.status).toBe(404);
    expect(miss.headers.get("cache-control")).toBeNull();
  });

  it("a missing asset is a 404 with no cache header; index.html and share links are no-cache", async () => {
    const miss = await fetch(`${base}/assets/nope.js`);
    expect(miss.status).toBe(404);
    expect(miss.headers.get("cache-control")).toBeNull();
    for (const p of ["/", "/j/ABCD"]) {
      const r = await fetch(base + p);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe(serveDist.NO_CACHE);
      expect(await r.text()).toContain("<title>t</title>");
    }
    expect((await fetch(`${base}/../../etc/passwd`)).status).not.toBe(500);
  });
});
