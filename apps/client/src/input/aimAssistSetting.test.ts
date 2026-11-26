import { afterEach, describe, expect, it } from "vitest";
import { NEUTRAL_INPUT } from "@topdown/shared";
import { InputRouter, type MutablePlayerInput } from "./InputRouter";
import type { TouchSticks } from "./TouchSticks";
import { resetSettingsCache, saveSettings } from "../settings/settings";

/** Story 10.1 (B6): aim assist off = the touch input's "no assist" bit; nothing else in the input changes. */
const sticks = {
  moveVector: () => ({ x: 0.5, y: 0 }),
  aimVector: () => ({ x: 0, y: 1, fire: true, deflection: 1 }),
  aimDeadZoneFrac: 0.2,
  reset: () => {},
} as unknown as TouchSticks;

const build = (): MutablePlayerInput => new InputRouter(sticks).build({ ...NEUTRAL_INPUT } as MutablePlayerInput, false, 0, 0, Number.NaN, Number.NaN);

describe("aim assist setting", () => {
  afterEach(() => resetSettingsCache());
  it("on (default): touch input asks for assist (isMouse false)", () => {
    expect(build().isMouse).toBe(false);
  });
  it("off: the same input with only the no-assist bit set, read live on the next build", () => {
    const on = build();
    saveSettings({ aimAssist: false });
    const off = build();
    expect(off.isMouse).toBe(true);
    expect({ ...off, isMouse: false }).toEqual(on);
    saveSettings({ aimAssist: true });
    expect(build().isMouse).toBe(false);
  });
  it("in shared code the only reader of the bit is the aim-assist branch (firing.ts), so no other rule changes", () => {
    const sources = import.meta.glob("../../../../packages/shared/src/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const readers = Object.entries(sources)
      .filter(([f, text]) => !f.endsWith(".test.ts") && !f.endsWith("/net/input.ts") && !f.endsWith("/bots/botPolicy.ts") && /\.isMouse\b/.test(text))
      .map(([f]) => f.slice(f.indexOf("/src/") + 5));
    expect(readers).toEqual(["combat/firing.ts"]);
    expect(sources[Object.keys(sources).find((f) => f.endsWith("/combat/firing.ts")) as string]).toMatch(/if \(!input\.isMouse\) \{\s*\n[^\n]*\n\s*assistAim\(/);
  });
});
