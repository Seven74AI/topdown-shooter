import { describe, expect, it } from "vitest";
import { BYTE_RATE_RING_S, ByteRate, KB_BYTES, attachByteCounters, messageBytes } from "./byteRate";

describe("ByteRate (Story 2.10)", () => {
  it("reports the last whole second in KB/s (KB = 1024 bytes)", () => {
    const r = new ByteRate();
    r.add(1000, 512);
    r.add(1500, 512);
    expect(r.lastSecondKBps(1999)).toBe(0); // second 1 is not over yet: second 0 had nothing
    expect(r.lastSecondKBps(2000)).toBe(1);
    r.add(2100, 2048);
    expect(r.lastSecondKBps(3050)).toBe(2);
    expect(r.lastSecondKBps(4050)).toBe(0); // an empty second
  });

  it("averages since the mark and keeps the busiest whole second after it", () => {
    const r = new ByteRate();
    r.add(500, 10 * KB_BYTES); // before the mark: not in the average or the peak
    r.mark(1000);
    r.add(1200, 4 * KB_BYTES);
    r.add(2200, 8 * KB_BYTES);
    r.add(3100, 2 * KB_BYTES);
    expect(r.avgKBps(5000)).toBeCloseTo(14 / 4);
    expect(r.peakKBps(5000)).toBe(8);
    expect(r.totalBytes).toBe(24 * KB_BYTES);
    expect(r.totalMessages).toBe(4);
    expect(r.bytesSinceMark).toBe(14 * KB_BYTES);
  });

  it("does not count the second the mark fell in toward the peak", () => {
    const r = new ByteRate();
    r.add(1100, 50 * KB_BYTES);
    r.mark(1500);
    r.add(1600, 1 * KB_BYTES); // same second as the mark: partly before it
    r.add(2500, 3 * KB_BYTES);
    expect(r.peakKBps(4000)).toBe(3);
  });

  it("marks itself at the first add", () => {
    const r = new ByteRate();
    expect(r.avgKBps(100)).toBe(0);
    r.add(1000, KB_BYTES);
    expect(r.avgKBps(3000)).toBeCloseTo(0.5);
  });

  it("clears the ring across a long gap", () => {
    const r = new ByteRate();
    r.add(0, KB_BYTES);
    r.add((BYTE_RATE_RING_S + 5) * 1000, 3 * KB_BYTES);
    expect(r.lastSecondKBps((BYTE_RATE_RING_S + 6) * 1000)).toBe(3);
    expect(r.lastSecondKBps((2 * BYTE_RATE_RING_S + 1) * 1000)).toBe(0);
  });
});

describe("attachByteCounters", () => {
  it("counts socket messages down and sends up, and detaches cleanly", () => {
    const listeners: ((e: { data: unknown }) => void)[] = [];
    const ws = {
      addEventListener: (_t: "message", cb: (e: { data: unknown }) => void) => listeners.push(cb),
      removeEventListener: (_t: "message", cb: (e: { data: unknown }) => void) => listeners.splice(listeners.indexOf(cb), 1),
    };
    const sent: Uint8Array[] = [];
    const connection = { transport: { ws }, send: (d: Uint8Array) => void sent.push(d) };
    const original = connection.send;
    const down = new ByteRate();
    const up = new ByteRate();
    let t = 1000;
    const detach = attachByteCounters({ connection }, down, up, () => t);
    for (const l of listeners) l({ data: new ArrayBuffer(300) });
    connection.send(new Uint8Array(40));
    t = 2000;
    expect(down.lastSecondKBps(t)).toBeCloseTo(300 / KB_BYTES);
    expect(up.totalBytes).toBe(40);
    expect(sent).toHaveLength(1);
    detach();
    expect(listeners).toHaveLength(0);
    expect(connection.send).toBe(original);
  });

  it("sizes every payload type the SDK can hand over", () => {
    expect(messageBytes(new ArrayBuffer(7))).toBe(7);
    expect(messageBytes(new Uint8Array(5))).toBe(5);
    expect(messageBytes("abc")).toBe(3);
    expect(messageBytes(null)).toBe(0);
  });
});
