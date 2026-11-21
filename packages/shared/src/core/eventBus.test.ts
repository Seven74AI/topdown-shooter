import { describe, expect, it } from "vitest";
import { EventBus } from "./eventBus";
import type { SimEvent } from "./simEvents";

const ping = (n: number): SimEvent => ({ type: "test.ping", n });

describe("EventBus", () => {
  it("delivers nothing before flush, then everything in emission order", () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.subscribe((e) => {
      if (e.type === "test.ping") seen.push(e.n);
    });
    bus.emit(ping(1));
    bus.emit(ping(2));
    bus.emit(ping(3));
    expect(seen).toEqual([]);
    bus.flush();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("delivers each event exactly once", () => {
    const bus = new EventBus();
    let count = 0;
    bus.subscribe(() => count++);
    bus.emit(ping(1));
    bus.flush();
    bus.flush();
    expect(count).toBe(1);
  });

  it("delivers to every subscriber and supports unsubscribe", () => {
    const bus = new EventBus();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe((e) => e.type === "test.ping" && a.push(e.n));
    const off = bus.subscribe((e) => e.type === "test.ping" && b.push(e.n));
    bus.emit(ping(1));
    bus.flush();
    off();
    bus.emit(ping(2));
    bus.flush();
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1]);
  });

  it("queues events emitted during a flush for the next flush (never lost, never same flush)", () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.subscribe((e) => {
      if (e.type !== "test.ping") return;
      seen.push(e.n);
      if (e.n === 1) bus.emit(ping(10));
    });
    bus.emit(ping(1));
    bus.flush();
    expect(seen).toEqual([1]);
    expect(bus.pendingCount).toBe(1);
    bus.flush();
    expect(seen).toEqual([1, 10]);
  });

  it("types payloads by the SimEvent union", () => {
    const bus = new EventBus();
    bus.emit({ type: "zombie.killed", zombieId: 3, killerId: "local", x: 1, y: 2, weapon: "pistol" });
    // @ts-expect-error: wrong payload for zombie.killed
    bus.emit({ type: "zombie.killed", zombieId: "3" });
    // @ts-expect-error: unknown event type
    bus.emit({ type: "zombie.exploded" });
    expect(bus.pendingCount).toBe(3);
  });
});
