/**
 * Story 8.1 (T7, AC 11): a TCP pass-through whose line can be CUT both ways for a while: no byte
 * in either direction, no close, no reset (a tunnel, a dead spot the sockets don't notice). Bytes
 * sent during a cut wait and then flow in order when it ends (TCP retransmits after an outage).
 * New connections during a cut connect but carry nothing until it ends (a takeover join waits too).
 * Additive to Story 8.8's lossy line: `npm run bots -- --cut-bot N --cut-at S --cut-for S` puts one in
 * front of that bot's connection (chained before the lag line when both are on). NOT game code.
 */
import { connect, createServer, type Server, type Socket } from "node:net";

export interface CutLineOptions {
  /** Where the line leads. */
  targetHost?: string;
  target: number;
}

export interface CutLineStats {
  connections: number;
  cuts: number;
  /** Bytes that waited behind a cut (liveness: the cut really held traffic). */
  heldBytesUp: number;
  heldBytesDown: number;
}

export interface CutLine {
  readonly port: number;
  /** Cuts the line both ways for `ms`; resolves when it is whole again. */
  cut(ms: number): Promise<void>;
  readonly cutting: boolean;
  stats(): CutLineStats;
  close(): Promise<void>;
}

/** One direction: passes chunks through, or queues them while cut. */
class Gate {
  private readonly held: Buffer[] = [];
  private ended = false;
  constructor(
    private readonly dest: Socket,
    private readonly line: { cutting: boolean },
    private readonly onHeld: (n: number) => void,
  ) {}
  push(buf: Buffer): void {
    if (this.line.cutting || this.held.length > 0) {
      this.held.push(buf);
      this.onHeld(buf.length);
      return;
    }
    if (!this.dest.destroyed) this.dest.write(buf);
  }
  end(): void {
    this.ended = true;
    if (!this.line.cutting && this.held.length === 0 && !this.dest.destroyed) this.dest.end();
  }
  flush(): void {
    while (this.held.length > 0) {
      const b = this.held.shift() as Buffer;
      if (!this.dest.destroyed) this.dest.write(b);
    }
    if (this.ended && !this.dest.destroyed) this.dest.end();
  }
}

export async function startCutLine(opts: CutLineOptions): Promise<CutLine> {
  const state = { cutting: false };
  const stats: CutLineStats = { connections: 0, cuts: 0, heldBytesUp: 0, heldBytesDown: 0 };
  const gates = new Set<Gate>();
  const sockets = new Set<Socket>();
  const server: Server = createServer((client) => {
    stats.connections++;
    const upstream = connect(opts.target, opts.targetHost ?? "127.0.0.1");
    sockets.add(client);
    sockets.add(upstream);
    const up = new Gate(upstream, state, (n) => (stats.heldBytesUp += n));
    const down = new Gate(client, state, (n) => (stats.heldBytesDown += n));
    gates.add(up);
    gates.add(down);
    client.on("data", (b: Buffer) => up.push(b));
    upstream.on("data", (b: Buffer) => down.push(b));
    client.on("end", () => up.end());
    upstream.on("end", () => down.end());
    const drop = (): void => {
      gates.delete(up);
      gates.delete(down);
      sockets.delete(client);
      sockets.delete(upstream);
      client.destroy();
      upstream.destroy();
    };
    client.on("error", drop);
    upstream.on("error", drop);
    client.on("close", () => sockets.delete(client));
    upstream.on("close", () => sockets.delete(upstream));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    get cutting() {
      return state.cutting;
    },
    async cut(ms: number): Promise<void> {
      state.cutting = true;
      stats.cuts++;
      await new Promise((r) => setTimeout(r, ms));
      state.cutting = false;
      for (const g of gates) g.flush();
    },
    stats: () => ({ ...stats }),
    async close(): Promise<void> {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
