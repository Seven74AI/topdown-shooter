import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_DPR, dpr, setDprCap } from "../display";
import { bindResolution, deviceSize } from "./resolution";
import { resetSettingsCache, saveSettings } from "./settings";

describe("Story 10.2-Q2 A: Resolution caps dpr() and re-sizes the canvas live", () => {
  afterEach(() => {
    setDprCap(MAX_DPR);
    resetSettingsCache();
    vi.unstubAllGlobals();
  });

  it("Sharp 2 / Balanced 1.5 / Fast 1 on a DPR 3 phone; never above the device's own ratio", () => {
    vi.stubGlobal("window", { devicePixelRatio: 3 });
    const calls: string[] = [];
    const game = { scale: { resize: (w: number, h: number) => calls.push(`resize ${w}×${h}`), setZoom: (z: number) => calls.push(`zoom ${z}`) } };
    const unbind = bindResolution(game, () => [844, 390]);
    expect(dpr()).toBe(2);
    expect(deviceSize(844, 390)).toEqual([1688, 780]);
    saveSettings({ resolution: "balanced" });
    expect(dpr()).toBe(1.5);
    saveSettings({ resolution: "fast" });
    expect(dpr()).toBe(1);
    expect(calls).toEqual(["resize 1266×585", `zoom ${1 / 1.5}`, "resize 844×390", "zoom 1"]);
    saveSettings({ rain: "off" }); // another field: no re-size
    expect(calls).toHaveLength(4);
    unbind();
    vi.stubGlobal("window", { devicePixelRatio: 1.25 });
    setDprCap(1.5);
    expect(dpr()).toBe(1.25);
  });
});
