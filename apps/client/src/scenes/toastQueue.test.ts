import { describe, expect, it } from "vitest";
import { TOAST_QUEUE_MAX, TOAST_SHOW_MS, ToastQueue, playerLeftText } from "./toastQueue";

describe("ToastQueue (Story 2.11)", () => {
  it("shows each toast for TOAST_SHOW_MS, one after another", () => {
    const q = new ToastQueue();
    expect(q.current(0)).toBe("");
    q.push("Bo left");
    q.push("Cy lost connection");
    expect(q.current(100)).toBe("Bo left");
    expect(q.current(100 + TOAST_SHOW_MS - 1)).toBe("Bo left");
    expect(q.current(100 + TOAST_SHOW_MS)).toBe("Cy lost connection");
    expect(q.current(100 + 2 * TOAST_SHOW_MS - 1)).toBe("Cy lost connection");
    expect(q.current(100 + 2 * TOAST_SHOW_MS)).toBe("");
  });

  it("a toast that arrives later gets its full time", () => {
    const q = new ToastQueue();
    q.push("A left");
    expect(q.current(0)).toBe("A left");
    expect(q.current(TOAST_SHOW_MS * 5)).toBe("");
    q.push("B left");
    expect(q.current(TOAST_SHOW_MS * 6)).toBe("B left");
    expect(q.current(TOAST_SHOW_MS * 7 - 1)).toBe("B left");
  });

  it("keeps at most TOAST_QUEUE_MAX waiting, and clear empties it", () => {
    const q = new ToastQueue();
    for (let i = 0; i < TOAST_QUEUE_MAX + 3; i++) q.push(`${i}`);
    let shown = 0;
    for (let t = 0; q.current(t) !== ""; t += TOAST_SHOW_MS) shown++;
    expect(shown).toBe(TOAST_QUEUE_MAX);
    q.push("x");
    q.clear();
    expect(q.current(0)).toBe("");
  });

  it("Story 5.16: pushUnique doesn't stack the same line; withdraw removes it and the next starts in full", () => {
    const q = new ToastQueue();
    q.pushUnique("Need $250 (you have $100)");
    q.pushUnique("Need $250 (you have $100)");
    q.push("Bo left");
    expect(q.current(0)).toBe("Need $250 (you have $100)");
    expect(q.current(TOAST_SHOW_MS)).toBe("Bo left"); // only one copy queued
    const r = new ToastQueue();
    r.push("Need $250 (you have $100)");
    r.push("Bo left");
    expect(r.current(1000)).toBe("Need $250 (you have $100)");
    r.withdraw("Need $250 (you have $100)");
    expect(r.current(1500)).toBe("Bo left");
    expect(r.current(1500 + TOAST_SHOW_MS - 1)).toBe("Bo left"); // a full 3 s from when it showed
    r.withdraw("nothing like it");
    expect(r.current(1500 + TOAST_SHOW_MS)).toBe("");
  });

  it("words the reason", () => {
    expect(playerLeftText("Bo", "left")).toBe("Bo left");
    expect(playerLeftText("Bo", "disconnected")).toBe("Bo lost connection");
  });
});
