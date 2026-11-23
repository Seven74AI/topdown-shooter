import { describe, expect, it, vi } from "vitest";
import { RebuildPhase, TextureRegistry, type RestorableCanvas } from "./textureRegistry";

/** A fake canvas that records its `contextrestored` listeners and can fire them. */
function fakeCanvas(): RestorableCanvas & { fire(): void; count(): number } {
  const ls = new Set<() => void>();
  return {
    addEventListener: (_t, l) => void ls.add(l),
    removeEventListener: (_t, l) => void ls.delete(l),
    fire: () => ls.forEach((l) => l()),
    count: () => ls.size,
  };
}

/** A scheduler the test runs by hand. */
function manual() {
  const q: (() => void)[] = [];
  return { schedule: (run: () => void) => void q.push(run), flush: () => q.splice(0).forEach((r) => r()), pending: () => q.length };
}

describe("TextureRegistry (Story 4.13)", () => {
  it("rebuilds caches, then atlases, then bakes, then text, whatever the registration order", () => {
    const r = new TextureRegistry();
    const order: string[] = [];
    r.register("text", RebuildPhase.text, () => order.push("text"));
    r.register("city", RebuildPhase.bake, () => order.push("city"));
    r.register("chars", RebuildPhase.atlas, () => order.push("chars"));
    r.register("noise", RebuildPhase.cache, () => order.push("noise"));
    r.register("fx", RebuildPhase.atlas, () => order.push("fx"));
    const rep = r.rebuildAll();
    expect(order).toEqual(["noise", "chars", "fx", "city", "text"]);
    expect(rep).toEqual({ rebuilt: 5, failed: [] });
    expect(r.rebuildCount).toBe(1);
  });

  it("a failing texture is reported and never stops the others", () => {
    const r = new TextureRegistry();
    const done: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    r.register("a", RebuildPhase.atlas, () => done.push("a"));
    r.register("bad", RebuildPhase.atlas, () => {
      throw new Error("boom");
    });
    r.register("b", RebuildPhase.bake, () => done.push("b"));
    expect(r.rebuildAll()).toEqual({ rebuilt: 2, failed: ["bad"] });
    expect(done).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("register replaces the same key; unregister (or the returned function) removes it and its canvas hooks", () => {
    const r = new TextureRegistry();
    const c = fakeCanvas();
    let first = 0;
    let second = 0;
    r.register("k", RebuildPhase.atlas, () => first++, [c]);
    const off = r.register("k", RebuildPhase.atlas, () => second++, [c]);
    expect(r.size).toBe(1);
    expect(c.count()).toBe(1); // the old hook went with the old entry
    r.rebuildAll();
    expect([first, second]).toEqual([0, 1]);
    off();
    expect(r.has("k")).toBe(false);
    expect(c.count()).toBe(0);
    r.rebuildAll();
    expect(second).toBe(1);
  });

  it("a 2D canvas contextrestored asks for ONE coalesced rebuild", () => {
    const m = manual();
    const r = new TextureRegistry(m.schedule);
    const a = fakeCanvas();
    const b = fakeCanvas();
    let n = 0;
    r.register("atlas", RebuildPhase.atlas, () => n++, [a]);
    r.register("city", RebuildPhase.bake, () => n++, [a, b]);
    a.fire();
    b.fire();
    a.fire();
    expect(m.pending()).toBe(1);
    expect(n).toBe(0);
    m.flush();
    expect(n).toBe(2); // both entries, once
    expect(r.rebuildCount).toBe(1);
    b.fire();
    m.flush();
    expect(r.rebuildCount).toBe(2);
  });

  it("a direct rebuildAll cancels a pending request", () => {
    const m = manual();
    const r = new TextureRegistry(m.schedule);
    r.register("x", RebuildPhase.atlas, () => {});
    r.requestRebuild();
    r.rebuildAll();
    m.flush();
    expect(r.rebuildCount).toBe(1);
  });

  it("allIntact is false when any probe says the pixels are gone (or throws)", () => {
    const r = new TextureRegistry();
    let ok = true;
    r.register("no-probe", RebuildPhase.atlas, () => {});
    r.register("probed", RebuildPhase.atlas, () => (ok = true), [], () => ok);
    expect(r.allIntact()).toBe(true);
    ok = false; // the browser emptied the canvas
    expect(r.allIntact()).toBe(false);
    r.rebuildAll(); // the rebuild repaints it
    expect(r.allIntact()).toBe(true);
    r.register("throws", RebuildPhase.atlas, () => {}, [], () => {
      throw new Error("lost");
    });
    expect(r.allIntact()).toBe(false);
  });

  it("an entry unregistered by an earlier callback is skipped", () => {
    const r = new TextureRegistry();
    let late = 0;
    r.register("first", RebuildPhase.atlas, () => r.unregister("late"));
    r.register("late", RebuildPhase.bake, () => late++);
    expect(r.rebuildAll().rebuilt).toBe(1);
    expect(late).toBe(0);
  });
});
