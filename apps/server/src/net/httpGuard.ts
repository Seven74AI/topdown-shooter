import http from "node:http";
import { ACCOUNT_REPORT_PATH, REPORT_MAX_BYTES } from "@topdown/shared";

/** Largest HTTP request body accepted (matchmaking JSON is a few hundred bytes). */
export const MAX_HTTP_BODY_BYTES = 2048;

/**
 * Story 10.6 (B2): the one per-path exception, `POST /account/report` (64 KB: a note and 200 log lines). Matched on the
 * exact path (a query string is ignored); every other path keeps the 2 KB cap.
 */
export function maxBodyBytes(url: string | undefined): number {
  const path = (url ?? "").split("?")[0];
  return path === ACCOUNT_REPORT_PATH ? REPORT_MAX_BYTES : MAX_HTTP_BODY_BYTES;
}

/**
 * Why a request must be refused before any handler reads its body, or null to let it through.
 * Colyseus buffers matchmaking bodies without a limit and parses them before `onAuth` can measure
 * them, so an unauthenticated 50 MB POST would cost memory and CPU (Story 2.1 review).
 */
export function refuseReason(method: string | undefined, contentLength: string | undefined, chunked: boolean, url?: string): 411 | 413 | null {
  const hasBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (!hasBody) return null;
  if (contentLength === undefined) return chunked ? 411 : null; // no length + chunked: unbounded
  const n = Number(contentLength);
  if (!Number.isFinite(n) || n < 0) return 413;
  return n > maxBodyBytes(url) ? 413 : null;
}

/**
 * An HTTP server whose "request" events pass the size guard first. Wraps `emit` so the guard runs
 * before every listener Colyseus attaches later (it adds its own on listen).
 */
export function createGuardedHttpServer(): http.Server {
  const server = http.createServer();
  const emit = server.emit.bind(server) as (event: string | symbol, ...args: unknown[]) => boolean;
  server.emit = ((event: string | symbol, ...args: unknown[]) => {
    // SPIKE-13-1: log every request / upgrade the iOS app makes (Origin, cookie present) for F5 / F6
    if (process.env.SPIKE13 && (event === "request" || event === "upgrade")) {
      const q = args[0] as http.IncomingMessage; // SPIKE-13-1
      console.log(`SPIKE13S ${String(event)} ${q.method} ${q.url} origin=${q.headers.origin ?? "-"} cookie=${q.headers.cookie ? "yes" : "no"} acrm=${q.headers["access-control-request-method"] ?? "-"}`); // SPIKE-13-1
    }
    if (event === "request") {
      const req = args[0] as http.IncomingMessage;
      const res = args[1] as http.ServerResponse;
      const code = refuseReason(req.method, req.headers["content-length"], (req.headers["transfer-encoding"] ?? "").includes("chunked"), req.url);
      if (code !== null) {
        res.writeHead(code, { "content-type": "text/plain", connection: "close" });
        res.end(code === 413 ? "Request too large" : "Length required");
        req.destroy();
        return true;
      }
    }
    return emit(event, ...args);
  }) as typeof server.emit;
  return server;
}
