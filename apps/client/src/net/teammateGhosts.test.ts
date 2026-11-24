import { describe, expect, it } from "vitest";
import { GHOST_KEEPALIVE_MS, GHOST_MIN_INTERVAL_MS, GHOST_TIMEOUT_MS } from "@topdown/shared";
import { GhostSender, TeammateGhosts } from "./teammateGhosts";

describe("TeammateGhosts (Story 5.24)", () => {
  it("keeps the latest ghost per slot; hidden on a clear, after the timeout, on clearSlot / clearAll", () => {
    let now = 0;
    const g = new TeammateGhosts(() => now);
    expect(g.live(1)).toBeNull();
    g.receive([1, 2, 40, 30, 1]);
    expect(g.live(1)).toMatchObject({ typeIdx: 2, gx: 40, gy: 30, rot: 1 });
    expect(g.live(0)).toBeNull();
    now = GHOST_TIMEOUT_MS;
    expect(g.live(1)).not.toBeNull();
    now = GHOST_TIMEOUT_MS + 1;
    expect(g.live(1)).toBeNull(); // AC 4: 1 s without an update
    g.receive([1, 2, 41, 30, 1]);
    expect(g.live(1)?.gx).toBe(41);
    g.receive([1, -1, 0, 0, 0]);
    expect(g.live(1)).toBeNull();
    g.receive([2, 0, 1, 1, 0]);
    g.receive([3, 0, 1, 1, 0]);
    g.clearSlot(2);
    expect(g.live(2)).toBeNull();
    expect(g.live(3)).not.toBeNull();
    g.clearAll();
    expect(g.live(3)).toBeNull();
  });

  it("ignores malformed payloads (B12)", () => {
    const g = new TeammateGhosts(() => 0);
    for (const bad of [null, {}, [1, 2, 3, 4], [4, 0, 0, 0, 0], [1, 0, 256, 0, 0], [1, 0, 0, 0, 4], [1, 0.5, 0, 0, 0], [1, -2, 0, 0, 0], ["1", 0, 0, 0, 0], [1, 0, 0, 0, 0, 9]]) g.receive(bad);
    for (let s = 0; s < 4; s++) expect(g.live(s)).toBeNull();
  });
});

describe("GhostSender (Story 5.24, AC 2)", () => {
  it("sends a change at once, ≤ 4 Hz while it keeps changing (the last spot always goes), a keepalive while still, one clear", () => {
    const s = new GhostSender();
    const sent: string[] = [];
    const at = (t: number, type: string, gx: number, build = true) => {
      if (s.step(t, build, type, gx, 10, 0)) sent.push(`${t}:${s.out.type}@${s.out.gx}`);
    };
    at(0, "", 0); // empty hands from the start: nothing
    at(16, "mine", 5);
    for (let t = 32; t <= 240; t += 16) at(t, "mine", 5 + t / 16); // moving every frame
    at(266, "mine", 20); // the gap ended: the latest spot goes
    for (let t = 282; t < 266 + GHOST_KEEPALIVE_MS; t += 16) at(t, "mine", 20); // still: no change
    at(266 + GHOST_KEEPALIVE_MS, "mine", 20); // keepalive
    at(800, "", 0); // hand empty: inside the gap after the keepalive, so the clear waits
    at(1100, "", 0);
    at(2000, "", 0);
    expect(sent).toEqual(["16:mine@5", "266:mine@20", `${266 + GHOST_KEEPALIVE_MS}:mine@20`, "1100:@0"]);
    expect(s.sent).toBe(4);
    // the rate never exceeds 4 Hz
    expect(GHOST_MIN_INTERVAL_MS).toBeGreaterThanOrEqual(250);
  });

  it("sends nothing outside a build phase and starts fresh in the next build", () => {
    const s = new GhostSender();
    expect(s.step(0, true, "mine", 1, 1, 0)).toBe(true);
    expect(s.step(1000, false, "mine", 1, 1, 0)).toBe(false); // a wave: no message, not even the clear
    expect(s.step(2000, false, "", 0, 0, 0)).toBe(false);
    expect(s.step(3000, true, "", 0, 0, 0)).toBe(false); // the next build, empty hands: nothing
    expect(s.step(3100, true, "mine", 1, 1, 0)).toBe(true);
  });
});
