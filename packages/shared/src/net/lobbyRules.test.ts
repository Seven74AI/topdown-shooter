import { describe, expect, it } from "vitest";
import { canStart, startBlocker } from "./lobbyRules";

const r = (...ready: boolean[]) => ready.map((x) => ({ ready: x }));

describe("start rule", () => {
  it("needs the host, at least 2 players and everyone Ready", () => {
    expect(canStart(r(true, true), true, false)).toBe(true);
    expect(canStart(r(true, true, true, true), true, false)).toBe(true);
    expect(startBlocker(r(true, true), false, false)).toBe("not_host");
    expect(startBlocker(r(true, false), true, false)).toBe("not_ready");
    expect(startBlocker(r(false, false, true), true, false)).toBe("not_ready");
    expect(startBlocker(r(true), true, false)).toBe("too_few");
    expect(startBlocker(r(false), true, false)).toBe("too_few");
    expect(startBlocker([], true, true)).toBe("too_few");
  });

  it("lets the host start alone when solo start is allowed (dev builds)", () => {
    expect(canStart(r(true), true, true)).toBe(true);
    expect(startBlocker(r(false), true, true)).toBe("not_ready");
    expect(canStart(r(true), false, true)).toBe(false);
  });
});
