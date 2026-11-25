import { afterEach, describe, expect, it, vi } from "vitest";
import { seatStore } from "./seatStore";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Story 8.1 seatStore (AC 6, 7)", () => {
  it("keeps the room code, the SDK token and my name in sessionStorage; clear() forgets them", () => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    seatStore.save({ roomId: "ABCD", token: "ABCD:xyz", name: "Bo" });
    expect(seatStore.load()).toEqual({ roomId: "ABCD", token: "ABCD:xyz", name: "Bo" });
    seatStore.clear();
    expect(seatStore.load()).toBeNull();
  });

  it("ignores garbage and survives a storage that throws (private mode)", () => {
    const s = memoryStorage();
    vi.stubGlobal("sessionStorage", s);
    s.setItem("topdown.seat", "{not json");
    expect(seatStore.load()).toBeNull();
    s.setItem("topdown.seat", JSON.stringify({ roomId: "../x", token: "t", name: "n" }));
    expect(seatStore.load()).toBeNull();
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    vi.stubGlobal("sessionStorage", throwing);
    expect(() => seatStore.save({ roomId: "ABCD", token: "t", name: "n" })).not.toThrow();
    expect(seatStore.load()).toBeNull();
    expect(() => seatStore.clear()).not.toThrow();
  });
});
