import { describe, expect, it } from "vitest";
import { canStart, startBlocker } from "./lobbyRules";

const r = (...ready: boolean[]) => ready.map((x) => ({ ready: x }));

describe("start rule", () => {
  it("needs the host, at least 1 player and everyone Ready", () => {
    expect(canStart(r(true, true), true, false)).toBe(true);
    expect(canStart(r(true, true, true, true), true, false)).toBe(true);
    expect(startBlocker(r(true, true), false, false)).toBe("not_host");
    expect(startBlocker(r(true, false), true, false)).toBe("not_ready");
    expect(startBlocker(r(false, false, true), true, false)).toBe("not_ready");
    expect(startBlocker([], true, false)).toBe("too_few");
  });

  it("lets the host start alone in every build (designer 2026-11-23), still only when Ready", () => {
    for (const allowSolo of [false, true]) {
      expect(canStart(r(true), true, allowSolo)).toBe(true);
      expect(startBlocker(r(false), true, allowSolo)).toBe("not_ready");
      expect(canStart(r(true), false, allowSolo)).toBe(false);
    }
  });
});
