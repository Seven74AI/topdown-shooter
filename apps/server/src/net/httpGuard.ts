import http from "node:http";

/** Largest HTTP request body accepted (matchmaking JSON is a few hundred bytes). */
export const MAX_HTTP_BODY_BYTES = 2048;

/**
 * Why a request must be refused before any handler reads its body, or null to let it through.
 * Colyseus buffers matchmaking bodies without a limit and parses them before `onAuth` can measure
 * them, so an unauthenticated 50 MB POST would cost memory and CPU (Story 2.1 review).
 */
export function refuseReason(method: string | undefined, contentLength: string | undefined, chunked: boolean): 411 | 413 | null {
  const hasBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (!hasBody) return null;
  if (contentLength === undefined) return chunked ? 411 : null; // no length + chunked: unbounded
  const n = Number(contentLength);
  if (!Number.isFinite(n) || n < 0) return 413;
  return n > MAX_HTTP_BODY_BYTES ? 413 : null;
}

/**
 * An HTTP server whose "request" events pass the size guard first. Wraps `emit` so the guard runs
 * before every listener Colyseus attaches later (it adds its own on listen).
 */
export function createGuardedHttpServer(): http.Server {
  const server = http.createServer();
  const emit = server.emit.bind(server) as (event: string | symbol, ...args: unknown[]) => boolean;
  server.emit = ((event: string | symbol, ...args: unknown[]) => {
    if (event === "request") {
      const req = args[0] as http.IncomingMessage;
      const res = args[1] as http.ServerResponse;
      const code = refuseReason(req.method, req.headers["content-length"], (req.headers["transfer-encoding"] ?? "").includes("chunked"));
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
