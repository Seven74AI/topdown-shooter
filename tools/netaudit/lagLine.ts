/**
 * Story 8.8 (AC 2, T7): the lossy TCP line, shared by `npm run bots -- --lag/--jitter/--loss/--stall`
 * (`tools/bots/run.ts`, in-process) and the audit's CLI proxy (`lagProxy.ts`, which adds its
 * WebSocket report on top). NOT game code: nothing in apps/ or packages/ imports it.
 *
 * Every chunk, in each direction, is delayed by half the round trip ± half the jitter (uniform),
 * WITHOUT reordering (a chunk never overtakes an earlier one, like real TCP). With probability
 * `lossPct` / 100 per chunk, in EACH direction, that chunk waits an extra `stallMs` (a lost
 * segment waiting for its retransmit): the ordered queue makes everything behind it wait too
 * (head-of-line), then it all arrives in one burst. Never a reorder, never a lost byte — the
 * same model as the dev throttle (`apps/client/src/net/devThrottle.ts`) and the hits harness
 * (`tools/netsim/hitsSim.ts › Options.loss`; network pass brief line 14). No stream parsing here.
 *
 * Closing (review R2): a side that ends (FIN) is ended on the other side only after every byte it
 * sent before has been delivered, in order, with the same delay — so a server's last frames and its
 * WebSocket close frame (close code, e.g. 4000 "left") reach the client like on a real line. Sockets
 * are destroyed at once only on an error (a reset is a reset) or by `LagLine.close()`.
 */
import { connect, createServer, type Server, type Socket } from "node:net";

export interface LagLineOptions {
  /** Port to listen on (0 = an ephemeral port; read it from `LagLine.port`). */
  listen: number;
  /** Interface to listen on (default 127.0.0.1: the line is a local test tool). */
  listenHost?: string;
  /** Where the line leads (default host 127.0.0.1). */
  targetHost?: string;
  target: number;
  /** Simulated round trip (ms): each direction gets half. */
  rttMs: number;
  /** Spread of each one-way delay (ms): ± half of it, uniform. */
  jitterMs: number;
  /** Chance per chunk and direction of a head-of-line stall, in % (0 = clean line). */
  lossPct?: number;
  /** The extra wait of a stalled chunk (ms; default 200, decision 8.8 D2). */
  stallMs?: number;
  /** Tests inject it (default Math.random). */
  random?: () => number;
  /**
   * Per-connection hooks (the audit proxy's report): `onDown` sees each server→client chunk when it
   * is delivered; `canStall(dir)` may forbid stalls (lagProxy: only after the WebSocket upgrade).
   */
  onConnection?: (c: LagConnection) => LagConnectionHooks | void;
}

export interface LagConnection {
  readonly id: number;
  readonly client: Socket;
  readonly upstream: Socket;
}

export interface LagConnectionHooks {
  onDown?: (buf: Buffer) => void;
  onUp?: (buf: Buffer) => void;
  canStall?: (dir: "up" | "down") => boolean;
  onStall?: (dir: "up" | "down") => void;
}

export interface LagLineStats {
  connections: number;
  /** Stalls injected client→server and server→client (liveness: the line really stalled). */
  stallsUp: number;
  stallsDown: number;
  chunksUp: number;
  chunksDown: number;
  bytesUp: number;
  bytesDown: number;
}

export interface LagLine {
  readonly port: number;
  stats(): LagLineStats;
  /** Stops listening, drops every connection; resolves once the port is free. */
  close(): Promise<void>;
}

/** Decision 8.8 D2: one lost packet costs a 200 ms stall (about one 4G retransmit). */
export const LAG_LINE_DEFAULT_STALL_MS = 200;

