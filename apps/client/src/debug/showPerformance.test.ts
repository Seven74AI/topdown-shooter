import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({}));

describe("Story 10.1 (B7): Show performance drives the Story 1.11 overlay", async () => {
  const { bindShowPerformance } = await import("./perfProbe");
  const { resetSettingsCache, saveSettings } = await import("../settings/settings");
  afterEach(() => resetSettingsCache());
  it("on at start when set; a change sets the overlay at once; other settings changes leave a tap's toggle alone", () => {
    saveSettings({ showPerformance: true });
    const perf = { overlayOn: false };
    const off = bindShowPerformance(perf);
    expect(perf.overlayOn).toBe(true);
    perf.overlayOn = false; // a three-finger tap
    saveSettings({ rain: "off" });
    expect(perf.overlayOn).toBe(false);
    saveSettings({ showPerformance: false });
    expect(perf.overlayOn).toBe(false);
    saveSettings({ showPerformance: true });
    expect(perf.overlayOn).toBe(true);
    off();
    saveSettings({ showPerformance: false });
    expect(perf.overlayOn).toBe(true);
  });
  it("off by default: the overlay stays as ?debug=1 left it", () => {
    const perf = { overlayOn: false };
    bindShowPerformance(perf);
    expect(perf.overlayOn).toBe(false);
  });
});
