import { describe, expect, it } from "vitest";
import { KB_BYTES } from "@topdown/shared";
import { NetMeter } from "./netMeter";

/** A fake SDK room: the socket (`connection.transport.ws`) and `connection.send`. */
function fakeRoom() {
  const listeners = new Set<(e: { data: unknown }) => void>();
  const ws = {
    addEventListener: (_t: "message", cb: (e: { data: unknown }) => void) => void listeners.add(cb),
    removeEventListener: (_t: "message", cb: (e: { data: unknown }) => void) => void listeners.delete(cb),
  };
  const room = { connection: { transport: { ws }, send: (d: Uint8Array) => void d } };
  const receive = (bytes: number) => {
    for (const l of listeners) l({ data: new ArrayBuffer(bytes) });
  };
  return { room, receive, listeners };
}

describe("NetMeter (Story 2.10)", () => {
  it("gives 1-s down/up KB/s and the per-wave average and peak, with injected time", () => {
    let t = 10_000;
    const meter = new NetMeter(() => t);
    const { room, receive } = fakeRoom();
    meter.attach(room);
    meter.markWave(10_000);
    for (let s = 0; s < 4; s++) {
      t = 10_000 + s * 1000 + 100;
      receive((s + 1) * KB_BYTES); // 1, 2, 3, 4 KB in seconds 10–13
      room.connection.send(new Uint8Array(256));
    }
    t = 14_000;
    expect(meter.downKBps(t)).toBe(4);
    expect(meter.upKBps(t)).toBe(0.25);
    expect(meter.avgDownKBps(t)).toBeCloseTo(10 / 4);
    expect(meter.peakDownKBps(t)).toBe(4);
    expect(meter.avgUpKBps(t)).toBeCloseTo(1 / 4);
    meter.markWave(t);
    expect(meter.peakDownKBps(t)).toBe(0);
  });

  it("a new room replaces the old one", () => {
    const meter = new NetMeter(() => 0);
    const a = fakeRoom();
    const b = fakeRoom();
    meter.attach(a.room);
    meter.attach(b.room);
    expect(a.listeners.size).toBe(0);
    expect(b.listeners.size).toBe(1);
    a.receive(100);
    expect(meter.down.totalBytes).toBe(0);
    b.receive(100);
    expect(meter.down.totalBytes).toBe(100);
  });
});