/** Delivers chunks in order, each no earlier than its own delayed time; `buf: null` = end (FIN). */
class OrderedDelay {
  private lastAt = 0;
  private ended = false;
  private readonly queue: { at: number; buf: Buffer | null }[] = [];
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly dest: Socket,
    private readonly onDeliver: (buf: Buffer) => void,
  ) {}
  push(buf: Buffer, delayMs: number): void {
    if (this.ended) return;
    this.enqueue(buf, delayMs);
  }
  /** Review R2: end the destination after everything queued before it (once). */
  pushEnd(delayMs: number): void {
    if (this.ended) return;
    this.ended = true;
    this.enqueue(null, delayMs);
  }
  private enqueue(buf: Buffer | null, delayMs: number): void {
    const at = Math.max(this.lastAt, performance.now() + delayMs);
    this.lastAt = at;
    this.queue.push({ at, buf });
    this.schedule();
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue.length = 0;
  }
  private schedule(): void {
    if (this.timer || this.queue.length === 0) return;
    const head = this.queue[0] as { at: number };
    this.timer = setTimeout(
      () => {
        this.timer = null;
        const now = performance.now();
        while (this.queue.length > 0 && (this.queue[0] as { at: number }).at <= now + 0.5) {
          const item = this.queue.shift() as { at: number; buf: Buffer | null };
          if (item.buf === null) {
            if (!this.dest.destroyed) this.dest.end();
            continue;
          }
          if (!this.dest.destroyed) this.dest.write(item.buf);
          this.onDeliver(item.buf);
        }
        this.schedule();
      },
      Math.max(0, head.at - performance.now()),
    );
  }
}

export function startLagLine(o: LagLineOptions): Promise<LagLine> {
  const rand = o.random ?? Math.random;
  const lossPct = Math.max(0, o.lossPct ?? 0);
  const stallMs = Math.max(0, o.stallMs ?? LAG_LINE_DEFAULT_STALL_MS);
  const oneWay = (): number => Math.max(0, o.rttMs) / 2 + (rand() - 0.5) * Math.max(0, o.jitterMs);
  const stats: LagLineStats = { connections: 0, stallsUp: 0, stallsDown: 0, chunksUp: 0, chunksDown: 0, bytesUp: 0, bytesDown: 0 };
  const sockets = new Set<Socket>();
  const delays = new Set<OrderedDelay>();
  let nextId = 1;

  // allowHalfOpen: a FIN from one side must not end our other half at once (review R2).
  const server: Server = createServer({ allowHalfOpen: true }, (client) => {
    client.setNoDelay(true);
    const upstream = connect({ host: o.targetHost ?? "127.0.0.1", port: o.target, allowHalfOpen: true });
    upstream.setNoDelay(true);
    sockets.add(client);
    sockets.add(upstream);
    stats.connections++;
    const hooks = o.onConnection?.({ id: nextId++, client, upstream }) ?? {};
    const stalled = (dir: "up" | "down"): boolean => {
      if (lossPct <= 0 || (hooks.canStall && !hooks.canStall(dir))) return false;
      if (rand() * 100 >= lossPct) return false;
      if (dir === "up") stats.stallsUp++;
      else stats.stallsDown++;
      hooks.onStall?.(dir);
      return true;
    };
    const down = new OrderedDelay(client, (buf) => hooks.onDown?.(buf));
    const up = new OrderedDelay(upstream, (buf) => hooks.onUp?.(buf));
    delays.add(down);
    delays.add(up);
    client.on("data", (buf: Buffer) => {
      stats.chunksUp++;
      stats.bytesUp += buf.length;
      up.push(buf, oneWay() + (stalled("up") ? stallMs : 0));
    });
    upstream.on("data", (buf: Buffer) => {
      stats.chunksDown++;
      stats.bytesDown += buf.length;
      down.push(buf, oneWay() + (stalled("down") ? stallMs : 0));
    });
    // Review R2: a FIN travels like data (after everything sent before it); a close without one
    // (the socket is gone) ends the other side the same way; an error resets both at once.
    client.on("end", () => up.pushEnd(oneWay()));
    upstream.on("end", () => down.pushEnd(oneWay()));
    const destroyBoth = (): void => {
      client.destroy();
      upstream.destroy();
      down.stop();
      up.stop();
    };
    const forget = (): void => {
      if (!client.destroyed || !upstream.destroyed) return;
      sockets.delete(client);
      sockets.delete(upstream);
      delays.delete(down);
      delays.delete(up);
    };
    client.on("close", () => {
      up.pushEnd(oneWay());
      forget();
    });
    upstream.on("close", () => {
      down.pushEnd(oneWay());
      forget();
    });
    client.on("error", destroyBoth);
    upstream.on("error", destroyBoth);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.listen, o.listenHost ?? "127.0.0.1", () => {
      server.off("error", reject);
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : o.listen;
      resolve({
        port,
        stats: () => ({ ...stats }),
        close: () =>
          new Promise<void>((done) => {
            for (const d of delays) d.stop();
            for (const s of sockets) s.destroy();
            sockets.clear();
            server.close(() => done());
          }),
      });
    });
  });
}
