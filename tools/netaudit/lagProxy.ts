/**
 * Network audit (2026-11) measurement helper. NOT game code: nothing in apps/ or packages/ imports it.
 *
 * A TCP proxy between the bots (or a browser) and a local game server that:
 *  1. delays every chunk by half the round trip ± half the jitter (uniform), in each direction,
 *     WITHOUT reordering (a chunk never overtakes an earlier one, like real TCP);
 *  2. optionally models a TCP retransmission stall (head-of-line blocking): with probability
 *     `--stall-prob` per chunk, in EACH direction (Story 8.8; before it: server→client only), that
 *     chunk and everything behind it waits an extra `--stall-ms` (a lost segment waiting for its
 *     retransmit), then arrives in one burst;
 *  3. reads the server→client WebSocket frames (plain ws on localhost, unmasked) and splits the
 *     payload bytes by Colyseus protocol code and message type, per connection and per second, and
 *     records when each horde frame reaches the client (gaps and bursts).
 *
 *   npx tsx tools/netaudit/lagProxy.ts --listen 4167 --target 4067 --rtt 150 --jitter 20 \
 *     [--stall-prob 0.005 --stall-ms 400] [--out report.json]
 *
 * Point the bots at it: `npm run bots -- --url http://localhost:4167 ...`. On SIGINT / SIGTERM it
 * writes the JSON report (stdout, or `--out`) and exits.
 *
 * Story 8.8: the line itself (1–2) lives in `lagLine.ts` (also used in-process by
 * `npm run bots -- --lag --jitter --loss`); this file adds the CLI and the report (3).
 */
import { writeFileSync } from "node:fs";
import { startLagLine } from "./lagLine";

interface Args {
  listen: number;
  targetHost: string;
  target: number;
  rttMs: number;
  jitterMs: number;
  stallProb: number;
  stallMs: number;
  out: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (k: string, d: number): number => {
    const v = get(k);
    return v === undefined ? d : Number(v);
  };
  return {
    listen: num("listen", 4167),
    targetHost: get("target-host") ?? "127.0.0.1",
    target: num("target", 4067),
    rttMs: num("rtt", 150),
    jitterMs: num("jitter", 20),
    stallProb: num("stall-prob", 0),
    stallMs: num("stall-ms", 400),
    out: get("out") ?? null,
  };
}

const args = parseArgs(process.argv.slice(2));

/** Colyseus 0.18 protocol codes (low 5 bits of the first payload byte). */
const PROTOCOL: Record<number, string> = {
  10: "JOIN_ROOM",
  11: "ERROR",
  12: "LEAVE_ROOM",
  13: "ROOM_DATA",
  14: "ROOM_STATE",
  15: "ROOM_STATE_PATCH",
  17: "ROOM_DATA_BYTES",
  18: "PING",
  22: "ROOM_RESPONSE",
};

interface ConnStats {
  id: number;
  openedAt: number;
  closedAt: number | null;
  upgraded: boolean;
  deflate: boolean;
  /** Category → payload bytes (WebSocket payload only, like the game's own meters). */
  bytes: Record<string, number>;
  /** Category → message count. */
  messages: Record<string, number>;
  /** Category → bytes per whole second since open (index = second). */
  perSecond: Record<string, number[]>;
  /** WebSocket frame header bytes (2–4 per server frame). */
  wsHeaderBytes: number;
  /** TCP writes towards the client (each is ≥ 1 segment: ~40 B TCP/IP + TLS record ~22–29 B on the real path). */
  chunksToClient: number;
  /** When horde frames were written to the client socket (ms, monotonic). */
  hordeArrivals: number[];
  /** Up direction: chunks and bytes from the client. */
  upChunks: number;
  upBytes: number;
  /** Stalls injected on this connection (Story 8.8: both directions; `stallsUp` the client→server ones). */
  stalls: number;
  stallsUp: number;
}

const conns: ConnStats[] = [];
let nextId = 1;
const t0 = performance.now();

/** Incremental WebSocket frame reader for the server→client direction (after the 101 response). */
class WsReader {
  private buf: Buffer = Buffer.alloc(0);
  private httpDone = false;
  constructor(private readonly s: ConnStats) {}
  feed(chunk: Buffer, deliveredAt: number): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    if (!this.httpDone) {
      const end = this.buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const head = this.buf.subarray(0, end).toString("latin1");
      this.httpDone = true;
      this.s.upgraded = head.startsWith("HTTP/1.1 101");
      this.s.deflate = /sec-websocket-extensions:[^\r\n]*permessage-deflate/i.test(head);
      this.buf = this.buf.subarray(end + 4);
      if (!this.s.upgraded) {
        this.buf = Buffer.alloc(0);
        return;
      }
    }
    if (!this.s.upgraded) return;
    for (;;) {
      if (this.buf.length < 2) return;
      const b1 = this.buf[1] as number;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      const masked = (b1 & 0x80) !== 0;
      if (masked) off += 4;
      if (this.buf.length < off + len) return;
      const opcode = (this.buf[0] as number) & 0x0f;
      const payload = this.buf.subarray(off, off + len);
      this.s.wsHeaderBytes += off;
      if (opcode === 0x1 || opcode === 0x2) this.record(payload, deliveredAt);
      else this.add(`ws_control_${opcode}`, len);
      this.buf = this.buf.subarray(off + len);
    }
  }
  private record(p: Buffer, at: number): void {
    const code = (p[0] ?? 0) & 0x1f;
    let cat = PROTOCOL[code] ?? `code_${code}`;
    if (code === 13) cat = `ROOM_DATA:${msgType(p, 1)}`;
    else if (code === 17) {
      cat = `ROOM_DATA_BYTES:${msgType(p, 1)}`;
      if (p[1] === 1) this.s.hordeArrivals.push(at);
    }
    this.add(cat, p.length);
  }
  private add(cat: string, n: number): void {
    const s = this.s;
    s.bytes[cat] = (s.bytes[cat] ?? 0) + n;
    s.messages[cat] = (s.messages[cat] ?? 0) + 1;
    const sec = Math.floor((performance.now() - s.openedAt) / 1000);
    const row = (s.perSecond[cat] ??= []);
    while (row.length <= sec) row.push(0);
    row[sec] = (row[sec] as number) + n;
  }
}

