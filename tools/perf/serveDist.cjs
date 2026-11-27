/* global require, process, __dirname, console, module */
/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script */
/*
 * Story 10.4 (B3): serves the client's release build (apps/client/dist) the way deploy/Caddyfile does, for load measures:
 *   - /assets/<file that exists>: Cache-Control "public, max-age=31536000, immutable"
 *   - /assets/<missing>: 404, no cache header (never index.html)
 *   - everything else: Cache-Control "no-cache"; a missing path serves index.html (share links /j/<code>)
 *   - gzip when the browser accepts it (Caddy: encode zstd gzip), ETag + 304 for revalidation
 * `vite preview` sends none of these headers. tools/checks/caddyCacheHeaders.test.ts checks the Caddyfile still has both rules.
 *
 * Usage: node tools/perf/serveDist.cjs [--port 4610] [--dir apps/client/dist]
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".webmanifest"]);

/** The Caddyfile's routing, as data: which file answers `urlPath`, with which status and cache header. */
function route(dir, urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const file = path.join(dir, path.normalize(clean).replace(/^([/\\])+/, ""));
  if (!file.startsWith(dir)) return { status: 404 };
  const exists = fs.existsSync(file) && fs.statSync(file).isFile();
  if (clean.startsWith("/assets/")) return exists ? { status: 200, file, cache: IMMUTABLE } : { status: 404 };
  return { status: 200, file: exists ? file : path.join(dir, "index.html"), cache: NO_CACHE };
}

function createServer(dir) {
  const cache = new Map(); // file → { raw, gz, etag }
  const body = (file) => {
    let b = cache.get(file);
    if (!b) {
      const raw = fs.readFileSync(file);
      const gz = COMPRESSIBLE.has(path.extname(file)) ? zlib.gzipSync(raw, { level: 6 }) : null;
      b = { raw, gz, etag: `"${crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16)}"` };
      cache.set(file, b);
    }
    return b;
  };
  return http.createServer((req, res) => {
    const r = route(dir, req.url || "/");
    if (r.status !== 200) {
      res.writeHead(r.status, { "Content-Type": "text/plain" });
      return res.end(`${r.status}`);
    }
    const b = body(r.file);
    const headers = { "Content-Type": TYPES[path.extname(r.file)] || "application/octet-stream", "Cache-Control": r.cache, ETag: b.etag, Vary: "Accept-Encoding" };
    if (req.headers["if-none-match"] === b.etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const gzip = b.gz && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    if (gzip) headers["Content-Encoding"] = "gzip";
    const out = gzip ? b.gz : b.raw;
    headers["Content-Length"] = out.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : out);
  });
}

module.exports = { createServer, route, IMMUTABLE, NO_CACHE };

if (require.main === module) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const dir = path.resolve(arg("--dir", path.join(__dirname, "../../apps/client/dist")));
  const port = Number(arg("--port", "4610"));
  createServer(dir).listen(port, "127.0.0.1", () => console.log(`serving ${dir} on http://127.0.0.1:${port} (pid ${process.pid})`));
}
