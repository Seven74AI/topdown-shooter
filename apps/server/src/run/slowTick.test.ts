import { describe, expect, it } from "vitest";
import { SLOW_TICK_MS, SlowTickWatch } from "./slowTick";

function setup() {
  let now = 0;
  const lines: { obj: Record<string, unknown>; msg: string }[] = [];
  const watch = new SlowTickWatch("ABCD", { warn: (obj, msg) => lines.push({ obj: obj as Record<string, unknown>, msg }) }, () => now);
  return { watch, lines, advance: (ms: number) => (now += ms) };
}

describe("SlowTickWatch", () => {
  it("logs a tick over 40 ms at warn with roomId, tick and tickMs", () => {
    const { watch, lines } = setup();
    watch.observe(SLOW_TICK_MS, 1); // exactly 40 is not slow
    watch.observe(12, 2);
    expect(lines).toEqual([]);
    watch.observe(41.27, 3);
    expect(lines).toEqual([{ msg: "slow_tick", obj: { roomId: "ABCD", tick: 3, tickMs: 41.3, count: 1 } }]);
  });

  it("logs at most one line per second and counts the others into the next line", () => {
    const { watch, lines, advance } = setup();
    watch.observe(50, 1);
    advance(300);
    watch.observe(60, 7);
    advance(300);
    watch.observe(70, 13);
    expect(lines).toHaveLength(1);
    advance(400); // one second after the first line
    watch.observe(45, 21);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.obj).toMatchObject({ tick: 21, tickMs: 45, count: 3 });
    advance(5000);
    watch.observe(80, 200);
    expect(lines[2]?.obj).toMatchObject({ tick: 200, count: 1 });
  });

  it("keeps max and mean", () => {
    const { watch } = setup();
    watch.observe(1, 1);
    watch.observe(3, 2);
    expect(watch.maxMs).toBe(3);
    expect(watch.meanMs).toBe(2);
  });
});