/** The message type after the protocol byte: a msgpack fixint / fixstr / str8 (enough for Colyseus). */
function msgType(p: Buffer, o: number): string {
  const b = p[o];
  if (b === undefined) return "?";
  if (b <= 0x7f) return String(b);
  if (b >= 0xa0 && b <= 0xbf) return p.subarray(o + 1, o + 1 + (b & 0x1f)).toString("utf8");
  if (b === 0xd9) return p.subarray(o + 2, o + 2 + (p[o + 1] as number)).toString("utf8");
  return `0x${b.toString(16)}`;
}

void startLagLine({
  listen: args.listen,
  listenHost: "0.0.0.0",
  targetHost: args.targetHost,
  target: args.target,
  rttMs: args.rttMs,
  jitterMs: args.jitterMs,
  lossPct: args.stallProb * 100,
  stallMs: args.stallMs,
  onConnection: (c) => {
    const s: ConnStats = {
      id: nextId++,
      openedAt: performance.now(),
      closedAt: null,
      upgraded: false,
      deflate: false,
      bytes: {},
      messages: {},
      perSecond: {},
      wsHeaderBytes: 0,
      chunksToClient: 0,
      hordeArrivals: [],
      upChunks: 0,
      upBytes: 0,
      stalls: 0,
      stallsUp: 0,
    };
    conns.push(s);
    const reader = new WsReader(s);
    c.client.on("close", () => (s.closedAt ??= performance.now()));
    return {
      onDown: (buf: Buffer) => {
        s.chunksToClient++;
        reader.feed(buf, performance.now());
      },
      onUp: (buf: Buffer) => {
        s.upChunks++;
        s.upBytes += buf.length;
      },
      canStall: () => s.upgraded, // the WebSocket stream only (as before), both directions
      onStall: (dir: "up" | "down") => {
        s.stalls++;
        if (dir === "up") s.stallsUp++;
      },
    };
  },
}).then((line) => {
  process.stderr.write(`lagProxy :${line.port} -> ${args.targetHost}:${args.target} rtt ${args.rttMs} ±${args.jitterMs / 2} stall ${args.stallProb}@${args.stallMs}ms (both directions)\n`);
});

const pct = (sorted: readonly number[], q: number): number => (sorted.length === 0 ? 0 : (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number));
const r1 = (x: number): number => Math.round(x * 10) / 10;

function report(): unknown {
  const ws = conns.filter((c) => c.upgraded);
  return {
    args,
    elapsedS: r1((performance.now() - t0) / 1000),
    connections: ws.map((c) => {
      const lifeS = ((c.closedAt ?? performance.now()) - c.openedAt) / 1000;
      const gaps: number[] = [];
      for (let i = 1; i < c.hordeArrivals.length; i++) gaps.push((c.hordeArrivals[i] as number) - (c.hordeArrivals[i - 1] as number));
      gaps.sort((a, b) => a - b);
      // A "burst" is a horde frame arriving < 5 ms after the previous one (the pair was meant to be 50 ms apart).
      const bunched = gaps.filter((g) => g < 5).length;
      const total = Object.values(c.bytes).reduce((a, b) => a + b, 0);
      return {
        id: c.id,
        lifeS: r1(lifeS),
        deflate: c.deflate,
        totalPayloadKB: r1(total / 1024),
        avgKBps: r1(total / 1024 / lifeS),
        byCategoryKBps: Object.fromEntries(Object.entries(c.bytes).map(([k, v]) => [k, r1(v / 1024 / lifeS)])),
        messagesPerS: Object.fromEntries(Object.entries(c.messages).map(([k, v]) => [k, r1(v / lifeS)])),
        avgBytesPerMessage: Object.fromEntries(Object.entries(c.bytes).map(([k, v]) => [k, Math.round(v / (c.messages[k] ?? 1))])),
        wsHeaderKBps: r1(c.wsHeaderBytes / 1024 / lifeS),
        tcpWritesToClientPerS: r1(c.chunksToClient / lifeS),
        upKBps: r1(c.upBytes / 1024 / lifeS),
        upWritesPerS: r1(c.upChunks / lifeS),
        stalls: c.stalls,
        stallsUp: c.stallsUp,
        hordeFrames: c.hordeArrivals.length,
        hordeGapMs: { p50: r1(pct(gaps, 0.5)), p95: r1(pct(gaps, 0.95)), p99: r1(pct(gaps, 0.99)), max: r1(gaps[gaps.length - 1] ?? 0) },
        hordeBunchedPct: gaps.length ? r1((100 * bunched) / gaps.length) : 0,
        perSecondKB: Object.fromEntries(Object.entries(c.perSecond).map(([k, row]) => [k, row.map((v) => r1(v / 1024))])),
      };
    }),
  };
}

const finish = (): void => {
  const text = JSON.stringify(report(), null, 1);
  if (args.out) writeFileSync(args.out, text);
  else process.stdout.write(text + "\n");
  process.exit(0);
};
process.on("SIGINT", finish);
process.on("SIGTERM", finish);
