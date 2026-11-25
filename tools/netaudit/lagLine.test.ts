/** Story 8.8 (T7): the lossy TCP line used by the bots and the audit proxy. Real sockets on 127.0.0.1. */
import { afterEach, describe, expect, it } from "vitest";
import { connect, createServer, type Server, type Socket } from "node:net";
import { startLagLine, type LagLine } from "./lagLine";

/** A target server: records what it receives (with arrival times) and lets the test write back. */
async function target(): Promise<{ port: number; got: { at: number; buf: Buffer }[]; peer: () => Socket | null; close: () => Promise<void> }> {
  const got: { at: number; buf: Buffer }[] = [];
  let peer: Socket | null = null;
  const server: Server = createServer((s) => {
    peer = s;
    s.on("data", (buf: Buffer) => got.push({ at: performance.now(), buf }));
    s.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { port, got, peer: () => peer, close: () => new Promise<void>((r) => { peer?.destroy(); server.close(() => r()); }) };
}

const open = (port: number): Promise<Socket> =>
  new Promise((r) => {
    const s = connect({ host: "127.0.0.1", port }, () => r(s));
    s.setNoDelay(true);
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const end = performance.now() + ms;
  while (!cond() && performance.now() < end) await wait(5);
};

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

describe("lagLine (Story 8.8: ordered delay + head-of-line stalls, both directions)", () => {
  it("keeps the byte order with jitter (never a reorder, never a lost byte), delayed by about half the RTT", async () => {
    const t = await target();
    cleanups.push(t.close);
    const line = await startLagLine({ listen: 0, target: t.port, rttMs: 60, jitterMs: 40 });
    cleanups.push(line.close);
    const c = await open(line.port);
    cleanups.push(() => void c.destroy());
    const sent: number[] = [];
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      sent.push(i);
      c.write(Buffer.from([i]));
      await wait(2);
    }
    await until(() => t.got.reduce((n, g) => n + g.buf.length, 0) >= 60);
    expect([...Buffer.concat(t.got.map((g) => g.buf))]).toEqual(sent);
    expect((t.got[0] as { at: number }).at - t0).toBeGreaterThanOrEqual(10 - 2); // ≥ 30 − 20 ms one-way
    expect(line.stats().stallsUp + line.stats().stallsDown).toBe(0); // clean line: no stalls
    expect(line.stats().connections).toBe(1);
  });

  it("a forced stall delays that chunk and every later one, in each direction, in order", async () => {
    const t = await target();
    cleanups.push(t.close);
    // Per chunk: one draw for the one-way delay, one for the loss (lossPct 50: < 0.5 stalls).
    const script: number[] = [];
    const line: LagLine = await startLagLine({ listen: 0, target: t.port, rttMs: 20, jitterMs: 0, lossPct: 50, stallMs: 250, random: () => script.shift() ?? 0.9 });
    cleanups.push(line.close);
    const c = await open(line.port);
    cleanups.push(() => void c.destroy());
    const down: { at: number; buf: Buffer }[] = [];
    c.on("data", (buf: Buffer) => down.push({ at: performance.now(), buf }));

    // Up: chunk "a" stalls, "b" (sent 30 ms later, not stalled) still waits behind it.
    const t0 = performance.now();
    script.push(0.5, 0.1);
    c.write("a");
    await wait(30);
    script.push(0.5, 0.9);
    c.write("b");
    await until(() => Buffer.concat(t.got.map((g) => g.buf)).toString() === "ab");
    expect(Buffer.concat(t.got.map((g) => g.buf)).toString()).toBe("ab");
    expect((t.got[0] as { at: number }).at - t0).toBeGreaterThanOrEqual(250 + 10 - 5);
    expect((t.got[t.got.length - 1] as { at: number }).at - t0).toBeGreaterThanOrEqual(250 + 10 - 5); // "b" was due at ~40 ms: held
    expect(line.stats().stallsUp).toBe(1);

    // Down: the same model server→client.
    await until(() => t.peer() !== null);
    const t1 = performance.now();
    script.push(0.5, 0.0);
    t.peer()?.write("X");
    await wait(20);
    script.push(0.5, 0.9);
    t.peer()?.write("Y");
    await until(() => Buffer.concat(down.map((d) => d.buf)).toString() === "XY");
    expect(Buffer.concat(down.map((d) => d.buf)).toString()).toBe("XY");
    expect((down[down.length - 1] as { at: number }).at - t1).toBeGreaterThanOrEqual(250 + 10 - 5);
    expect(line.stats().stallsDown).toBe(1);
    expect(line.stats().chunksUp).toBe(2);
  });

  it("review R2: a side's write-then-end arrives in order, then the end (FIN), in both directions, after the line's delay", async () => {
    const t = await target();
    cleanups.push(t.close);
    const line = await startLagLine({ listen: 0, target: t.port, rttMs: 200, jitterMs: 0 });
    cleanups.push(line.close);
    const c = await open(line.port);
    cleanups.push(() => void c.destroy());
    const down: Buffer[] = [];
    let downEndAt = -1;
    c.on("data", (b: Buffer) => down.push(b));
    c.on("end", () => (downEndAt = performance.now()));
    await until(() => t.peer() !== null);
    const peer = t.peer() as Socket;
    const t0 = performance.now();
    peer.end("bye-from-server");
    await until(() => downEndAt >= 0);
    expect(Buffer.concat(down).toString()).toBe("bye-from-server");
    expect(downEndAt - t0).toBeGreaterThanOrEqual(100 - 5); // one-way 100 ms: the FIN travelled behind the bytes
    // The other way, on a fresh connection: the client's last bytes and its end reach the server.
    const before = t.got.length;
    const c2 = await open(line.port);
    cleanups.push(() => void c2.destroy());
    await until(() => t.peer() !== peer);
    let upEnded = false;
    (t.peer() as Socket).on("end", () => (upEnded = true));
    const t1 = performance.now();
    c2.end("bye-from-client");
    await until(() => upEnded);
    expect(Buffer.concat(t.got.slice(before).map((g) => g.buf)).toString()).toBe("bye-from-client");
    expect(performance.now() - t1).toBeGreaterThanOrEqual(100 - 5);
  });

  it("review R2: a server's WebSocket close frame (code 4000) and FIN reach the client through a stalled line", async () => {
    const t = await target();
    cleanups.push(t.close);
    const script: number[] = [];
    const line = await startLagLine({ listen: 0, target: t.port, rttMs: 40, jitterMs: 0, lossPct: 50, stallMs: 150, random: () => script.shift() ?? 0.9 });
    cleanups.push(line.close);
    const c = await open(line.port);
    cleanups.push(() => void c.destroy());
    const got: Buffer[] = [];
    let ended = false;
    c.on("data", (b: Buffer) => got.push(b));
    c.on("end", () => (ended = true));
    await until(() => t.peer() !== null);
    const peer = t.peer() as Socket;
    script.push(0.5, 0.1); // the last data frame stalls 150 ms …
    peer.write(Buffer.from([0x82, 0x02, 0x01, 0x02])); // a binary frame
    script.push(0.5, 0.9);
    peer.end(Buffer.from([0x88, 0x02, 0x0f, 0xa0])); // … the close frame (code 4000) and the FIN wait behind it
    await until(() => ended);
    expect([...Buffer.concat(got)]).toEqual([0x82, 0x02, 0x01, 0x02, 0x88, 0x02, 0x0f, 0xa0]);
    expect(Buffer.concat(got).readUInt16BE(6)).toBe(4000);
    expect(line.stats().stallsDown).toBe(1);
  });

  it("close frees the port and drops the connections", async () => {
    const t = await target();
    cleanups.push(t.close);
    const line = await startLagLine({ listen: 0, target: t.port, rttMs: 10, jitterMs: 0 });
    const c = await open(line.port);
    const closed = new Promise<void>((r) => c.on("close", () => r()));
    c.on("error", () => {});
    await line.close();
    await closed;
    const again = createServer();
    await new Promise<void>((resolve, reject) => {
      again.once("error", reject);
      again.listen(line.port, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((r) => again.close(() => r()));
  });
});
